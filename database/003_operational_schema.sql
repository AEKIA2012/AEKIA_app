-- =========================================================
-- AEKIA APP - 003 OPERATIONAL SCHEMA
-- Módulos: asistencia, pagos, eventos, quejas, listas de acceso y alertas
-- =========================================================

-- =========================================================
-- 1. ASISTENCIA
-- =========================================================

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),

  session_date date not null,
  discipline_id uuid references public.disciplines(id),
  title text,
  notes text,

  status text not null default 'active',

  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_sessions_status_check check (
    status in ('active', 'cancelled')
  ),
  constraint attendance_sessions_unique unique (session_date, discipline_id)
);

create index if not exists idx_attendance_sessions_date
on public.attendance_sessions(session_date);

create index if not exists idx_attendance_sessions_status
on public.attendance_sessions(status);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  attendance_status text not null default 'absent',
  notes text,

  registered_by uuid references public.user_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_records_status_check check (
    attendance_status in ('present', 'absent', 'late')
  ),
  constraint attendance_records_unique unique (session_id, member_id)
);

create index if not exists idx_attendance_records_member
on public.attendance_records(member_id);

create index if not exists idx_attendance_records_session
on public.attendance_records(session_id);

-- =========================================================
-- 2. PAGOS - MENSUALIDADES
-- =========================================================

create table if not exists public.monthly_payment_periods (
  id uuid primary key default gen_random_uuid(),

  payment_year integer not null,
  payment_month integer not null,
  due_amount numeric(12,2) not null default 0,

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint monthly_payment_periods_month_check check (
    payment_month between 1 and 12
  ),
  constraint monthly_payment_periods_status_check check (
    status in ('active', 'inactive')
  ),
  constraint monthly_payment_periods_unique unique (payment_year, payment_month)
);

create index if not exists idx_monthly_payment_periods_year
on public.monthly_payment_periods(payment_year);

create table if not exists public.monthly_payments (
  id uuid primary key default gen_random_uuid(),

  member_id uuid not null references public.members(id) on delete cascade,
  period_id uuid not null references public.monthly_payment_periods(id) on delete cascade,

  payment_status text not null default 'pending',
  paid_at timestamptz,
  amount_paid numeric(12,2),
  notes text,

  registered_by uuid references public.user_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint monthly_payments_status_check check (
    payment_status in ('paid', 'pending', 'waived')
  ),
  constraint monthly_payments_unique unique (member_id, period_id)
);

create index if not exists idx_monthly_payments_member
on public.monthly_payments(member_id);

create index if not exists idx_monthly_payments_period
on public.monthly_payments(period_id);

create index if not exists idx_monthly_payments_status
on public.monthly_payments(payment_status);

-- =========================================================
-- 3. EVENTOS
-- =========================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  description text,
  event_date date,
  location text,

  has_cost boolean not null default false,
  total_cost numeric(12,2),

  status text not null default 'active',

  created_by uuid references public.user_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_status_check check (
    status in ('active', 'closed', 'cancelled')
  ),
  constraint events_cost_check check (
    has_cost = false or total_cost is not null
  )
);

create index if not exists idx_events_status
on public.events(status);

create index if not exists idx_events_date
on public.events(event_date);

create table if not exists public.event_candidates (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  assigned_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),

  constraint event_candidates_unique unique (event_id, member_id)
);

create index if not exists idx_event_candidates_event
on public.event_candidates(event_id);

create index if not exists idx_event_candidates_member
on public.event_candidates(member_id);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  registration_status text not null default 'registered',

  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_registrations_status_check check (
    registration_status in ('registered', 'cancelled')
  ),
  constraint event_registrations_unique unique (event_id, member_id)
);

create index if not exists idx_event_registrations_event
on public.event_registrations(event_id);

create index if not exists idx_event_registrations_member
on public.event_registrations(member_id);

create index if not exists idx_event_registrations_status
on public.event_registrations(registration_status);

