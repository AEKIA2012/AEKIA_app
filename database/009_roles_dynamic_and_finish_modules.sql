-- =========================================================
-- AEKIA PATCH V06 - Roles dinámicos y ajustes finales
-- =========================================================

-- 1) Permisos adicionales
insert into public.permissions (code, name, description, module)
values
  ('members.japanese_name.edit', 'Editar nombre japonés', 'Permite editar el nombre japonés de integrantes/listas.', 'Gestión miembros')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    module = excluded.module;

-- 2) Asegurar que pagos mensuales admitan parcial
alter table public.monthly_payments
  drop constraint if exists monthly_payments_status_check;

alter table public.monthly_payments
  add constraint monthly_payments_status_check
  check (payment_status in ('paid', 'partial', 'pending', 'waived', 'cancelled'));

-- 3) Asegurar índices/constraints necesarios para pantalla dinámica
create unique index if not exists user_roles_unique_idx
on public.user_roles(user_profile_id, role_id);

create unique index if not exists role_permissions_unique_idx
on public.role_permissions(role_id, permission_id);

-- 4) Ajustar permisos de roles base sin hacerlos código duro en frontend
--    Mesa directiva puede editar integrantes, pero no módulos operativos.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('members.view', 'members.edit')
where r.code = 'mesa_directiva_consulta'
on conflict (role_id, permission_id) do nothing;

--    Rumi puede editar integrantes y nombre japonés, además de listas.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('members.view', 'members.edit', 'members.japanese_name.edit', 'access_lists.view_admin', 'access_lists.edit')
where r.code = 'control_accesos_dojo'
on conflict (role_id, permission_id) do nothing;

--    Admin total recibe el permiso nuevo.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'members.japanese_name.edit'
where r.code = 'admin'
on conflict (role_id, permission_id) do nothing;

-- 5) RPC permisos actualizada
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
grant execute on function public.current_user_has_permission(text) to authenticated;

notify pgrst, 'reload schema';
