-- =========================================================
-- AEKIA APP - 005 FINISH MODULES / FIXES / RLS
-- Ejecutar una sola vez después de 001, 002, 003 y 004.
-- Este archivo NO usa grade_catalog.sort_order; usa grade_order.
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- 1. FIX DE CATÁLOGO DE GRADOS
-- =========================================================

alter table public.grade_catalog
add column if not exists grade_order integer;

update public.grade_catalog
set grade_order = case
  when grade_name = 'No aplica' then 0
  when grade_name = '6to Kyu' then 10
  when grade_name = '5to Kyu' then 20
  when grade_name = '4to Kyu' then 30
  when grade_name = '3er Kyu' then 40
  when grade_name = '2do Kyu' then 50
  when grade_name = '1er Kyu' then 60
  when grade_name = '1er Dan' then 70
  when grade_name = '2do Dan' then 80
  when grade_name = '3er Dan' then 90
  when grade_name = '4to Dan' then 100
  when grade_name = '5to Dan' then 110
  when grade_name = '6to Dan' then 120
  when grade_name = '6to Dan Renshi' then 121
  when grade_name = '7mo Dan' then 130
  when grade_name = '7mo Dan Renshi' then 131
  when grade_name = '7mo Dan Kyoshi' then 132
  when grade_name = '8vo Dan' then 140
  when grade_name = '8vo Dan Kyoshi' then 141
  when grade_name = '8vo Dan Hanshi' then 142
  else 999
end
where grade_order is null;

insert into public.grade_catalog (discipline_id, grade_name, grade_order, status)
select d.id, g.grade_name, g.grade_order, 'active'
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
where d.code in ('kendo', 'iaido', 'jodo')
on conflict (discipline_id, grade_name) do update
set grade_order = excluded.grade_order,
    status = 'active';

-- =========================================================
-- 2. VIEWS/HELPERS
-- =========================================================