-- =========================================================
-- 4. OTROS PAGOS
-- Bogu, eventos, material, seminarios u otros conceptos
-- =========================================================

create table if not exists public.other_payment_types (
  id uuid primary key default gen_random_uuid(),

  name text not null unique,
  description text,
  default_amount numeric(12,2) not null default 0,

  status text not null default 'active',

  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint other_payment_types_status_check check (
    status in ('active', 'inactive')
  )
);

create table if not exists public.other_payment_assignments (
  id uuid primary key default gen_random_uuid(),

  payment_type_id uuid not null references public.other_payment_types(id),
  member_id uuid not null references public.members(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,

  assigned_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,

  payment_status text not null default 'pending',
  due_date date,
  notes text,

  assigned_by uuid references public.user_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint other_payment_assignments_status_check check (
    payment_status in ('paid', 'partial', 'pending', 'waived', 'cancelled')
  )
);

create index if not exists idx_other_payment_assignments_member
on public.other_payment_assignments(member_id);

create index if not exists idx_other_payment_assignments_status
on public.other_payment_assignments(payment_status);

create index if not exists idx_other_payment_assignments_event
on public.other_payment_assignments(event_id);

-- =========================================================
-- 5. PAYMENT LOGS
-- Bitácora específica de cambios en pagos
-- =========================================================

create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),

  payment_area text not null,
  payment_id uuid not null,
  member_id uuid references public.members(id),

  old_values jsonb,
  new_values jsonb,

  changed_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),

  constraint payment_logs_area_check check (
    payment_area in ('monthly', 'other')
  )
);

create index if not exists idx_payment_logs_member
on public.payment_logs(member_id);

create index if not exists idx_payment_logs_created_at
on public.payment_logs(created_at);

-- =========================================================
-- 6. QUEJAS Y SUGERENCIAS
-- =========================================================

create table if not exists public.complaints_suggestions (
  id uuid primary key default gen_random_uuid(),

  member_id uuid references public.members(id),
  user_profile_id uuid references public.user_profiles(id),

  title text not null,
  description text not null,

  status text not null default 'open',

  resolution_comment text,
  closed_at timestamptz,
  closed_by uuid references public.user_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint complaints_suggestions_status_check check (
    status in ('open', 'in_process', 'closed')
  ),
  constraint complaints_suggestions_closed_check check (
    status <> 'closed'
    or resolution_comment is not null
  )
);

create index if not exists idx_complaints_suggestions_status
on public.complaints_suggestions(status);

create index if not exists idx_complaints_suggestions_member
on public.complaints_suggestions(member_id);

create index if not exists idx_complaints_suggestions_created_at
on public.complaints_suggestions(created_at);

-- =========================================================
-- 7. LISTAS DE ACCESO
-- =========================================================

create table if not exists public.access_lists (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  day_type text not null default 'custom',
  status text not null default 'active',

  created_by uuid references public.user_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint access_lists_day_type_check check (
    day_type in ('wednesday', 'sunday', 'custom')
  ),
  constraint access_lists_status_check check (
    status in ('active', 'inactive')
  )
);

create index if not exists idx_access_lists_status
on public.access_lists(status);

create table if not exists public.access_list_members (
  id uuid primary key default gen_random_uuid(),

  access_list_id uuid not null references public.access_lists(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  japanese_name_snapshot text,
  work_school_name_snapshot text,

  created_at timestamptz not null default now(),

  constraint access_list_members_unique unique (access_list_id, member_id)
);

create index if not exists idx_access_list_members_list
on public.access_list_members(access_list_id);

create index if not exists idx_access_list_members_member
on public.access_list_members(member_id);

create table if not exists public.access_list_external_people (
  id uuid primary key default gen_random_uuid(),

  access_list_id uuid not null references public.access_lists(id) on delete cascade,

  full_name text not null,
  japanese_name text,
  work_school_name text,

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint access_list_external_people_status_check check (
    status in ('active', 'inactive')
  )
);

create index if not exists idx_access_list_external_people_list
on public.access_list_external_people(access_list_id);

-- =========================================================
-- 8. ALERTAS
-- =========================================================

create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),

  user_profile_id uuid references public.user_profiles(id),
  member_id uuid references public.members(id),

  title text not null,
  message text not null,

  alert_type text not null default 'info',
  status text not null default 'active',

  source_module text,
  source_id uuid,

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint user_alerts_type_check check (
    alert_type in ('info', 'warning', 'danger', 'success')
  ),
  constraint user_alerts_status_check check (
    status in ('active', 'resolved', 'dismissed')
  )
);

