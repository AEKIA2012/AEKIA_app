-- =========================================================
-- AEKIA PATCH V13 - CIERRE FINAL
-- Ejecutar después del patch 015/v12.
-- =========================================================

-- 1) Visualizar como robusto:
--    - Admin/roles/auditoría puede ver todos los perfiles activos.
--    - Usuarios/familia solo pueden ver perfiles activos con el mismo correo
--      del perfil o del miembro, y menores vinculados como tutor.

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
  v_member_id uuid;
  v_email text;
  v_member_email text;
  v_can_global_view_as boolean := false;
begin
  select up.id, up.member_id, up.email, m.email
  into v_profile_id, v_member_id, v_email, v_member_email
  from public.user_profiles up
  left join public.members m on m.id = up.member_id
  where up.auth_user_id = auth.uid()
    and up.status = 'active'
  limit 1;

  if v_profile_id is null then
    return;
  end if;

  v_can_global_view_as := public.current_user_has_permission('roles.view_admin')
    or public.current_user_has_permission('roles.edit')
    or public.current_user_has_permission('roles.manage')
    or public.current_user_has_permission('audit_logs.view');

  return query
  select
    up.id,
    coalesce(nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''), up.display_name, up.email, m.email) as display_name,
    coalesce(up.email, m.email, '') as email,
    up.member_id
  from public.user_profiles up
  left join public.members m on m.id = up.member_id
  where up.status = 'active'
    and (
      v_can_global_view_as
      or up.id = v_profile_id
      or lower(trim(coalesce(up.email, ''))) = lower(trim(coalesce(v_email, '')))
      or lower(trim(coalesce(up.email, ''))) = lower(trim(coalesce(v_member_email, '')))
      or lower(trim(coalesce(m.email, ''))) = lower(trim(coalesce(v_email, '')))
      or lower(trim(coalesce(m.email, ''))) = lower(trim(coalesce(v_member_email, '')))
      or exists (
        select 1
        from public.member_guardians mg
        where mg.guardian_member_id = v_member_id
          and mg.minor_member_id = up.member_id
          and mg.status = 'active'
          and mg.can_view_data = true
      )
    )
  order by case when up.id = v_profile_id then 0 else 1 end,
    coalesce(nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''), up.display_name, up.email, m.email);
end;
$$;

grant execute on function public.aekia_available_view_as_profiles() to authenticated;

create or replace function public.aekia_profile_for_view_as(p_profile_id uuid)
returns table (
  id uuid,
  auth_user_id uuid,
  member_id uuid,
  email text,
  display_name text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    up.id,
    up.auth_user_id,
    up.member_id,
    coalesce(up.email, m.email, '') as email,
    coalesce(nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''), up.display_name, up.email, m.email) as display_name,
    up.status
  from public.aekia_available_view_as_profiles() allowed
  join public.user_profiles up on up.id = allowed.id
  left join public.members m on m.id = up.member_id
  where up.id = p_profile_id
    and up.status = 'active'
  limit 1;
end;
$$;

grant execute on function public.aekia_profile_for_view_as(uuid) to authenticated;

create or replace function public.aekia_permission_codes_for_profile(p_profile_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[] := array[]::text[];
  v_authorized boolean := false;
begin
  select exists(
    select 1
    from public.aekia_available_view_as_profiles() allowed
    where allowed.id = p_profile_id
  ) into v_authorized;

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

-- 2) Elegibilidad final:
--    - Solo cuenta asistencia puntual.
--    - Una asistencia puntual cumple la semana.
--    - Por mes se piden hasta 3 semanas cumplidas.
--    - Si ese mes tuvo menos semanas reales con clase, baja el requerido.
--    - Otros cargos solo son adeudo si ya venció la fecha límite.

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
    select
      s.id,
      s.session_date::date as session_date,
      to_char(s.session_date::date, 'YYYY-MM') as month_key,
      to_char(date_trunc('week', s.session_date::date), 'IYYY-IW') as week_key
    from public.attendance_sessions s
    cross join has_practiced hp
    where coalesce(s.status, 'active') = 'active'
      and s.session_date::date between v_from and v_to
      and (hp.has_rows = false or s.discipline_id in (select discipline_id from practiced))
  ), class_weeks_by_month as (
    select month_key, count(distinct week_key)::integer as class_weeks
    from relevant_sessions
    group by month_key
  ), present_weeks_by_month as (
    select rs.month_key, count(distinct rs.week_key)::integer as present_weeks
    from public.attendance_records ar
    join relevant_sessions rs on rs.id = ar.session_id
    where ar.member_id = p_member_id
      and ar.attendance_status = 'present'
    group by rs.month_key
  ), monthly_calc as (
    select
      c.month_key,
      c.class_weeks,
      least(3, c.class_weeks)::integer as required_weeks,
      least(coalesce(p.present_weeks, 0), least(3, c.class_weeks))::integer as completed_weeks
    from class_weeks_by_month c
    left join present_weeks_by_month p on p.month_key = c.month_key
  )
  select
    coalesce(sum(class_weeks), 0)::integer,
    coalesce(sum(required_weeks), 0)::integer,
    coalesce(sum(completed_weeks), 0)::integer,
    coalesce((
      select count(*)
      from public.attendance_records ar
      join relevant_sessions rs on rs.id = ar.session_id
      where ar.member_id = p_member_id
        and ar.attendance_status = 'present'
    ), 0)::integer
  into v_total_class_weeks, v_required_attendances, v_completed_weeks, v_punctual_attendances
  from monthly_calc;

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
