-- =========================================================
-- AEKIA PATCH V11 - correcciones puntuales: adeudos vencidos, familia, auditoría y alertas globales
-- Ejecutar este archivo completo. No reimportar datos.
-- =========================================================

-- 1) Permiso de auditoría y menú administrable.
insert into public.permissions (code, name, description, module)
values ('audit_logs.view', 'Ver auditoría', 'Permite consultar log de accesos, vistas y cambios.', 'Auditoría')
on conflict (code) do update
set name = excluded.name, description = excluded.description, module = excluded.module;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'audit_logs.view'
where r.code in ('admin', 'mesa_directiva_consulta')
on conflict (role_id, permission_id) do nothing;

-- 2) Permitir seleccionar perfiles familiares con el mismo correo.
create or replace function public.aekia_current_profile_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select up.email
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1
$$;

grant execute on function public.aekia_current_profile_email() to authenticated;

drop policy if exists user_profiles_select_family_same_email_v11 on public.user_profiles;
create policy user_profiles_select_family_same_email_v11
on public.user_profiles
for select
to authenticated
using (
  lower(coalesce(email, '')) = lower(coalesce(public.aekia_current_profile_email(), ''))
);

-- 3) Perfiles disponibles para "Visualizar como".
create or replace function public.aekia_available_view_as_profiles()
returns table (
  id uuid,
  display_name text,
  email text,
  member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_email text;
  v_can_admin boolean := false;
begin
  select up.id, up.email
  into v_profile_id, v_email
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;

  if v_profile_id is null then
    return;
  end if;

  v_can_admin := public.current_user_has_permission('members.view')
    or public.current_user_has_permission('roles.view_admin')
    or public.current_user_has_permission('roles.edit')
    or public.current_user_has_permission('members.edit');

  if v_can_admin then
    return query
    select up.id, coalesce(up.display_name, concat_ws(' ', m.first_names, m.paternal_last_name, m.maternal_last_name), up.email) as display_name, up.email, up.member_id
    from public.user_profiles up
    left join public.members m on m.id = up.member_id
    where up.status = 'active'
    order by case when up.id = v_profile_id then 0 else 1 end, coalesce(up.display_name, m.first_names, up.email);
  else
    return query
    select up.id, coalesce(up.display_name, concat_ws(' ', m.first_names, m.paternal_last_name, m.maternal_last_name), up.email) as display_name, up.email, up.member_id
    from public.user_profiles up
    left join public.members m on m.id = up.member_id
    where up.status = 'active'
      and lower(coalesce(up.email, '')) = lower(coalesce(v_email, ''))
    order by case when up.id = v_profile_id then 0 else 1 end, coalesce(up.display_name, m.first_names, up.email);
  end if;
end;
$$;

grant execute on function public.aekia_available_view_as_profiles() to authenticated;

-- 4) Permisos del perfil visualizado: admin puede ver todos; usuario normal solo perfiles con su mismo correo.
create or replace function public.aekia_permission_codes_for_profile(p_profile_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[] := array[]::text[];
  v_current_email text;
  v_target_email text;
  v_authorized boolean := false;
begin
  select up.email into v_current_email
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;

  select up.email into v_target_email
  from public.user_profiles up
  where up.id = p_profile_id
  limit 1;

  v_authorized := public.current_user_has_permission('roles.view_admin')
    or public.current_user_has_permission('roles.edit')
    or public.current_user_has_permission('roles.manage')
    or public.current_user_has_permission('members.view')
    or public.current_user_has_permission('members.manage')
    or lower(coalesce(v_current_email, '')) = lower(coalesce(v_target_email, ''));

  if not v_authorized then
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

-- 5) Elegibilidad: mismo cálculo que Mi asistencia, filtrando por disciplinas practicadas.
-- Otros cargos solo cuentan como adeudo si ya vencieron; sin fecha límite cuenta como vencido.
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
  with practiced as (
    select md.discipline_id
    from public.member_disciplines md
    where md.member_id = p_member_id
      and md.practices = true
  ), has_practiced as (
    select exists(select 1 from practiced) as has_rows
  ), relevant_sessions as (
    select s.id, s.session_date::date as session_date
    from public.attendance_sessions s
    cross join has_practiced hp
    where coalesce(s.status, 'active') = 'active'
      and s.session_date::date between v_from and v_to
      and (
        hp.has_rows = false
        or s.discipline_id in (select discipline_id from practiced)
      )
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
    and coalesce(opa.payment_status, 'pending') in ('pending', 'partial')
    and (opa.due_date is null or opa.due_date <= current_date);

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

-- 6) Auditoría: función manual, trigger automático y retención FIFO 2 meses.
create or replace function public.aekia_log_event(
  p_module text,
  p_action text,
  p_entity_table text default null,
  p_entity_id uuid default null,
  p_old_values jsonb default null,
  p_new_values jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select public.current_user_profile_id() into v_profile_id;

  insert into public.audit_logs (user_profile_id, module, action, entity_table, entity_id, old_values, new_values)
  values (v_profile_id, coalesce(nullif(trim(p_module), ''), 'Sistema'), coalesce(nullif(trim(p_action), ''), 'evento'), p_entity_table, p_entity_id, p_old_values, p_new_values);

  delete from public.audit_logs where created_at < now() - interval '2 months';
end;
$$;

grant execute on function public.aekia_log_event(text, text, text, uuid, jsonb, jsonb) to authenticated;

create or replace function public.aekia_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_entity_id uuid;
  v_row jsonb;
  v_action text;
begin
  select public.current_user_profile_id() into v_profile_id;

  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_action := 'agregó';
  elsif tg_op = 'UPDATE' then
    v_row := to_jsonb(new);
    v_action := 'actualizó';
  else
    v_row := to_jsonb(old);
    v_action := 'borró';
  end if;

  begin
    if (v_row ? 'id') and (v_row->>'id') ~* '^[0-9a-f-]{36}$' then
      v_entity_id := (v_row->>'id')::uuid;
    end if;
  exception when others then
    v_entity_id := null;
  end;

  insert into public.audit_logs (user_profile_id, module, action, entity_table, entity_id, old_values, new_values)
  values (
    v_profile_id,
    tg_table_name,
    v_action,
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  delete from public.audit_logs where created_at < now() - interval '2 months';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Activar triggers en tablas clave. No se activa sobre audit_logs para evitar recursión.
do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'member_disciplines', 'user_profiles', 'user_roles', 'roles', 'role_permissions',
    'attendance_sessions', 'attendance_records',
    'monthly_payments', 'other_payment_assignments', 'payment_logs',
    'events', 'event_registrations',
    'complaints_suggestions',
    'access_lists', 'access_list_members', 'access_list_external_people'
  ] loop
    execute format('drop trigger if exists trg_aekia_audit_%I on public.%I', t, t);
    execute format('create trigger trg_aekia_audit_%I after insert or update or delete on public.%I for each row execute function public.aekia_audit_trigger()', t, t);
  end loop;
end $$;

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_admin_select on public.audit_logs;
drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy audit_logs_admin_select
on public.audit_logs
for select
to authenticated
using (public.current_user_has_permission('audit_logs.view'));

-- Limpieza inmediata.
delete from public.audit_logs where created_at < now() - interval '2 months';

-- 7) Alertas para usuarios normales y mesa directiva/admin, con dismiss por usuario.
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
  v_member_id uuid;
  v_alerts jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_key text;
  v_dismissed boolean;
