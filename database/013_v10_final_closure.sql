-- =========================================================
-- AEKIA PATCH V10 - cierre final: elegibilidad, roles, alertas y visualización
-- Ejecutar este archivo completo. No requiere ejecutar de nuevo el 012.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Limpiar/normalizar roles sin chocar con roles_name_key
-- ---------------------------------------------------------

-- Asegurar roles canónicos con nombres temporales únicos si hiciera falta.
insert into public.roles (code, name, description, status)
values
  ('member', 'Usuario', 'Usuario normal. Solo ve módulos personales.', 'active'),
  ('admin', 'Administrador', 'Acceso total con permisos de edición.', 'active'),
  ('comisaria', 'Comisaría', 'Revisión de asistencia general.', 'active'),
  ('tesoreria', 'Tesorería', 'Gestión de pagos.', 'active'),
  ('control_accesos_dojo', 'Control de Accesos a Dojo', 'Gestión de listas de acceso y nombres japoneses.', 'active'),
  ('mesa_directiva_consulta', 'Mesa directiva consulta temporal', 'Consulta general de módulos administrativos.', 'active')
on conflict (code) do nothing;

-- Migrar roles viejos/duplicados por código hacia los canónicos.
with role_map(old_code, new_code) as (
  values
    ('accesos', 'control_accesos_dojo'),
    ('comisario', 'comisaria'),
    ('tesorero', 'tesoreria'),
    ('mesa_directiva', 'mesa_directiva_consulta'),
    ('presidente', 'admin'),
    ('integrante', 'member')
), pairs as (
  select old_role.id as old_id, new_role.id as new_id
  from role_map rm
  join public.roles old_role on old_role.code = rm.old_code
  join public.roles new_role on new_role.code = rm.new_code
  where old_role.id <> new_role.id
), moved_permissions as (
  insert into public.role_permissions (role_id, permission_id)
  select p.new_id, rp.permission_id
  from pairs p
  join public.role_permissions rp on rp.role_id = p.old_id
  on conflict (role_id, permission_id) do nothing
  returning 1
), moved_users as (
  insert into public.user_roles (user_profile_id, role_id, status)
  select ur.user_profile_id, p.new_id, ur.status
  from pairs p
  join public.user_roles ur on ur.role_id = p.old_id
  on conflict (user_profile_id, role_id) do update set status = excluded.status
  returning 1
)
delete from public.roles r
using pairs p
where r.id = p.old_id;

-- Migrar cualquier rol no canónico que tenga nombre de rol canónico.
with canonical(code, name) as (
  values
    ('member', 'Usuario'),
    ('admin', 'Administrador'),
    ('comisaria', 'Comisaría'),
    ('tesoreria', 'Tesorería'),
    ('control_accesos_dojo', 'Control de Accesos a Dojo'),
    ('mesa_directiva_consulta', 'Mesa directiva')
), pairs as (
  select old_role.id as old_id, new_role.id as new_id
  from canonical c
  join public.roles old_role on old_role.name = c.name and old_role.code <> c.code
  join public.roles new_role on new_role.code = c.code
  where old_role.id <> new_role.id
), moved_permissions as (
  insert into public.role_permissions (role_id, permission_id)
  select p.new_id, rp.permission_id
  from pairs p
  join public.role_permissions rp on rp.role_id = p.old_id
  on conflict (role_id, permission_id) do nothing
  returning 1
), moved_users as (
  insert into public.user_roles (user_profile_id, role_id, status)
  select ur.user_profile_id, p.new_id, ur.status
  from pairs p
  join public.user_roles ur on ur.role_id = p.old_id
  on conflict (user_profile_id, role_id) do update set status = excluded.status
  returning 1
)
delete from public.roles r
using pairs p
where r.id = p.old_id;

-- Ahora sí, nombres finales sin conflicto.
update public.roles set name = 'Usuario', description = 'Usuario normal. Solo ve módulos personales.', status = 'active', updated_at = now() where code = 'member';
update public.roles set name = 'Administrador', description = 'Acceso total con permisos de edición.', status = 'active', updated_at = now() where code = 'admin';
update public.roles set name = 'Comisaría', description = 'Revisión de asistencia general.', status = 'active', updated_at = now() where code = 'comisaria';
update public.roles set name = 'Tesorería', description = 'Gestión de pagos.', status = 'active', updated_at = now() where code = 'tesoreria';
update public.roles set name = 'Control de Accesos a Dojo', description = 'Gestión de listas de acceso y nombres japoneses.', status = 'active', updated_at = now() where code = 'control_accesos_dojo';
update public.roles set name = 'Mesa directiva', description = 'Consulta general de módulos administrativos.', status = 'active', updated_at = now() where code = 'mesa_directiva_consulta';

