-- =========================================================
-- AEKIA PATCH V07 - Ajustes finales de RLS, permisos y roles
-- =========================================================

-- 1) Asegurar que admin tenga todos los permisos existentes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
on conflict (role_id, permission_id) do nothing;

-- 2) Datos personales: permitir que cada usuario actualice sus disciplinas/grados.
alter table public.member_disciplines enable row level security;

drop policy if exists member_disciplines_select_own_v07 on public.member_disciplines;
create policy member_disciplines_select_own_v07
on public.member_disciplines
for select
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('members.view')
  or public.current_user_has_permission('members.edit')
);

drop policy if exists member_disciplines_insert_own_v07 on public.member_disciplines;
create policy member_disciplines_insert_own_v07
on public.member_disciplines
for insert
to authenticated
with check (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('members.edit')
);

drop policy if exists member_disciplines_update_own_v07 on public.member_disciplines;
create policy member_disciplines_update_own_v07
on public.member_disciplines
for update
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('members.edit')
)
with check (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('members.edit')
);

-- 3) Abonos de otros cargos: permitir insertar bitácora a tesorería/admin.
alter table public.payment_logs enable row level security;

drop policy if exists payment_logs_admin_insert_v07 on public.payment_logs;
create policy payment_logs_admin_insert_v07
on public.payment_logs
for insert
to authenticated
with check (
  public.current_user_has_permission('payments.edit')
  or public.current_user_has_permission('payments.manage')
);

-- 4) Eventos: reforzar lectura y edición para admin/roles autorizados.
alter table public.events enable row level security;

drop policy if exists events_select_admin_or_user_v07 on public.events;
create policy events_select_admin_or_user_v07
on public.events
for select
to authenticated
using (
  status = 'active'
  or public.current_user_has_permission('events.view_admin')
  or public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
);

drop policy if exists events_edit_admin_v07 on public.events;
create policy events_edit_admin_v07
on public.events
for all
to authenticated
using (
  public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
)
with check (
  public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
);

-- 5) Roles y permisos dinámicos: permitir edición real desde el módulo de roles.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists roles_select_v07 on public.roles;
create policy roles_select_v07
on public.roles
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists roles_edit_v07 on public.roles;
create policy roles_edit_v07
on public.roles
for all
to authenticated
using (
  public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
)
with check (
  public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists permissions_select_v07 on public.permissions;
create policy permissions_select_v07
on public.permissions
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists role_permissions_select_v07 on public.role_permissions;
create policy role_permissions_select_v07
on public.role_permissions
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists role_permissions_edit_v07 on public.role_permissions;
create policy role_permissions_edit_v07
on public.role_permissions
for all
to authenticated
using (
  public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
)
with check (
  public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists user_roles_select_v07 on public.user_roles;
create policy user_roles_select_v07
on public.user_roles
for select
to authenticated
using (
  public.current_user_has_permission('roles.view_admin')
  or public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

drop policy if exists user_roles_edit_v07 on public.user_roles;
create policy user_roles_edit_v07
on public.user_roles
for all
to authenticated
using (
  public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
)
with check (
  public.current_user_has_permission('roles.edit')
  or public.current_user_has_permission('roles.manage')
);

-- 6) Asegurar constraints necesarios para upsert.
create unique index if not exists role_permissions_unique_idx
on public.role_permissions(role_id, permission_id);

create unique index if not exists user_roles_unique_idx
on public.user_roles(user_profile_id, role_id);

notify pgrst, 'reload schema';
