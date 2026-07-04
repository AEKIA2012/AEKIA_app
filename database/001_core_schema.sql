-- =========================================================
-- AEKIA APP - 001 CORE SCHEMA
-- Tablas base: catálogos, miembros, usuarios, tutores, roles y auditoría
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- CATÁLOGOS
-- =========================================================

create table if not exists public.dojos (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dojos_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.disciplines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint disciplines_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.grade_catalog (
  id uuid primary key default gen_random_uuid(),
  discipline_id uuid not null references public.disciplines(id),
  grade_name text not null,
  grade_order integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint grade_catalog_status_check check (status in ('active', 'inactive')),
  constraint grade_catalog_unique unique (discipline_id, grade_name)
);

-- =========================================================
-- MIEMBROS
-- =========================================================

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),

  curp text not null unique,
  first_names text not null,
  paternal_last_name text not null,
  maternal_last_name text not null default '.',
  maternal_last_name_not_applicable boolean not null default false,

  work_school_name text not null,
  japanese_name text,

  dojo_id uuid references public.dojos(id),

  birth_date date,
  gender text,
  education_level text,
  currently_studying text,

  state text,
  municipality text,
  neighborhood text,
  street text,
  postal_code text,
  exterior_number text,
  interior_number text,
  interior_number_not_applicable boolean not null default false,

  email text,
  phone text,

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint members_status_check check (status in ('active', 'inactive')),
  constraint members_gender_check check (
    gender is null or gender in ('Masculino', 'Femenino', 'Otro')
  ),
  constraint members_curp_format_check check (
    curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$'
  )
);

create index if not exists idx_members_status on public.members(status);
create index if not exists idx_members_email on public.members(email);
create index if not exists idx_members_name on public.members(first_names, paternal_last_name, maternal_last_name);

create table if not exists public.member_disciplines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  discipline_id uuid not null references public.disciplines(id),
  grade_id uuid references public.grade_catalog(id),
  practices boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_disciplines_unique unique (member_id, discipline_id)
);

-- =========================================================
-- USUARIOS DE LA APP
-- Supabase Auth guarda passwords.
-- Esta tabla solo guarda datos de perfil para la app.
-- =========================================================

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  member_id uuid references public.members(id),

  email text not null unique,
  display_name text,

  status text not null default 'active',
  must_change_password boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_status_check check (status in ('active', 'inactive'))
);

create index if not exists idx_user_profiles_auth_user_id on public.user_profiles(auth_user_id);
create index if not exists idx_user_profiles_member_id on public.user_profiles(member_id);
create index if not exists idx_user_profiles_email on public.user_profiles(email);

-- =========================================================
-- TUTORES / MENORES
-- =========================================================

create table if not exists public.member_guardians (
  id uuid primary key default gen_random_uuid(),

  minor_member_id uuid not null references public.members(id) on delete cascade,
  guardian_member_id uuid not null references public.members(id) on delete cascade,

  relationship_type text not null,
  can_view_data boolean not null default true,
  can_update_data boolean not null default false,
  can_register_events boolean not null default true,
  can_view_payments boolean not null default true,

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_guardians_status_check check (status in ('active', 'inactive')),
  constraint member_guardians_unique unique (minor_member_id, guardian_member_id),
  constraint member_guardians_no_self_check check (minor_member_id <> guardian_member_id)
);

create index if not exists idx_member_guardians_minor on public.member_guardians(minor_member_id);
create index if not exists idx_member_guardians_guardian on public.member_guardians(guardian_member_id);

-- =========================================================
-- ROLES Y PERMISOS
-- =========================================================

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  module text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint role_permissions_unique unique (role_id, permission_id)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references public.user_profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint user_roles_status_check check (status in ('active', 'inactive')),
  constraint user_roles_unique unique (user_profile_id, role_id)
);

-- =========================================================
-- SOLICITUDES DE REGISTRO
-- =========================================================

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),

  first_names text not null,
  paternal_last_name text not null,
  maternal_last_name text not null default '.',
  maternal_last_name_not_applicable boolean not null default false,
  work_school_name text not null,
  curp text not null,
  email text not null,

  status text not null default 'pending',
  admin_comment text,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.user_profiles(id),

  constraint registration_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'cancelled')
  ),
  constraint registration_requests_curp_format_check check (
    curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$'
  )
);

