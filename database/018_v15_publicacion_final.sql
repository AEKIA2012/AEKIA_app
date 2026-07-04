-- =========================================================
-- AEKIA PATCH V15 - publicacion final, view-as efectivo y elegibilidad por registros del miembro
-- Ejecutar despues del 017/v14.
-- No reimportar datos.
-- =========================================================

-- 1) Visualizar como:
--    - Admin/mesa con permiso global puede ver cualquier perfil/miembro activo.
--    - Usuarios normales solo pueden ver perfiles/miembros activos relacionados por el mismo correo
--      o por relacion tutor-menor.
--    - Incluye menores con el mismo correo aunque no tengan user_profile propio.

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
  v_can_global_view_as boolean := false;
begin
  v_can_global_view_as := public.current_user_has_permission('roles.view_admin')
    or public.current_user_has_permission('roles.edit')
    or public.current_user_has_permission('roles.manage')
    or public.current_user_has_permission('audit_logs.view');

  return query
  with own_profiles as (
    select up.id, up.member_id, lower(trim(coalesce(up.email, m.email, ''))) as email_key
    from public.user_profiles up
    left join public.members m on m.id = up.member_id
    where up.auth_user_id = auth.uid()
      and up.status = 'active'
  ), related_emails as (
    select email_key from own_profiles where email_key <> ''
    union
    select lower(trim(coalesce(m.email, ''))) as email_key
    from public.members m
    join own_profiles op on op.member_id = m.id
    where lower(trim(coalesce(m.email, ''))) <> ''
  ), related_members as (
    select op.member_id as member_id from own_profiles op where op.member_id is not null
    union
    select mg.minor_member_id
    from public.member_guardians mg
    join own_profiles op on op.member_id = mg.guardian_member_id
    where mg.status = 'active'
      and mg.can_view_data = true
  ), profile_rows as (
    select distinct on (up.id)
      up.id,
      coalesce(
        nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''),
        up.display_name,
        up.email,
        m.email
      )::text as display_name,
      coalesce(up.email, m.email, '')::text as email,
      up.member_id,
      case
        when exists(select 1 from own_profiles op where op.id = up.id) then 0
        when exists(select 1 from related_members rm where rm.member_id = up.member_id) then 1
        else 2
      end as sort_bucket
    from public.user_profiles up
    left join public.members m on m.id = up.member_id
    where up.status = 'active'
      and (
        v_can_global_view_as
        or exists(select 1 from own_profiles op where op.id = up.id)
        or exists(select 1 from related_members rm where rm.member_id = up.member_id)
        or lower(trim(coalesce(up.email, ''))) in (select email_key from related_emails)
        or lower(trim(coalesce(m.email, ''))) in (select email_key from related_emails)
      )
    order by up.id, sort_bucket
  ), member_only_rows as (
    select distinct on (m.id)
      m.id,
      coalesce(
        nullif(trim(concat_ws(' ', m.first_names, m.paternal_last_name, nullif(m.maternal_last_name, '.'))), ''),
        m.email
      )::text as display_name,
      coalesce(m.email, '')::text as email,
      m.id as member_id,
      case
        when exists(select 1 from related_members rm where rm.member_id = m.id) then 1
        else 3
      end as sort_bucket
    from public.members m
    where m.status = 'active'
      and not exists (
        select 1
        from public.user_profiles up
        where up.member_id = m.id
          and up.status = 'active'
      )
      and (
        v_can_global_view_as
        or exists(select 1 from related_members rm where rm.member_id = m.id)
        or lower(trim(coalesce(m.email, ''))) in (select email_key from related_emails)
      )
    order by m.id, sort_bucket
  ), combined as (
    select * from profile_rows
    union all
    select * from member_only_rows
  )
  select c.id, c.display_name, c.email, c.member_id
  from combined c
  order by c.sort_bucket, c.display_name;
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
    allowed.id,
    up.auth_user_id,
    allowed.member_id,
    allowed.email,
    allowed.display_name,
    'active'::text as status
  from public.aekia_available_view_as_profiles() allowed
  left join public.user_profiles up on up.id = allowed.id
  where allowed.id = p_profile_id
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
  v_user_profile_id uuid;
begin
  select exists(
    select 1
    from public.aekia_available_view_as_profiles() allowed
    where allowed.id = p_profile_id
  ) into v_authorized;

  if not v_authorized then
    raise exception 'No autorizado para visualizar permisos de otro usuario.';
  end if;

  select up.id
  into v_user_profile_id
  from public.user_profiles up
  where up.id = p_profile_id
     or up.member_id = p_profile_id
  order by case when up.id = p_profile_id then 0 else 1 end
  limit 1;

  if v_user_profile_id is not null then
    select coalesce(array_agg(distinct p.code order by p.code), array[]::text[])
    into v_codes
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_profile_id = v_user_profile_id
      and ur.status = 'active'
      and r.status = 'active';
  end if;

  if not ('member' = any(coalesce(v_codes, array[]::text[]))) then
    v_codes := coalesce(v_codes, array[]::text[]) || 'member';
  end if;

  return v_codes;
end;
$$;

grant execute on function public.aekia_permission_codes_for_profile(uuid) to authenticated;

-- 2) Elegibilidad reglamentaria:
--    Se basa en los registros reales del miembro dentro del rango.
--    Esto evita que sesiones de otra disciplina o sesiones sin registro del miembro afecten el calculo.
--    Regla: hasta 3 asistencias puntuales por mes; si el mes tuvo menos registros/clases, baja el requerido.
--    Retardos no cuentan.

create or replace function public.aekia_member_event_eligibility(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := (current_date - interval '3 months')::date;
  v_to date := current_date;
  v_total_classes integer := 0;
  v_required_attendances integer := 0;
  v_completed_attendances integer := 0;
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
  ), member_record_sessions as (
    select distinct
      s.id,
      s.session_date::date as session_date,
      to_char(s.session_date::date, 'YYYY-MM') as month_key,
      ar.attendance_status
    from public.attendance_records ar
    join public.attendance_sessions s on s.id = ar.session_id
    cross join has_practiced hp
    where ar.member_id = p_member_id
      and coalesce(s.status, 'active') = 'active'
      and s.session_date::date between v_from and v_to
      and (hp.has_rows = false or s.discipline_id in (select discipline_id from practiced))
  ), class_count_by_month as (
    select month_key, count(distinct id)::integer as class_count
    from member_record_sessions
    group by month_key
  ), present_count_by_month as (
    select month_key, count(distinct id)::integer as present_count
    from member_record_sessions
    where attendance_status = 'present'
    group by month_key
  ), monthly_calc as (
    select
      c.month_key,
      c.class_count,
      least(3, c.class_count)::integer as required_count,
      least(coalesce(p.present_count, 0), least(3, c.class_count))::integer as completed_count
    from class_count_by_month c
    left join present_count_by_month p on p.month_key = c.month_key
  )
  select
    coalesce(sum(class_count), 0)::integer,
    coalesce(sum(required_count), 0)::integer,
    coalesce(sum(completed_count), 0)::integer,
    coalesce((select count(distinct id) from member_record_sessions where attendance_status = 'present'), 0)::integer
  into v_total_classes, v_required_attendances, v_completed_attendances, v_punctual_attendances
  from monthly_calc;

  if v_required_attendances > 0 then
    v_attendance_percent := least(100, round((v_completed_attendances::numeric / v_required_attendances::numeric) * 100)::integer);
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
    'completed_weeks', v_completed_attendances,
    'total_class_weeks', v_total_classes,
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
