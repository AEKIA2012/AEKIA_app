-- =========================================================
-- AEKIA PATCH V12 - CIERRE DE PUBLICACIÓN, FAMILIA Y LISTAS
-- Ejecutar después del patch 014/v11.
-- =========================================================

-- 1) Orden manual para listas de acceso.
alter table public.access_list_members
  add column if not exists sort_order integer;

alter table public.access_list_external_people
  add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (partition by access_list_id order by coalesce(sort_order, 999999), created_at, id) as rn
  from public.access_list_members
)
update public.access_list_members alm
set sort_order = ranked.rn
from ranked
where ranked.id = alm.id;

with ranked as (
  select id, row_number() over (partition by access_list_id order by coalesce(sort_order, 999999), full_name, created_at, id) as rn
  from public.access_list_external_people
)
update public.access_list_external_people alep
set sort_order = ranked.rn
from ranked
where ranked.id = alep.id;

create index if not exists access_list_members_sort_idx
on public.access_list_members (access_list_id, sort_order, created_at);

create index if not exists access_list_external_people_sort_idx
on public.access_list_external_people (access_list_id, sort_order, full_name);

-- 2) Visualizar como:
--    - Admin/roles puede ver todos.
--    - Usuario normal/familia solo perfiles activos con el MISMO correo.
--    - Ya no se usa members.view como permiso de impersonación global,
--      para que roles operativos como Accesos no vean usuarios ajenos.
create or replace function public.aekia_available_view_as_profiles()
returns table (
  id uuid,
  display_name text,
  email text,
  member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_email text;
  v_can_global_view_as boolean := false;
begin
  select up.id, up.email
  into v_profile_id, v_email
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;

  if v_profile_id is null then
    return;
  end if;

  v_can_global_view_as := public.current_user_has_permission('roles.view_admin')
    or public.current_user_has_permission('roles.edit')
    or public.current_user_has_permission('roles.manage')
    or public.current_user_has_permission('audit_logs.view');

  if v_can_global_view_as then
    return query
    select
      up.id,
      coalesce(nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''), up.display_name, up.email) as display_name,
      up.email,
      up.member_id
    from public.user_profiles up
    left join public.members m on m.id = up.member_id
    where up.status = 'active'
    order by case when up.id = v_profile_id then 0 else 1 end,
      coalesce(nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''), up.display_name, up.email);
  else
    return query
    select
      up.id,
      coalesce(nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''), up.display_name, up.email) as display_name,
      up.email,
      up.member_id
    from public.user_profiles up
    left join public.members m on m.id = up.member_id
    where up.status = 'active'
      and lower(trim(coalesce(up.email, ''))) = lower(trim(coalesce(v_email, '')))
    order by case when up.id = v_profile_id then 0 else 1 end,
      coalesce(nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''), up.display_name, up.email);
  end if;
end;
$$;

grant execute on function public.aekia_available_view_as_profiles() to authenticated;