create index if not exists idx_user_alerts_user_profile
on public.user_alerts(user_profile_id);

create index if not exists idx_user_alerts_member
on public.user_alerts(member_id);

create index if not exists idx_user_alerts_status
on public.user_alerts(status);

-- =========================================================
-- 9. UPDATED_AT TRIGGERS
-- =========================================================

drop trigger if exists trg_attendance_sessions_updated_at on public.attendance_sessions;
create trigger trg_attendance_sessions_updated_at
before update on public.attendance_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_attendance_records_updated_at on public.attendance_records;
create trigger trg_attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

drop trigger if exists trg_monthly_payment_periods_updated_at on public.monthly_payment_periods;
create trigger trg_monthly_payment_periods_updated_at
before update on public.monthly_payment_periods
for each row execute function public.set_updated_at();

drop trigger if exists trg_monthly_payments_updated_at on public.monthly_payments;
create trigger trg_monthly_payments_updated_at
before update on public.monthly_payments
for each row execute function public.set_updated_at();

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists trg_event_registrations_updated_at on public.event_registrations;
create trigger trg_event_registrations_updated_at
before update on public.event_registrations
for each row execute function public.set_updated_at();

drop trigger if exists trg_other_payment_types_updated_at on public.other_payment_types;
create trigger trg_other_payment_types_updated_at
before update on public.other_payment_types
for each row execute function public.set_updated_at();

drop trigger if exists trg_other_payment_assignments_updated_at on public.other_payment_assignments;
create trigger trg_other_payment_assignments_updated_at
before update on public.other_payment_assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_complaints_suggestions_updated_at on public.complaints_suggestions;
create trigger trg_complaints_suggestions_updated_at
before update on public.complaints_suggestions
for each row execute function public.set_updated_at();

drop trigger if exists trg_access_lists_updated_at on public.access_lists;
create trigger trg_access_lists_updated_at
before update on public.access_lists
for each row execute function public.set_updated_at();

drop trigger if exists trg_access_list_external_people_updated_at on public.access_list_external_people;
create trigger trg_access_list_external_people_updated_at
before update on public.access_list_external_people
for each row execute function public.set_updated_at();

-- =========================================================
-- 10. SEED DE PERIODOS DE MENSUALIDAD 2025 Y 2026
-- Por ahora due_amount queda 0. Después definimos cuota.
-- =========================================================

insert into public.monthly_payment_periods (payment_year, payment_month, due_amount)
select y.payment_year, m.payment_month, 0
from (
  values (2025), (2026)
) as y(payment_year)
cross join generate_series(1, 12) as m(payment_month)
on conflict (payment_year, payment_month) do nothing;

-- =========================================================
-- 11. SEED OTROS PAGOS BÁSICOS
-- =========================================================

insert into public.other_payment_types (name, description, default_amount)
values
  ('Evento', 'Pago asociado a eventos, seminarios o exámenes.', 0),
  ('Bogu', 'Pago o adeudo relacionado con bogu/equipo.', 0),
  ('Otro', 'Concepto de pago diverso.', 0)
on conflict (name) do nothing;

-- =========================================================
-- END 003_OPERATIONAL_SCHEMA
-- =========================================================