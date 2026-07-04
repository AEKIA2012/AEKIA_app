-- =========================================================
-- AEKIA 008 - ROLES, PERMISOS, MENÚS Y MODO SOLO LECTURA
-- Ejecutar después de 006 y 007. Es idempotente.
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- =========================================================
-- 1. Funciones de login que usa el frontend
-- =========================================================

drop function if exists public.aekia_login_email_status(text);

create or replace function public.aekia_login_email_status(input_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_status text;
begin
  select up.status
  into profile_status
  from public.user_profiles up
  where lower(trim(up.email)) = lower(trim(input_email))
  order by up.created_at desc
  limit 1;

  if profile_status is null then
    return 'not_registered';
  end if;

  if profile_status <> 'active' then
    return 'inactive';
  end if;

  return 'registered';
end;
$$;

grant execute on function public.aekia_login_email_status(text) to anon;
grant execute on function public.aekia_login_email_status(text) to authenticated;


drop function if exists public.aekia_mark_password_changed();

create or replace function public.aekia_mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set
    must_change_password = false,
    updated_at = now()
  where auth_user_id = auth.uid();
end;
$$;

grant execute on function public.aekia_mark_password_changed() to authenticated;


drop function if exists public.admin_reset_member_password(uuid);

create or replace function public.admin_reset_member_password(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_auth_user_id uuid;
  v_member_email text;
  v_can_reset boolean;
begin
  select public.current_user_has_permission('members.edit')
    or public.current_user_has_permission('members.manage')
    or public.current_user_has_permission('roles.edit')
  into v_can_reset;

  if not coalesce(v_can_reset, false) then
    raise exception 'No autorizado para reiniciar passwords.';
  end if;

  select
    up.auth_user_id,
    coalesce(up.email, m.email)
  into
    v_auth_user_id,
    v_member_email
  from public.members m
  left join public.user_profiles up
    on up.member_id = m.id
  where m.id = p_member_id
  order by up.auth_user_id is null
  limit 1;

  if v_auth_user_id is null then
    raise exception 'El miembro no tiene usuario de login vinculado.';
  end if;

  update auth.users
  set
    encrypted_password = extensions.crypt('12345678', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = v_auth_user_id;

  update public.user_profiles
  set
    must_change_password = true,
    updated_at = now()
  where auth_user_id = v_auth_user_id;

  return 'Password reiniciado a 12345678 para ' || coalesce(v_member_email, 'usuario') || '. El usuario deberá cambiarlo al entrar.';
end;
$$;

grant execute on function public.admin_reset_member_password(uuid) to authenticated;

-- =========================================================
-- 2. Permisos nuevos: vista admin y edición separados
-- =========================================================

insert into public.permissions (code, name, description, module)
values
  ('members.view', 'Ver miembros', 'Permite consultar lista y detalle de miembros.', 'Gestión miembros'),
  ('members.edit', 'Editar miembros', 'Permite crear, editar, activar/inactivar y reiniciar password de miembros.', 'Gestión miembros'),
  ('attendance.view_admin', 'Ver control de asistencia', 'Permite consultar y exportar asistencia general.', 'Control asistencia'),
  ('attendance.edit', 'Editar control de asistencia', 'Permite crear sesiones y registrar asistencia.', 'Control asistencia'),
  ('payments.view_admin', 'Ver control de pagos', 'Permite consultar y exportar pagos generales.', 'Control pagos'),
  ('payments.edit', 'Editar control de pagos', 'Permite modificar mensualidades y otros pagos.', 'Control pagos'),
  ('events.view_admin', 'Ver gestión de eventos', 'Permite consultar eventos y registros.', 'Gestión eventos'),
  ('events.edit', 'Editar gestión de eventos', 'Permite crear eventos y cambiar estatus.', 'Gestión eventos'),
  ('complaints.view_admin', 'Ver gestión de quejas', 'Permite consultar quejas y sugerencias.', 'Gestión quejas'),
  ('complaints.edit', 'Editar gestión de quejas', 'Permite actualizar estatus y cerrar quejas.', 'Gestión quejas'),
  ('access_lists.view_admin', 'Ver listas de acceso', 'Permite consultar y exportar listas de acceso.', 'Listas de acceso'),
  ('access_lists.edit', 'Editar listas de acceso', 'Permite crear listas y asignar miembros/externos.', 'Listas de acceso'),
  ('roles.view_admin', 'Ver roles y permisos', 'Permite consultar roles, permisos y asignaciones.', 'Roles'),
  ('roles.edit', 'Editar roles y permisos', 'Permite crear roles y modificar asignaciones.', 'Roles')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  module = excluded.module;

insert into public.roles (code, name, description, status)
values
  ('member', 'Usuario', 'Usuario normal. Solo ve módulos personales.', 'active'),
  ('admin', 'Administrador', 'Acceso total con permisos de edición.', 'active'),
  ('comisaria', 'Comisaría', 'Revisión de asistencia general.', 'active'),
  ('tesoreria', 'Tesorería', 'Gestión de pagos.', 'active'),
  ('control_accesos_dojo', 'Control de Accesos a Dojo', 'Gestión de listas de acceso al dojo.', 'active'),
  ('mesa_directiva_consulta', 'Mesa directiva - consulta', 'Acceso de solo lectura a módulos administrativos.', 'active')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status;

-- Rehacer permisos de estos roles para evitar arrastres de pruebas anteriores.
delete from public.role_permissions
where role_id in (
  select id from public.roles
  where code in ('member', 'admin', 'comisaria', 'tesoreria', 'control_accesos_dojo', 'mesa_directiva_consulta')
);

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
cross join public.permissions p
where r.code = 'admin'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('members.view', 'attendance.view_admin')
where r.code = 'comisaria'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('members.view', 'payments.view_admin', 'payments.edit')
where r.code = 'tesoreria'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('members.view', 'access_lists.view_admin', 'access_lists.edit')
where r.code = 'control_accesos_dojo'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'members.view',
  'attendance.view_admin',
  'payments.view_admin',
  'events.view_admin',
  'complaints.view_admin',
  'access_lists.view_admin',
  'roles.view_admin'
)
where r.code = 'mesa_directiva_consulta'
on conflict (role_id, permission_id) do nothing;

-- =========================================================
-- 3. Asignaciones reales solicitadas
-- Limpia pruebas previas y deja todos como usuarios normales + roles específicos.
-- =========================================================

delete from public.user_roles;

insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
cross join public.roles r
where up.status = 'active'
  and r.code = 'member'
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Administrador principal
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'admin'
where lower(up.email) = lower('kendoaguascalientesaekia@gmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Isabel Nájera: Comisaría / asistencia
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'comisaria'
where lower(up.email) = lower('isabelle_najera@hotmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Juan Amador: Tesorería / pagos
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'tesoreria'
where lower(up.email) = lower('eyedeep73@gmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Rumi Watanabe: Control de Accesos a Dojo / listas
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'control_accesos_dojo'
where lower(up.email) = lower('watarumi.39@gmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Alberto Castañeda y Víctor Pineda: mesa directiva de consulta
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'mesa_directiva_consulta'
where lower(up.email) in (
  lower('alberto_cascal@hotmail.com'),
  lower('vicpiga@yahoo.com.mx')
)
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Asegurar que Luis quede solo como usuario normal, salvo que se le asigne algo después.
delete from public.user_roles ur
using public.user_profiles up, public.roles r
where ur.user_profile_id = up.id
  and ur.role_id = r.id
  and lower(up.email) = lower('lcaxag@hotmail.com')
  and r.code <> 'member';

-- =========================================================
-- 4. Funciones de permisos para frontend y RLS
-- =========================================================

create or replace function public.current_user_has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.user_roles ur on ur.user_profile_id = up.id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where up.auth_user_id = auth.uid()
      and up.status = 'active'
      and ur.status = 'active'
      and p.code = permission_code
  );
$$;

drop function if exists public.aekia_current_permission_codes();

create or replace function public.aekia_current_permission_codes()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.code order by p.code), array[]::text[])
  from public.user_profiles up
  join public.user_roles ur on ur.user_profile_id = up.id
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where up.auth_user_id = auth.uid()
    and up.status = 'active'
    and ur.status = 'active';
$$;

grant execute on function public.aekia_current_permission_codes() to authenticated;

-- =========================================================
-- 5. RLS: separar vista y edición
-- =========================================================

-- User profiles
drop policy if exists "user_profiles_admin_select" on public.user_profiles;
create policy "user_profiles_admin_select"
on public.user_profiles
for select
to authenticated
using (
  public.current_user_has_permission('members.view')
  or public.current_user_has_permission('members.edit')
  or public.current_user_has_permission('members.manage')
  or public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists "user_profiles_admin_update" on public.user_profiles;
create policy "user_profiles_admin_update"
on public.user_profiles
for update
to authenticated
using (
  public.current_user_has_permission('members.edit')
  or public.current_user_has_permission('members.manage')
  or public.current_user_has_permission('roles.edit')
)
with check (
  public.current_user_has_permission('members.edit')
  or public.current_user_has_permission('members.manage')
  or public.current_user_has_permission('roles.edit')
);

-- Members
drop policy if exists "members_admin_all" on public.members;
drop policy if exists "members_admin_edit" on public.members;
create policy "members_admin_edit"
on public.members
for all
to authenticated
using (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'));

drop policy if exists members_admin_select_v05 on public.members;
create policy members_admin_select_v05
on public.members
for select
to authenticated
using (
  public.current_user_has_permission('members.view')
  or public.current_user_has_permission('members.edit')
  or public.current_user_has_permission('members.manage')
);

-- Member disciplines
drop policy if exists "member_disciplines_admin_all" on public.member_disciplines;
drop policy if exists "member_disciplines_admin_edit" on public.member_disciplines;
create policy "member_disciplines_admin_edit"
on public.member_disciplines
for all
to authenticated
using (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'));

drop policy if exists member_disciplines_admin_select_v05 on public.member_disciplines;
create policy member_disciplines_admin_select_v05
on public.member_disciplines
for select
to authenticated
using (
  public.current_user_has_permission('members.view')
  or public.current_user_has_permission('members.edit')
  or public.current_user_has_permission('members.manage')
);

-- Attendance
drop policy if exists attendance_sessions_select_auth on public.attendance_sessions;
create policy attendance_sessions_select_auth on public.attendance_sessions
for select to authenticated using (true);

drop policy if exists attendance_sessions_admin_all on public.attendance_sessions;
drop policy if exists attendance_sessions_admin_edit on public.attendance_sessions;
create policy attendance_sessions_admin_edit
on public.attendance_sessions
for all
to authenticated
using (public.current_user_has_permission('attendance.edit') or public.current_user_has_permission('attendance.manage'))
with check (public.current_user_has_permission('attendance.edit') or public.current_user_has_permission('attendance.manage'));

drop policy if exists attendance_records_select_own_or_admin on public.attendance_records;
create policy attendance_records_select_own_or_admin
on public.attendance_records
for select
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('attendance.view_admin')
  or public.current_user_has_permission('attendance.edit')
  or public.current_user_has_permission('attendance.manage')
);

drop policy if exists attendance_records_admin_all on public.attendance_records;
drop policy if exists attendance_records_admin_edit on public.attendance_records;
create policy attendance_records_admin_edit
on public.attendance_records
for all
to authenticated
using (public.current_user_has_permission('attendance.edit') or public.current_user_has_permission('attendance.manage'))
with check (public.current_user_has_permission('attendance.edit') or public.current_user_has_permission('attendance.manage'));

-- Payments
drop policy if exists monthly_payments_select_own_or_admin on public.monthly_payments;
create policy monthly_payments_select_own_or_admin
on public.monthly_payments
for select
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('payments.view_admin')
  or public.current_user_has_permission('payments.edit')
  or public.current_user_has_permission('payments.manage')
);

drop policy if exists monthly_payments_admin_all on public.monthly_payments;
drop policy if exists monthly_payments_admin_edit on public.monthly_payments;
create policy monthly_payments_admin_edit
on public.monthly_payments
for all
to authenticated
using (public.current_user_has_permission('payments.edit') or public.current_user_has_permission('payments.manage'))
with check (public.current_user_has_permission('payments.edit') or public.current_user_has_permission('payments.manage'));

drop policy if exists other_payments_select_own_or_admin on public.other_payment_assignments;
create policy other_payments_select_own_or_admin
on public.other_payment_assignments
for select
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('payments.view_admin')
  or public.current_user_has_permission('payments.edit')
  or public.current_user_has_permission('payments.manage')
);

drop policy if exists other_payments_admin_all on public.other_payment_assignments;
drop policy if exists other_payments_admin_edit on public.other_payment_assignments;
create policy other_payments_admin_edit
on public.other_payment_assignments
for all
to authenticated
using (public.current_user_has_permission('payments.edit') or public.current_user_has_permission('payments.manage'))
with check (public.current_user_has_permission('payments.edit') or public.current_user_has_permission('payments.manage'));

drop policy if exists other_payment_types_admin_all on public.other_payment_types;
drop policy if exists other_payment_types_admin_edit on public.other_payment_types;
create policy other_payment_types_admin_edit
on public.other_payment_types
for all
to authenticated
using (public.current_user_has_permission('payments.edit') or public.current_user_has_permission('payments.manage'))
with check (public.current_user_has_permission('payments.edit') or public.current_user_has_permission('payments.manage'));

drop policy if exists payment_logs_admin_select on public.payment_logs;
create policy payment_logs_admin_select
on public.payment_logs
for select
to authenticated
using (
  public.current_user_has_permission('payments.view_admin')
  or public.current_user_has_permission('payments.edit')
  or public.current_user_has_permission('payments.manage')
);

-- Events
drop policy if exists events_admin_all on public.events;
drop policy if exists events_admin_edit on public.events;
create policy events_admin_edit
on public.events
for all
to authenticated
using (public.current_user_has_permission('events.edit') or public.current_user_has_permission('events.manage'))
with check (public.current_user_has_permission('events.edit') or public.current_user_has_permission('events.manage'));

drop policy if exists event_candidates_select_own_or_admin on public.event_candidates;
create policy event_candidates_select_own_or_admin
on public.event_candidates
for select
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('events.view_admin')
  or public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
);

drop policy if exists event_candidates_admin_all on public.event_candidates;
drop policy if exists event_candidates_admin_edit on public.event_candidates;
create policy event_candidates_admin_edit
on public.event_candidates
for all
to authenticated
using (public.current_user_has_permission('events.edit') or public.current_user_has_permission('events.manage'))
with check (public.current_user_has_permission('events.edit') or public.current_user_has_permission('events.manage'));

drop policy if exists event_registrations_select_own_or_admin on public.event_registrations;
create policy event_registrations_select_own_or_admin
on public.event_registrations
for select
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('events.view_admin')
  or public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
);

-- Complaints
drop policy if exists complaints_select_own_or_admin on public.complaints_suggestions;
create policy complaints_select_own_or_admin
on public.complaints_suggestions
for select
to authenticated
using (
  user_profile_id = public.current_user_profile_id()
  or public.current_user_has_permission('complaints.view_admin')
  or public.current_user_has_permission('complaints.edit')
  or public.current_user_has_permission('complaints.manage')
);

drop policy if exists complaints_admin_update on public.complaints_suggestions;
create policy complaints_admin_update
on public.complaints_suggestions
for update
to authenticated
using (public.current_user_has_permission('complaints.edit') or public.current_user_has_permission('complaints.manage'))
with check (public.current_user_has_permission('complaints.edit') or public.current_user_has_permission('complaints.manage'));

-- Access lists
drop policy if exists access_lists_admin_all on public.access_lists;
drop policy if exists access_lists_admin_edit on public.access_lists;
create policy access_lists_admin_edit
on public.access_lists
for all
to authenticated
using (public.current_user_has_permission('access_lists.edit') or public.current_user_has_permission('access_lists.manage'))
with check (public.current_user_has_permission('access_lists.edit') or public.current_user_has_permission('access_lists.manage'));

drop policy if exists access_list_members_admin_all on public.access_list_members;
drop policy if exists access_list_members_admin_edit on public.access_list_members;
create policy access_list_members_admin_edit
on public.access_list_members
for all
to authenticated
using (public.current_user_has_permission('access_lists.edit') or public.current_user_has_permission('access_lists.manage'))
with check (public.current_user_has_permission('access_lists.edit') or public.current_user_has_permission('access_lists.manage'));

drop policy if exists access_list_external_admin_all on public.access_list_external_people;
drop policy if exists access_list_external_admin_edit on public.access_list_external_people;
create policy access_list_external_admin_edit
on public.access_list_external_people
for all
to authenticated
using (public.current_user_has_permission('access_lists.edit') or public.current_user_has_permission('access_lists.manage'))
with check (public.current_user_has_permission('access_lists.edit') or public.current_user_has_permission('access_lists.manage'));

-- Roles
drop policy if exists "roles_admin_select" on public.roles;
create policy "roles_admin_select"
on public.roles
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists "permissions_admin_select" on public.permissions;
create policy "permissions_admin_select"
on public.permissions
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists "role_permissions_admin_select" on public.role_permissions;
create policy "role_permissions_admin_select"
on public.role_permissions
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists "user_roles_admin_all" on public.user_roles;
drop policy if exists "user_roles_admin_edit" on public.user_roles;
create policy "user_roles_admin_edit"
on public.user_roles
for all
to authenticated
using (public.current_user_has_permission('roles.edit') or public.current_user_has_permission('roles.manage'))
with check (public.current_user_has_permission('roles.edit') or public.current_user_has_permission('roles.manage'));

drop policy if exists user_roles_admin_select_v05 on public.user_roles;
create policy user_roles_admin_select_v05
on public.user_roles
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

-- =========================================================
-- 6. Verificación rápida
-- =========================================================

notify pgrst, 'reload schema';

select
  coalesce(up.email, '(sin correo)') as email,
  string_agg(r.name, ', ' order by r.name) as roles
from public.user_profiles up
join public.user_roles ur on ur.user_profile_id = up.id and ur.status = 'active'
join public.roles r on r.id = ur.role_id
where lower(coalesce(up.email, '')) in (
  lower('kendoaguascalientesaekia@gmail.com'),
  lower('lcaxag@hotmail.com'),
  lower('isabelle_najera@hotmail.com'),
  lower('eyedeep73@gmail.com'),
  lower('watarumi.39@gmail.com'),
  lower('alberto_cascal@hotmail.com'),
  lower('vicpiga@yahoo.com.mx')
)
group by up.email
order by up.email;