create index if not exists idx_registration_requests_status on public.registration_requests(status);
create index if not exists idx_registration_requests_curp on public.registration_requests(curp);
create index if not exists idx_registration_requests_email on public.registration_requests(email);

-- =========================================================
-- AUDITORÍA / LOGS
-- =========================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),

  user_profile_id uuid references public.user_profiles(id),
  module text not null,
  action text not null,
  entity_table text,
  entity_id uuid,

  old_values jsonb,
  new_values jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
create index if not exists idx_audit_logs_module on public.audit_logs(module);
create index if not exists idx_audit_logs_user_profile on public.audit_logs(user_profile_id);

-- =========================================================
-- UPDATED_AT AUTOMÁTICO
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dojos_updated_at on public.dojos;
create trigger trg_dojos_updated_at
before update on public.dojos
for each row execute function public.set_updated_at();

drop trigger if exists trg_members_updated_at on public.members;
create trigger trg_members_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists trg_member_disciplines_updated_at on public.member_disciplines;
create trigger trg_member_disciplines_updated_at
before update on public.member_disciplines
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_member_guardians_updated_at on public.member_guardians;
create trigger trg_member_guardians_updated_at
before update on public.member_guardians
for each row execute function public.set_updated_at();

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

-- =========================================================
-- SEED BÁSICO
-- =========================================================

insert into public.disciplines (code, name)
values
  ('kendo', 'Kendo'),
  ('iaido', 'Iaido'),
  ('jodo', 'Jodo')
on conflict (code) do nothing;

insert into public.dojos (name)
values
  ('AEKIA'),
  ('AGS Kendo'),
  ('No definido')
on conflict (name) do nothing;

insert into public.roles (code, name, description)
values
  ('member', 'Usuario', 'Usuario base de la aplicación.'),
  ('board', 'Mesa directiva', 'Rol general para integrantes de mesa directiva.'),
  ('admin', 'Administrador', 'Acceso administrativo completo.')
on conflict (code) do nothing;

insert into public.permissions (code, name, description, module)
values
  ('personal_data.view_own', 'Ver mis datos personales', 'Permite ver datos personales propios.', 'Datos personales'),
  ('personal_data.update_own', 'Editar mis datos personales', 'Permite editar datos personales propios.', 'Datos personales'),
  ('attendance.view_own', 'Ver mi asistencia', 'Permite consultar asistencia propia.', 'Asistencia'),
  ('payments.view_own', 'Ver mis pagos', 'Permite consultar pagos propios.', 'Pagos'),
  ('events.register_own', 'Registro propio a eventos', 'Permite registrarse o salir de eventos activos.', 'Eventos'),
  ('complaints.create_own', 'Crear quejas o sugerencias', 'Permite crear quejas y sugerencias.', 'Quejas'),
  ('members.manage', 'Gestionar miembros', 'Permite administrar lista de miembros.', 'Gestión miembros'),
  ('attendance.manage', 'Gestionar asistencia', 'Permite registrar y administrar asistencia.', 'Control asistencia'),
  ('payments.manage', 'Gestionar pagos', 'Permite registrar y administrar pagos.', 'Control pagos'),
  ('events.manage', 'Gestionar eventos', 'Permite crear, editar y cerrar eventos.', 'Gestión eventos'),
  ('complaints.manage', 'Gestionar quejas', 'Permite dar seguimiento y cerrar quejas.', 'Gestión quejas'),
  ('access_lists.manage', 'Gestionar listas de acceso', 'Permite administrar listas de acceso.', 'Listas de acceso'),
  ('roles.manage', 'Gestionar roles y permisos', 'Permite administrar roles y permisos.', 'Roles'),
  ('audit_logs.view', 'Ver auditoría', 'Permite consultar bitácoras de cambios.', 'Auditoría')
on conflict (code) do nothing;

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
join public.permissions p on p.code in (
  'members.manage',
  'attendance.manage',
  'payments.manage',
  'events.manage',
  'complaints.manage',
  'access_lists.manage'
)
where r.code = 'board'
on conflict (role_id, permission_id) do nothing;

-- =========================================================
-- END 001_CORE_SCHEMA
-- =========================================================