create or replace function public.aekia_permission_codes_for_profile(p_profile_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[] := array[]::text[];
  v_current_email text;
  v_target_email text;
  v_authorized boolean := false;
begin
  select up.email into v_current_email
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;

  select up.email into v_target_email
  from public.user_profiles up
  where up.id = p_profile_id
    and up.status = 'active'
  limit 1;

  v_authorized := public.current_user_has_permission('roles.view_admin')
    or public.current_user_has_permission('roles.edit')
    or public.current_user_has_permission('roles.manage')
    or public.current_user_has_permission('audit_logs.view')
    or lower(trim(coalesce(v_current_email, ''))) = lower(trim(coalesce(v_target_email, '')));

  if not v_authorized then
    raise exception 'No autorizado para visualizar permisos de otro usuario.';
  end if;

  select coalesce(array_agg(distinct p.code order by p.code), array[]::text[])
  into v_codes
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_profile_id = p_profile_id
    and ur.status = 'active'
    and r.status = 'active';

  if not ('member' = any(v_codes)) then
    v_codes := coalesce(v_codes, array[]::text[]) || 'member';
  end if;

  return v_codes;
end;
$$;

grant execute on function public.aekia_permission_codes_for_profile(uuid) to authenticated;

-- 3) Elegibilidad servidor. Se mantiene para reportes/alertas y como respaldo.
-- La app v12 además calcula asistencia en frontend con la misma lógica de Mi asistencia.
create or replace function public.aekia_member_event_eligibility(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := (current_date - interval '3 months')::date;
  v_to date := current_date;
  v_total_class_weeks integer := 0;
  v_required_attendances integer := 0;
  v_completed_weeks integer := 0;
  v_punctual_attendances integer := 0;
  v_attendance_percent integer := 100;
  v_monthly_debt integer := 0;
  v_other_debt integer := 0;
  v_payment_debt integer := 0;
  v_attendance_ok boolean := false;
  v_payments_ok boolean := false;
begin
  with practiced as (
    select md.discipline_id
    from public.member_disciplines md
    where md.member_id = p_member_id
      and md.practices = true
  ), has_practiced as (
    select exists(select 1 from practiced) as has_rows
  ), relevant_sessions as (
    select s.id, s.session_date::date as session_date
    from public.attendance_sessions s
    cross join has_practiced hp
    where coalesce(s.status, 'active') = 'active'
      and s.session_date::date between v_from and v_to
      and (hp.has_rows = false or s.discipline_id in (select discipline_id from practiced))
  ), class_weeks as (
    select distinct to_char(date_trunc('week', session_date), 'IYYY-IW') as week_key
    from relevant_sessions
  ), present_weeks as (
    select distinct to_char(date_trunc('week', rs.session_date), 'IYYY-IW') as week_key
    from public.attendance_records ar
    join relevant_sessions rs on rs.id = ar.session_id
    where ar.member_id = p_member_id
      and ar.attendance_status = 'present'
  )
  select
    (select count(*) from class_weeks),
    (select count(*) from present_weeks),
    (select count(*) from public.attendance_records ar join relevant_sessions rs on rs.id = ar.session_id where ar.member_id = p_member_id and ar.attendance_status = 'present')
  into v_total_class_weeks, v_completed_weeks, v_punctual_attendances;

  v_required_attendances := least(9, coalesce(v_total_class_weeks, 0));
  v_completed_weeks := least(coalesce(v_completed_weeks, 0), v_required_attendances);

  if v_required_attendances > 0 then
    v_attendance_percent := least(100, round((v_completed_weeks::numeric / v_required_attendances::numeric) * 100)::integer);
  else
    v_attendance_percent := 100;
  end if;

  v_attendance_ok := v_attendance_percent >= 100;

  select count(*)
  into v_monthly_debt
  from public.monthly_payment_periods mpp
  left join public.monthly_payments mp
    on mp.period_id = mpp.id
   and mp.member_id = p_member_id
  where mpp.payment_year = extract(year from current_date)::integer
    and mpp.payment_month <= extract(month from current_date)::integer
    and coalesce(mp.payment_status, 'pending') not in ('paid', 'waived', 'cancelled');

  select count(*)
  into v_other_debt
  from public.other_payment_assignments opa
  where opa.member_id = p_member_id
    and coalesce(opa.payment_status, 'pending') in ('pending', 'partial')
    and (opa.due_date is null or opa.due_date <= current_date);

  v_payment_debt := coalesce(v_monthly_debt, 0) + coalesce(v_other_debt, 0);
  v_payments_ok := v_payment_debt = 0;

  return jsonb_build_object(
    'eligible', v_attendance_ok and v_payments_ok,
    'attendance_ok', v_attendance_ok,
    'payments_ok', v_payments_ok,
    'attendance_percent', v_attendance_percent,
    'completed_weeks', v_completed_weeks,
    'total_class_weeks', v_total_class_weeks,
    'required_attendances', v_required_attendances,
    'punctual_attendances', v_punctual_attendances,
    'payment_debt_count', v_payment_debt,
    'monthly_debt_count', v_monthly_debt,
    'other_debt_count', v_other_debt,
    'from_date', v_from,
    'to_date', v_to
  );
end;
$$;

grant execute on function public.aekia_member_event_eligibility(uuid) to authenticated;

notify pgrst, 'reload schema';