begin
  select up.id, up.member_id into v_profile_id, v_member_id
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1;

  if v_profile_id is null then
    return v_alerts;
  end if;

  -- Usuario normal: datos personales incompletos.
  if v_member_id is not null then
    select case when exists (
      select 1
      from public.members m
      where m.id = v_member_id
        and (
          nullif(trim(coalesce(m.curp, '')), '') is null
          or nullif(trim(coalesce(m.email, '')), '') is null
          or nullif(trim(coalesce(m.phone, '')), '') is null
          or nullif(trim(coalesce(m.street, '')), '') is null
          or nullif(trim(coalesce(m.neighborhood, '')), '') is null
          or nullif(trim(coalesce(m.postal_code, '')), '') is null
          or not exists (select 1 from public.member_disciplines md where md.member_id = m.id and md.practices = true)
        )
    ) then 1 else 0 end into v_count;

    v_key := 'own_incomplete_data_' || coalesce(v_member_id::text, 'none') || '_' || v_count::text;
    select exists(select 1 from public.user_alerts where user_profile_id = v_profile_id and status = 'dismissed' and source_module = 'system_alert:' || v_key) into v_dismissed;
    if v_count > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', v_key, 'title', 'Datos por actualizar', 'message', 'Tu expediente tiene datos personales o disciplinas pendientes de actualizar.', 'type', 'warning', 'module', 'datos'));
    end if;

    -- Usuario normal: adeudos vencidos propios.
    with monthly_debt as (
      select 1
      from public.monthly_payment_periods mpp
      left join public.monthly_payments mp on mp.period_id = mpp.id and mp.member_id = v_member_id
      where mpp.payment_year = extract(year from current_date)::integer
        and mpp.payment_month <= extract(month from current_date)::integer
        and coalesce(mp.payment_status, 'pending') not in ('paid', 'waived', 'cancelled')
    ), other_debt as (
      select 1
      from public.other_payment_assignments opa
      where opa.member_id = v_member_id
        and coalesce(opa.payment_status, 'pending') in ('pending', 'partial')
        and (opa.due_date is null or opa.due_date <= current_date)
    )
    select count(*) into v_count from (select * from monthly_debt union all select * from other_debt) d;

    v_key := 'own_payment_debt_' || coalesce(v_member_id::text, 'none') || '_' || v_count::text;
    select exists(select 1 from public.user_alerts where user_profile_id = v_profile_id and status = 'dismissed' and source_module = 'system_alert:' || v_key) into v_dismissed;
    if v_count > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', v_key, 'title', 'Pagos pendientes', 'message', 'Tienes ' || v_count::text || ' adeudo(s) vencido(s).', 'type', 'danger', 'module', 'pagos'));
    end if;
  end if;

  -- Mesa/admin: quejas abiertas.
  if public.current_user_has_permission('complaints.view_admin') or public.current_user_has_permission('complaints.manage') then
    select count(*) into v_count from public.complaints_suggestions where status in ('open', 'in_process');
    v_key := 'complaints_open_' || v_count::text;
    select exists(select 1 from public.user_alerts where user_profile_id = v_profile_id and status = 'dismissed' and source_module = 'system_alert:' || v_key) into v_dismissed;
    if v_count > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', v_key, 'title', 'Quejas pendientes', 'message', 'Hay ' || v_count::text || ' queja(s) o sugerencia(s) abiertas/en proceso.', 'type', 'danger', 'module', 'quejas'));
    end if;
  end if;

  -- Mesa/admin: miembros incompletos.
  if public.current_user_has_permission('members.view') or public.current_user_has_permission('members.manage') then
    select count(*) into v_count
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
    v_key := 'members_incomplete_' || v_count::text;
    select exists(select 1 from public.user_alerts where user_profile_id = v_profile_id and status = 'dismissed' and source_module = 'system_alert:' || v_key) into v_dismissed;
    if v_count > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', v_key, 'title', 'Datos por actualizar', 'message', v_count::text || ' miembro(s) activo(s) tienen datos personales o disciplinas incompletas.', 'type', 'warning', 'module', 'miembros'));
    end if;
  end if;

  -- Mesa/admin: adeudos vencidos.
  if public.current_user_has_permission('payments.view_admin') or public.current_user_has_permission('payments.manage') then
    with monthly_debt as (
      select distinct m.id
      from public.members m
      join public.monthly_payment_periods mpp on mpp.payment_year = extract(year from current_date)::integer and mpp.payment_month <= extract(month from current_date)::integer
      left join public.monthly_payments mp on mp.period_id = mpp.id and mp.member_id = m.id
      where m.status = 'active' and coalesce(mp.payment_status, 'pending') not in ('paid', 'waived', 'cancelled')
    ), other_debt as (
      select distinct opa.member_id as id
      from public.other_payment_assignments opa
      join public.members m on m.id = opa.member_id
      where m.status = 'active'
        and coalesce(opa.payment_status, 'pending') in ('pending', 'partial')
        and (opa.due_date is null or opa.due_date <= current_date)
    )
    select count(distinct id) into v_count from (select id from monthly_debt union select id from other_debt) debt;
    v_key := 'payments_debt_' || v_count::text;
    select exists(select 1 from public.user_alerts where user_profile_id = v_profile_id and status = 'dismissed' and source_module = 'system_alert:' || v_key) into v_dismissed;
    if v_count > 0 and not v_dismissed then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', v_key, 'title', 'Pagos pendientes', 'message', v_count::text || ' miembro(s) tienen mensualidades u otros cargos vencidos.', 'type', 'warning', 'module', 'pagos'));
    end if;
  end if;

  return v_alerts;
end;
$$;

grant execute on function public.aekia_current_alerts() to authenticated;

notify pgrst, 'reload schema';
