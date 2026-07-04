-- =========================================================
-- AEKIA PATCH V09 - cálculo final, roles limpios y visualización como usuario
-- =========================================================

-- 1) Roles canónicos: migrar duplicados y dejar lista limpia.
--    Se conservan únicamente los roles operativos usados por la app.
with role_map(old_code, new_code) as (
  values
    ('accesos', 'control_accesos_dojo'),
    ('comisario', 'comisaria'),
    ('tesorero', 'tesoreria'),
    ('mesa_directiva', 'mesa_directiva_consulta'),
    ('presidente', 'admin'),
    ('integrante', 'member')
), moved_permissions as (
  insert into public.role_permissions (role_id, permission_id)
  select new_role.id, rp.permission_id
  from role_map rm
  join public.roles old_role on old_role.code = rm.old_code
  join public.roles new_role on new_role.code = rm.new_code
  join public.role_permissions rp on rp.role_id = old_role.id
  on conflict (role_id, permission_id) do nothing
  returning 1
), moved_users as (
  insert into public.user_roles (user_profile_id, role_id, status)
  select ur.user_profile_id, new_role.id, ur.status
  from role_map rm
  join public.roles old_role on old_role.code = rm.old_code
  join public.roles new_role on new_role.code = rm.new_code
  join public.user_roles ur on ur.role_id = old_role.id
  on conflict (user_profile_id, role_id) do update set status = excluded.status
  returning 1
)
delete from public.role_permissions rp
using public.roles r, role_map rm
where rp.role_id = r.id
  and r.code = rm.old_code;

with role_map(old_code, new_code) as (
  values
    ('accesos', 'control_accesos_dojo'),
    ('comisario', 'comisaria'),
    ('tesorero', 'tesoreria'),
    ('mesa_directiva', 'mesa_directiva_consulta'),
    ('presidente', 'admin'),
    ('integrante', 'member')
)
delete from public.user_roles ur
using public.roles r, role_map rm
where ur.role_id = r.id
  and r.code = rm.old_code;

with role_map(old_code, new_code) as (
  values
    ('accesos', 'control_accesos_dojo'),
    ('comisario', 'comisaria'),
    ('tesorero', 'tesoreria'),
    ('mesa_directiva', 'mesa_directiva_consulta'),
    ('presidente', 'admin'),
    ('integrante', 'member')
)
delete from public.roles r
using role_map rm
where r.code = rm.old_code;

update public.roles set name = 'Mesa directiva', description = 'Consulta general de módulos administrativos.' where code = 'mesa_directiva_consulta';
update public.roles set name = 'Usuario', description = 'Usuario normal. Solo ve módulos personales.' where code = 'member';
update public.roles set name = 'Administrador', description = 'Acceso total con permisos de edición.' where code = 'admin';
update public.roles set name = 'Comisaría', description = 'Revisión de asistencia general.' where code = 'comisaria';
update public.roles set name = 'Tesorería', description = 'Gestión de pagos.' where code = 'tesoreria';
update public.roles set name = 'Control de Accesos a Dojo', description = 'Gestión de listas de acceso y nombres japoneses.' where code = 'control_accesos_dojo';

-- 2) Asegurar permisos base del rol Control de Accesos y rol normal.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('members.view', 'members.edit', 'members.japanese_name.edit', 'access_lists.view_admin', 'access_lists.edit')
where r.code = 'control_accesos_dojo'
on conflict (role_id, permission_id) do nothing;

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

-- Todo usuario activo debe tener rol Usuario.
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'member'
where up.status = 'active'
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Reafirmar asignaciones especiales.
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

-- Para que Rumi/Isabel/etc. se vean por nombre aunque el correo familiar venga de hijos.
update public.user_profiles
set display_name = 'Rumi Watanabe', updated_at = now()
where lower(email) = lower('watarumi.39@gmail.com');

update public.user_profiles
set display_name = 'Isabel Nájera', updated_at = now()
where lower(email) = lower('isabelle_najera@hotmail.com');

update public.user_profiles
set display_name = 'Juan Amador', updated_at = now()
where lower(email) = lower('eyedeep73@gmail.com');

update public.user_profiles
set display_name = 'Alberto Castañeda', updated_at = now()
where lower(email) = lower('alberto_cascal@hotmail.com');

update public.user_profiles
set display_name = 'Víctor Pineda', updated_at = now()
where lower(email) = lower('vicpiga@yahoo.com.mx');

-- 3) Trigger para que nuevos perfiles activos reciban rol Usuario automáticamente.
create or replace function public.aekia_assign_member_role_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if new.status = 'active' then
    select id into v_role_id from public.roles where code = 'member' limit 1;
    if v_role_id is not null then
      insert into public.user_roles (user_profile_id, role_id, status)
      values (new.id, v_role_id, 'active')
      on conflict (user_profile_id, role_id) do update set status = 'active';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_aekia_assign_member_role_to_profile on public.user_profiles;
create trigger trg_aekia_assign_member_role_to_profile
after insert or update of status on public.user_profiles
for each row
execute function public.aekia_assign_member_role_to_profile();

-- 4) Elegibilidad final: 9 asistencias puntuales en 3 meses, ajustado a semanas reales con clase.
--    Retardos no cuentan. Adeudo considera mensualidades y otros cargos pendientes/parciales.
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
  v_punctual_attendances integer := 0;
  v_completed integer := 0;
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
  ), relevant_sessions as (
    select s.id, s.session_date::date as session_date
    from public.attendance_sessions s
    where s.status = 'active'
      and s.session_date::date between v_from and v_to
      and (
        not exists (select 1 from practiced)
        or s.discipline_id in (select discipline_id from practiced)
      )
  ), class_weeks as (
    select distinct to_char(date_trunc('week', session_date), 'IYYY-IW') as week_key
    from relevant_sessions
  )
  select count(*) into v_total_class_weeks from class_weeks;

  select count(*)
  into v_punctual_attendances
  from public.attendance_records ar
  join relevant_sessions rs on rs.id = ar.session_id
  where ar.member_id = p_member_id
    and ar.attendance_status = 'present';

  v_required_attendances := least(9, v_total_class_weeks);
  v_completed := least(v_punctual_attendances, v_required_attendances);

  if v_required_attendances > 0 then
    v_attendance_percent := least(100, round((v_completed::numeric / v_required_attendances::numeric) * 100)::integer);
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
    'completed_weeks', v_completed,
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

-- 5) Permisos de consulta para admins en visualización como usuario y exportes.
alter table public.member_disciplines enable row level security;

drop policy if exists member_disciplines_select_self_or_admin_v09 on public.member_disciplines;
create policy member_disciplines_select_self_or_admin_v09
on public.member_disciplines
for select
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('members.view')
  or public.current_user_has_permission('events.view_admin')
);

notify pgrst, 'reload schema';
