-- =========================================================
-- AEKIA APP - 002 GRADE SEED AND RLS
-- Grados, funciones de permisos y políticas de seguridad
-- =========================================================

-- =========================================================
-- 1. SEED DE GRADOS
-- =========================================================

insert into public.grade_catalog (discipline_id, grade_name, grade_order)
select d.id, g.grade_name, g.grade_order
from public.disciplines d
cross join (
  values
    ('No aplica', 0),
    ('6to Kyu', 10),
    ('5to Kyu', 20),
    ('4to Kyu', 30),
    ('3er Kyu', 40),
    ('2do Kyu', 50),
    ('1er Kyu', 60),
    ('1er Dan', 70),
    ('2do Dan', 80),
    ('3er Dan', 90),
    ('4to Dan', 100),
    ('5to Dan', 110),
    ('6to Dan', 120),
    ('6to Dan Renshi', 121),
    ('7mo Dan', 130),
    ('7mo Dan Renshi', 131),
    ('7mo Dan Kyoshi', 132),
    ('8vo Dan', 140),
    ('8vo Dan Kyoshi', 141),
    ('8vo Dan Hanshi', 142)
) as g(grade_name, grade_order)
on conflict (discipline_id, grade_name) do nothing;

-- =========================================================
-- 2. FUNCIONES DE APOYO PARA PERMISOS
-- =========================================================

create or replace function public.current_user_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.id
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;
$$;

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

-- =========================================================
-- 3. ACTIVAR ROW LEVEL SECURITY
-- =========================================================

alter table public.dojos enable row level security;
alter table public.disciplines enable row level security;
alter table public.grade_catalog enable row level security;
alter table public.members enable row level security;
alter table public.member_disciplines enable row level security;
alter table public.user_profiles enable row level security;
alter table public.member_guardians enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.registration_requests enable row level security;
alter table public.audit_logs enable row level security;

-- =========================================================
-- 4. POLÍTICAS PARA CATÁLOGOS
-- Los catálogos activos se pueden leer desde login/registro.
-- =========================================================

drop policy if exists "catalogs_select_dojos" on public.dojos;
create policy "catalogs_select_dojos"
on public.dojos
for select
to anon, authenticated
using (status = 'active');

drop policy if exists "catalogs_select_disciplines" on public.disciplines;
create policy "catalogs_select_disciplines"
on public.disciplines
for select
to anon, authenticated
using (status = 'active');

drop policy if exists "catalogs_select_grade_catalog" on public.grade_catalog;
create policy "catalogs_select_grade_catalog"
on public.grade_catalog
for select
to anon, authenticated
using (status = 'active');

-- =========================================================
-- 5. POLÍTICAS PARA SOLICITUDES DE REGISTRO
-- =========================================================

drop policy if exists "registration_requests_insert_anon" on public.registration_requests;
create policy "registration_requests_insert_anon"
on public.registration_requests
for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "registration_requests_admin_select" on public.registration_requests;
create policy "registration_requests_admin_select"
on public.registration_requests
for select
to authenticated
using (public.current_user_has_permission('members.manage'));

drop policy if exists "registration_requests_admin_update" on public.registration_requests;
create policy "registration_requests_admin_update"
on public.registration_requests
for update
to authenticated
using (public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.manage'));

-- =========================================================
-- 6. POLÍTICAS PARA USER_PROFILES
-- =========================================================

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "user_profiles_admin_select" on public.user_profiles;
create policy "user_profiles_admin_select"
on public.user_profiles
for select
to authenticated
using (public.current_user_has_permission('members.manage'));

drop policy if exists "user_profiles_admin_update" on public.user_profiles;
create policy "user_profiles_admin_update"
on public.user_profiles
for update
to authenticated
using (public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.manage'));

-- =========================================================
-- 7. POLÍTICAS PARA MEMBERS
-- Usuario ve su propio miembro.
-- Tutor ve menores asociados.
-- Admin ve y modifica todos.
-- =========================================================

drop policy if exists "members_select_own" on public.members;
create policy "members_select_own"
on public.members
for select
to authenticated
using (
  id in (
    select up.member_id
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
  )
);

drop policy if exists "members_select_guardian_children" on public.members;
create policy "members_select_guardian_children"
on public.members
for select
to authenticated
using (
  id in (
    select mg.minor_member_id
    from public.member_guardians mg
    join public.user_profiles up on up.member_id = mg.guardian_member_id
    where up.auth_user_id = auth.uid()
      and mg.status = 'active'
      and mg.can_view_data = true
  )
);

drop policy if exists "members_admin_all" on public.members;
create policy "members_admin_all"
on public.members
for all
to authenticated
using (public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.manage'));

-- =========================================================
-- 8. POLÍTICAS PARA DISCIPLINAS DE MIEMBROS
-- =========================================================

drop policy if exists "member_disciplines_select_own" on public.member_disciplines;
create policy "member_disciplines_select_own"
on public.member_disciplines
for select
to authenticated
using (
  member_id in (
    select up.member_id
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
  )
  or member_id in (
    select mg.minor_member_id
    from public.member_guardians mg
    join public.user_profiles up on up.member_id = mg.guardian_member_id
    where up.auth_user_id = auth.uid()
      and mg.status = 'active'
      and mg.can_view_data = true
  )
  or public.current_user_has_permission('members.manage')
);

drop policy if exists "member_disciplines_admin_all" on public.member_disciplines;
create policy "member_disciplines_admin_all"
on public.member_disciplines
for all
to authenticated
using (public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.manage'));

-- =========================================================
-- 9. POLÍTICAS PARA TUTORES
-- =========================================================

drop policy if exists "member_guardians_select_own" on public.member_guardians;
create policy "member_guardians_select_own"
on public.member_guardians
for select
to authenticated
using (
  guardian_member_id in (
    select up.member_id
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
  )
  or minor_member_id in (
    select up.member_id
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
  )
  or public.current_user_has_permission('members.manage')
);

drop policy if exists "member_guardians_admin_all" on public.member_guardians;
create policy "member_guardians_admin_all"
on public.member_guardians
for all
to authenticated
using (public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.manage'));

-- =========================================================
-- 10. POLÍTICAS PARA ROLES Y PERMISOS
-- =========================================================

drop policy if exists "roles_admin_select" on public.roles;
create policy "roles_admin_select"
on public.roles
for select
to authenticated
using (public.current_user_has_permission('roles.manage'));

drop policy if exists "permissions_admin_select" on public.permissions;
create policy "permissions_admin_select"
on public.permissions
for select
to authenticated
using (public.current_user_has_permission('roles.manage'));

drop policy if exists "role_permissions_admin_select" on public.role_permissions;
create policy "role_permissions_admin_select"
on public.role_permissions
for select
to authenticated
using (public.current_user_has_permission('roles.manage'));

drop policy if exists "user_roles_admin_all" on public.user_roles;
create policy "user_roles_admin_all"
on public.user_roles
for all
to authenticated
using (public.current_user_has_permission('roles.manage'))
with check (public.current_user_has_permission('roles.manage'));

-- =========================================================
-- 11. POLÍTICAS PARA AUDITORÍA
-- =========================================================

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select"
on public.audit_logs
for select
to authenticated
using (public.current_user_has_permission('audit_logs.view'));

-- =========================================================
-- END 002_GRADE_SEED_AND_RLS
-- =========================================================