create or replace function public.current_user_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.member_id
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin_or_has(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_permission(permission_code)
      or public.current_user_has_permission('members.manage')
      or public.current_user_has_permission('roles.manage');
$$;

-- =========================================================
-- 3. RLS OPERACIONAL
-- =========================================================

alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.monthly_payment_periods enable row level security;
alter table public.monthly_payments enable row level security;
alter table public.events enable row level security;
alter table public.event_candidates enable row level security;
alter table public.event_registrations enable row level security;
alter table public.other_payment_types enable row level security;
alter table public.other_payment_assignments enable row level security;
alter table public.payment_logs enable row level security;
alter table public.complaints_suggestions enable row level security;
alter table public.access_lists enable row level security;
alter table public.access_list_members enable row level security;
alter table public.access_list_external_people enable row level security;
alter table public.user_alerts enable row level security;

-- Lectura base
create policy if not exists attendance_sessions_select_auth on public.attendance_sessions for select to authenticated using (true);
create policy if not exists monthly_periods_select_auth on public.monthly_payment_periods for select to authenticated using (true);
create policy if not exists events_select_auth on public.events for select to authenticated using (true);
create policy if not exists other_payment_types_select_auth on public.other_payment_types for select to authenticated using (true);
create policy if not exists access_lists_select_auth on public.access_lists for select to authenticated using (true);
create policy if not exists access_list_members_select_auth on public.access_list_members for select to authenticated using (true);
create policy if not exists access_list_external_people_select_auth on public.access_list_external_people for select to authenticated using (true);

-- Asistencia
create policy if not exists attendance_sessions_admin_all on public.attendance_sessions for all to authenticated using (public.current_user_has_permission('attendance.manage')) with check (public.current_user_has_permission('attendance.manage'));
create policy if not exists attendance_records_select_own_or_admin on public.attendance_records for select to authenticated using (member_id = public.current_user_member_id() or public.current_user_has_permission('attendance.manage'));
create policy if not exists attendance_records_admin_all on public.attendance_records for all to authenticated using (public.current_user_has_permission('attendance.manage')) with check (public.current_user_has_permission('attendance.manage'));

-- Pagos
create policy if not exists monthly_payments_select_own_or_admin on public.monthly_payments for select to authenticated using (member_id = public.current_user_member_id() or public.current_user_has_permission('payments.manage'));
create policy if not exists monthly_payments_admin_all on public.monthly_payments for all to authenticated using (public.current_user_has_permission('payments.manage')) with check (public.current_user_has_permission('payments.manage'));
create policy if not exists other_payments_select_own_or_admin on public.other_payment_assignments for select to authenticated using (member_id = public.current_user_member_id() or public.current_user_has_permission('payments.manage'));
create policy if not exists other_payments_admin_all on public.other_payment_assignments for all to authenticated using (public.current_user_has_permission('payments.manage')) with check (public.current_user_has_permission('payments.manage'));
create policy if not exists other_payment_types_admin_all on public.other_payment_types for all to authenticated using (public.current_user_has_permission('payments.manage')) with check (public.current_user_has_permission('payments.manage'));
create policy if not exists payment_logs_admin_select on public.payment_logs for select to authenticated using (public.current_user_has_permission('payments.manage'));

-- Eventos
create policy if not exists events_admin_all on public.events for all to authenticated using (public.current_user_has_permission('events.manage')) with check (public.current_user_has_permission('events.manage'));
create policy if not exists event_candidates_select_own_or_admin on public.event_candidates for select to authenticated using (member_id = public.current_user_member_id() or public.current_user_has_permission('events.manage'));
create policy if not exists event_candidates_admin_all on public.event_candidates for all to authenticated using (public.current_user_has_permission('events.manage')) with check (public.current_user_has_permission('events.manage'));
create policy if not exists event_registrations_select_own_or_admin on public.event_registrations for select to authenticated using (member_id = public.current_user_member_id() or public.current_user_has_permission('events.manage'));
create policy if not exists event_registrations_insert_own_or_admin on public.event_registrations for insert to authenticated with check (member_id = public.current_user_member_id() or public.current_user_has_permission('events.manage'));
create policy if not exists event_registrations_update_own_or_admin on public.event_registrations for update to authenticated using (member_id = public.current_user_member_id() or public.current_user_has_permission('events.manage')) with check (member_id = public.current_user_member_id() or public.current_user_has_permission('events.manage'));

-- Quejas
create policy if not exists complaints_select_own_or_admin on public.complaints_suggestions for select to authenticated using (user_profile_id = public.current_user_profile_id() or public.current_user_has_permission('complaints.manage'));
create policy if not exists complaints_insert_own on public.complaints_suggestions for insert to authenticated with check (user_profile_id = public.current_user_profile_id());
create policy if not exists complaints_admin_update on public.complaints_suggestions for update to authenticated using (public.current_user_has_permission('complaints.manage')) with check (public.current_user_has_permission('complaints.manage'));

-- Listas de acceso y roles
create policy if not exists access_lists_admin_all on public.access_lists for all to authenticated using (public.current_user_has_permission('access_lists.manage')) with check (public.current_user_has_permission('access_lists.manage'));
create policy if not exists access_list_members_admin_all on public.access_list_members for all to authenticated using (public.current_user_has_permission('access_lists.manage')) with check (public.current_user_has_permission('access_lists.manage'));
create policy if not exists access_list_external_admin_all on public.access_list_external_people for all to authenticated using (public.current_user_has_permission('access_lists.manage')) with check (public.current_user_has_permission('access_lists.manage'));
create policy if not exists alerts_select_own_or_admin on public.user_alerts for select to authenticated using (user_profile_id = public.current_user_profile_id() or member_id = public.current_user_member_id() or public.current_user_has_permission('members.manage'));

-- =========================================================
-- 4. SEED BASE
-- =========================================================

insert into public.monthly_payment_periods (payment_year, payment_month, due_amount)
select y.payment_year, m.payment_month, 0
from (values (2025), (2026), (2027)) as y(payment_year)
cross join generate_series(1, 12) as m(payment_month)
on conflict (payment_year, payment_month) do nothing;

insert into public.access_lists (name, day_type, status)
values
  ('Miércoles', 'wednesday', 'active'),
  ('Domingos', 'sunday', 'active'),
  ('Seminario', 'custom', 'inactive')
on conflict do nothing;

insert into public.events (title, description, has_cost, total_cost, status)
values
  ('Clase especial', 'Evento base de prueba para registro.', false, null, 'active'),
  ('Seminario', 'Seminario técnico.', true, 1000, 'closed'),
  ('Nacional', 'Evento nacional.', true, 2500, 'closed')
on conflict do nothing;

-- Roles descriptivos para mesa directiva. Permisos se asignan después según necesidad.
insert into public.roles (code, name, description, status)
values
  ('presidente', 'Presidente', 'Rol operativo de presidencia.', 'active'),
  ('comisario', 'Comisario', 'Rol operativo de comisaría.', 'active'),
  ('tesorero', 'Tesorero', 'Rol operativo de tesorería.', 'active'),
  ('accesos', 'Accesos', 'Rol para gestión de listas de acceso.', 'active'),
  ('integrante', 'Integrante', 'Rol base de integrante.', 'active'),
  ('secretario', 'Secretario', 'Rol operativo de secretaría.', 'inactive')
on conflict (code) do nothing;

-- =========================================================
-- 5. LIMPIEZA DE LOGS > 90 DÍAS
-- =========================================================

create or replace function public.cleanup_old_audit_logs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.audit_logs where created_at < now() - interval '90 days';
  delete from public.payment_logs where created_at < now() - interval '90 days';
$$;

-- =========================================================
-- FIN 005
-- =========================================================