-- Inactivar cualquier rol no canónico restante para que no estorbe en pantalla.
update public.roles
set status = 'inactive', updated_at = now()
where code not in ('member','admin','comisaria','tesoreria','control_accesos_dojo','mesa_directiva_consulta');

-- Permisos base.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'personal_data.view_own',
  'personal_data.update_own',
  'attendance.view_own',
  'payments.view_own',
  'events.register_own',
  'complaints.create_own'
)
where r.code = 'member'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'members.view',
  'members.edit',
  'members.japanese_name.edit',
  'access_lists.view_admin',
  'access_lists.edit'
)
where r.code = 'control_accesos_dojo'
on conflict (role_id, permission_id) do nothing;

-- Todo usuario activo debe tener rol Usuario.
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'member'
where up.status = 'active'
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Corregir perfiles familiares clave por miembro adulto, no por correo del menor.
update public.user_profiles up
set member_id = m.id, display_name = 'Rumi Watanabe', updated_at = now()
from public.members m
where lower(up.email) = lower('watarumi.39@gmail.com')
  and lower(m.first_names) = lower('Rumi')
  and lower(m.paternal_last_name) = lower('Watanabe');

update public.user_profiles up
set member_id = m.id, display_name = 'Isabel Nájera', updated_at = now()
from public.members m
where lower(up.email) = lower('isabelle_najera@hotmail.com')
  and lower(m.first_names) = lower('Isabel')
  and lower(m.paternal_last_name) in (lower('Najera'), lower('Nájera'));

update public.user_profiles up
set display_name = 'Juan Amador', updated_at = now()
where lower(email) = lower('eyedeep73@gmail.com');

update public.user_profiles up
set display_name = 'Alberto Castañeda', updated_at = now()
where lower(email) = lower('alberto_cascal@hotmail.com');

update public.user_profiles up
set display_name = 'Víctor Pineda', updated_at = now()
where lower(email) = lower('vicpiga@yahoo.com.mx');

