-- =========================================================
-- AEKIA PATCH V08 - Elegibilidad, abonos, roles por nombre y ajustes finales
-- =========================================================

-- 1) Perfil correcto para roles cuando un correo familiar quedó ligado a hijo(a).
--    Esto hace que el módulo de Roles muestre a la persona correcta por nombre.
with target_people(email, first_token, second_token) as (
  values
    (lower('isabelle_najera@hotmail.com'), 'isabel', 'najera'),
    (lower('eyedeep73@gmail.com'), 'juan', 'amador'),
    (lower('watarumi.39@gmail.com'), 'rumi', 'watanabe'),
    (lower('alberto_cascal@hotmail.com'), 'alberto', 'castaneda'),
    (lower('vicpiga@yahoo.com.mx'), 'victor', 'pineda')
), member_matches as (
  select distinct on (tp.email)
    tp.email,
    m.id as member_id,
    trim(concat_ws(' ', m.first_names, m.paternal_last_name, m.maternal_last_name)) as member_name
  from target_people tp
  join public.members m
    on translate(lower(concat_ws(' ', m.first_names, m.paternal_last_name, m.maternal_last_name)), 'áéíóúüñ', 'aeiouun') like '%' || tp.first_token || '%'
   and translate(lower(concat_ws(' ', m.first_names, m.paternal_last_name, m.maternal_last_name)), 'áéíóúüñ', 'aeiouun') like '%' || tp.second_token || '%'
  where m.status = 'active'
  order by tp.email, m.created_at desc
)
update public.user_profiles up
set
  member_id = mm.member_id,
  display_name = mm.member_name,
  updated_at = now()
from member_matches mm
where lower(up.email) = mm.email;

-- 2) Reafirmar asignaciones de roles solicitadas, sin depender de display_name.
insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'comisaria'
where lower(up.email) = lower('isabelle_najera@hotmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'tesoreria'
where lower(up.email) = lower('eyedeep73@gmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

insert into public.user_roles (user_profile_id, role_id, status)
select up.id, r.id, 'active'
from public.user_profiles up
join public.roles r on r.code = 'control_accesos_dojo'
where lower(up.email) = lower('watarumi.39@gmail.com')
on conflict (user_profile_id, role_id) do update set status = 'active';

-- Asegurar permiso de nombre japonés para control de accesos.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'members.japanese_name.edit'
where r.code = 'control_accesos_dojo'
on conflict (role_id, permission_id) do nothing;

-- 3) Guardado seguro de disciplinas/grados propios desde Datos personales.
create or replace function public.aekia_save_my_member_disciplines(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_item jsonb;
  v_discipline_id uuid;
  v_grade_id uuid;
  v_practices boolean;
begin
  v_member_id := public.current_user_member_id();

  if v_member_id is null then
    raise exception 'Usuario no vinculado a integrante.';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_discipline_id := nullif(v_item->>'discipline_id', '')::uuid;
    v_grade_id := nullif(v_item->>'grade_id', '')::uuid;
    v_practices := coalesce((v_item->>'practices')::boolean, false);

    if v_discipline_id is not null then
      insert into public.member_disciplines (member_id, discipline_id, grade_id, practices)
      values (v_member_id, v_discipline_id, v_grade_id, v_practices)
      on conflict (member_id, discipline_id) do update
      set
        grade_id = excluded.grade_id,
        practices = excluded.practices,
        updated_at = now();
    end if;
  end loop;
end;
$$;

grant execute on function public.aekia_save_my_member_disciplines(jsonb) to authenticated;

-- 4) Elegibilidad centralizada para eventos/torneos.
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
  v_completed_weeks integer := 0;
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
  ), fulfilled_weeks as (
    select distinct to_char(date_trunc('week', rs.session_date), 'IYYY-IW') as week_key
    from relevant_sessions rs
    join public.attendance_records ar on ar.session_id = rs.id
    where ar.member_id = p_member_id
      and ar.attendance_status = 'present'
  )
  select
    (select count(*) from class_weeks),
    (select count(*) from fulfilled_weeks)
  into v_total_class_weeks, v_completed_weeks;

  if v_total_class_weeks > 0 then
    v_attendance_percent := round((v_completed_weeks::numeric / v_total_class_weeks::numeric) * 100)::integer;
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
    'payment_debt_count', v_payment_debt,
    'monthly_debt_count', v_monthly_debt,
    'other_debt_count', v_other_debt,
    'from_date', v_from,
    'to_date', v_to
  );
end;
$$;

grant execute on function public.aekia_member_event_eligibility(uuid) to authenticated;

-- 5) Eventos: los usuarios solo pueden registrarse si son aptos; cancelar siempre se permite.
alter table public.event_registrations enable row level security;

drop policy if exists event_registrations_insert_own_or_admin on public.event_registrations;
drop policy if exists event_registrations_update_own_or_admin on public.event_registrations;
drop policy if exists event_registrations_insert_own_or_admin_v08 on public.event_registrations;
drop policy if exists event_registrations_update_own_or_admin_v08 on public.event_registrations;

create policy event_registrations_insert_own_or_admin_v08
on public.event_registrations
for insert
to authenticated
with check (
  public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
  or (
    member_id = public.current_user_member_id()
    and coalesce((public.aekia_member_event_eligibility(member_id)->>'eligible')::boolean, false) = true
  )
);

create policy event_registrations_update_own_or_admin_v08
on public.event_registrations
for update
to authenticated
using (
  member_id = public.current_user_member_id()
  or public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
)
with check (
  public.current_user_has_permission('events.edit')
  or public.current_user_has_permission('events.manage')
  or (
    member_id = public.current_user_member_id()
    and (
      registration_status = 'cancelled'
      or coalesce((public.aekia_member_event_eligibility(member_id)->>'eligible')::boolean, false) = true
    )
  )
);

-- 6) Abonos: permitir ver/editar/eliminar bitácora de pagos a tesorería/admin.
alter table public.payment_logs enable row level security;

drop policy if exists payment_logs_admin_update_v08 on public.payment_logs;
create policy payment_logs_admin_update_v08
on public.payment_logs
for update
to authenticated
using (
  public.current_user_has_permission('payments.edit')
  or public.current_user_has_permission('payments.manage')
)
with check (
  public.current_user_has_permission('payments.edit')
  or public.current_user_has_permission('payments.manage')
);

drop policy if exists payment_logs_admin_delete_v08 on public.payment_logs;
create policy payment_logs_admin_delete_v08
on public.payment_logs
for delete
to authenticated
using (
  public.current_user_has_permission('payments.edit')
  or public.current_user_has_permission('payments.manage')
);

-- 7) Validación rápida.
notify pgrst, 'reload schema';

select
  coalesce(up.display_name, up.email) as usuario,
  up.email,
  string_agg(r.name, ', ' order by r.name) as roles
from public.user_profiles up
left join public.user_roles ur on ur.user_profile_id = up.id and ur.status = 'active'
left join public.roles r on r.id = ur.role_id
where lower(up.email) in (
  lower('isabelle_najera@hotmail.com'),
  lower('eyedeep73@gmail.com'),
  lower('watarumi.39@gmail.com'),
  lower('alberto_cascal@hotmail.com'),
  lower('vicpiga@yahoo.com.mx')
)
group by up.display_name, up.email
order by up.email;