-- Reafirmar asignaciones especiales por perfil ya corregido.
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'control_accesos_dojo'
where lower(up.email) = lower('watarumi.39@gmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'comisaria'
where lower(up.email) = lower('isabelle_najera@hotmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

-- ---------------------------------------------------------
-- 2) Elegibilidad: contar semanas cumplidas, no registros sueltos.
--    Una asistencia puntual en la semana cumple esa semana. Retardos no cuentan.
-- ---------------------------------------------------------
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
  with relevant_sessions as (
    select s.id, s.session_date::date as session_date
    from public.attendance_sessions s
    where coalesce(s.status, 'active') = 'active'
      and s.session_date::date between v_from and v_to
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
    and coalesce(opa.payment_status, 'pending') in ('pending', 'partial');

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

-- ---------------------------------------------------------
-- 3) Permisos de un perfil para "Visualizar como".
-- ---------------------------------------------------------
create or replace function public.aekia_permission_codes_for_profile(p_profile_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[];
begin
  if not (
    public.current_user_has_permission('roles.view_admin')
    or public.current_user_has_permission('roles.edit')
    or public.current_user_has_permission('roles.manage')
    or public.current_user_has_permission('members.view')
    or public.current_user_has_permission('members.manage')
  ) then
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

-- ---------------------------------------------------------
-- 4) Alertas para mesa directiva/admin con dismiss.
-- ---------------------------------------------------------

create or replace function public.aekia_dismiss_alert(p_alert_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select public.current_user_profile_id() into v_profile_id;
  if v_profile_id is null then
    raise exception 'No hay perfil activo.';
  end if;

  insert into public.user_alerts (user_profile_id, title, message, alert_type, status, source_module)
  values (v_profile_id, p_alert_key, p_alert_key, 'info', 'dismissed', 'system_alert:' || p_alert_key);
end;
$$;

grant execute on function public.aekia_dismiss_alert(text) to authenticated;

create or replace function public.aekia_current_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_alerts jsonb := '[]'::jsonb;
  v_open_complaints integer := 0;
  v_incomplete_members integer := 0;
  v_payment_debt_members integer := 0;
  v_key text;
  v_dismissed boolean;
begin
  select public.current_user_profile_id() into v_profile_id;
  if v_profile_id is null then
    return v_alerts;
  end if;

  -- Quejas abiertas / en proceso.
  if public.current_user_has_permission('complaints.view_admin') or public.current_user_has_permission('complaints.manage') then
    select count(*) into v_open_complaints
    from public.complaints_suggestions
    where status in ('open', 'in_process');

    v_key := 'complaints_open_' || v_open_complaints::text;
    select exists (
      select 1 from public.user_alerts
      where user_profile_id = v_profile_id
        and status = 'dismissed'
        and source_module = 'system_alert:' || v_key
    ) into v_dismissed;

    if v_open_complaints > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'key', v_key,
        'title', 'Quejas pendientes',
        'message', 'Hay ' || v_open_complaints::text || ' queja(s) o sugerencia(s) abiertas/en proceso.',
        'type', 'danger',
        'module', 'quejas'
      ));
    end if;
  end if;

  -- Datos incompletos de miembros activos.
  if public.current_user_has_permission('members.view') or public.current_user_has_permission('members.manage') then
    select count(*) into v_incomplete_members
    from public.members m
    where m.status = 'active'
      and (
        nullif(trim(coalesce(m.curp, '')), '') is null
        or nullif(trim(coalesce(m.email, '')), '') is null
        or nullif(trim(coalesce(m.phone, '')), '') is null
        or nullif(trim(coalesce(m.street, '')), '') is null
        or nullif(trim(coalesce(m.neighborhood, '')), '') is null
        or nullif(trim(coalesce(m.postal_code, '')), '') is null
        or not exists (select 1 from public.member_disciplines md where md.member_id = m.id and md.practices = true)
      );

    v_key := 'members_incomplete_' || v_incomplete_members::text;
    select exists (
      select 1 from public.user_alerts
      where user_profile_id = v_profile_id
        and status = 'dismissed'
        and source_module = 'system_alert:' || v_key
    ) into v_dismissed;

    if v_incomplete_members > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'key', v_key,
        'title', 'Datos por actualizar',
        'message', v_incomplete_members::text || ' miembro(s) activo(s) tienen datos personales o disciplinas incompletas.',
        'type', 'warning',
        'module', 'miembros'
      ));
    end if;
  end if;

  -- Miembros con adeudos.
  if public.current_user_has_permission('payments.view_admin') or public.current_user_has_permission('payments.manage') then
    with monthly_debt as (
      select distinct m.id
      from public.members m
      join public.monthly_payment_periods mpp
        on mpp.payment_year = extract(year from current_date)::integer
       and mpp.payment_month <= extract(month from current_date)::integer
      left join public.monthly_payments mp
        on mp.period_id = mpp.id
       and mp.member_id = m.id
      where m.status = 'active'
        and coalesce(mp.payment_status, 'pending') not in ('paid', 'waived', 'cancelled')
    ), other_debt as (
      select distinct opa.member_id as id
      from public.other_payment_assignments opa
      join public.members m on m.id = opa.member_id
      where m.status = 'active'
        and coalesce(opa.payment_status, 'pending') in ('pending', 'partial')
    )
    select count(distinct id) into v_payment_debt_members
    from (
      select id from monthly_debt
      union
      select id from other_debt
    ) debt;

    v_key := 'payments_debt_' || v_payment_debt_members::text;
    select exists (
      select 1 from public.user_alerts
      where user_profile_id = v_profile_id
        and status = 'dismissed'
        and source_module = 'system_alert:' || v_key
    ) into v_dismissed;

    if v_payment_debt_members > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'key', v_key,
        'title', 'Pagos pendientes',
        'message', v_payment_debt_members::text || ' miembro(s) tienen mensualidades u otros cargos pendientes.',
        'type', 'warning',
        'module', 'pagos'
      ));
    end if;
  end if;

  return v_alerts;
end;
$$;

grant execute on function public.aekia_current_alerts() to authenticated;

notify pgrst, 'reload schema';
