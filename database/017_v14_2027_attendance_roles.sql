-- AEKIA v14 - ejecutar completo DESPUES de 016/v13, primero en Supabase SQL Editor.
-- No borra asistencia, pagos, perfiles, tutores ni periodos historicos.

-- Una fecha creada no cuenta hasta que Comisaria confirme que hubo clase.
alter table public.attendance_sessions
  add column if not exists counts_for_eligibility boolean not null default false;

comment on column public.attendance_sessions.counts_for_eligibility is
  'Confirmada como clase realizada para el calculo reglamentario desde 2027; las canceladas y las futuras no cuentan.';

-- Etiquetas de roles por perfil, incluido "Visualizar como", respetando la autorizacion v13.
create or replace function public.aekia_roles_for_profile(p_profile_id uuid)
returns table (id uuid, code text, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.aekia_available_view_as_profiles() allowed
    where allowed.id = p_profile_id
  ) then
    raise exception 'No autorizado para consultar los roles de este perfil.';
  end if;

  return query
  select r.id, r.code, r.name
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_profile_id = p_profile_id
    and ur.status = 'active'
    and r.status = 'active'
  order by case when r.code = 'member' then 1 else 0 end, r.name;
end;
$$;

revoke all on function public.aekia_roles_for_profile(uuid) from public;
grant execute on function public.aekia_roles_for_profile(uuid) to authenticated;

-- Desde enero 2027, 75% de semanas con clase REALIZADA por mes (ceil).
-- Una asistencia puntual cuenta una sola vez por semana, sin importar el numero de clases.
-- Una semana lunes-domingo que cruza meses pertenece al mes del lunes; la
-- primera semana de 2027 se asigna a enero aunque su lunes fue en diciembre.
-- Ultimos 3 meses calendario, sin consultar asistencia anterior a 2027.
-- Sin semanas computables => no hay evaluacion, NUNCA 100% automatico.
create or replace function public.aekia_member_event_eligibility(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := greatest(date '2027-01-01', (date_trunc('month', current_date) - interval '2 months')::date);
  v_to date := current_date;
  v_total_class_weeks integer := 0;
  v_required_attendances integer := 0;
  v_completed_weeks integer := 0;
  v_punctual_attendances integer := 0;
  v_attendance_percent integer := 0;
  v_monthly_debt integer := 0;
  v_other_debt integer := 0;
  v_payment_debt integer := 0;
  v_evaluation_state text := 'not_started';
  v_attendance_ok boolean := false;
  v_payments_ok boolean := false;
begin
  if v_to >= date '2027-01-01' then
    with practiced as (
      select md.discipline_id
      from public.member_disciplines md
      where md.member_id = p_member_id and md.practices = true
    ), has_practiced as (
      select exists(select 1 from practiced) as has_rows
    ), relevant_sessions as (
      select s.id,
        to_char(greatest(date_trunc('week', s.session_date)::date, date '2027-01-01'), 'YYYY-MM') as month_key,
        date_trunc('week', s.session_date)::date as week_start
      from public.attendance_sessions s
      cross join has_practiced hp
      where s.status = 'active'
        and s.counts_for_eligibility = true
        and s.session_date between v_from and v_to
        and (hp.has_rows = false or s.discipline_id in (select discipline_id from practiced))
    ), class_weeks as (
      select distinct month_key, week_start from relevant_sessions
    ), present_weeks as (
      select distinct rs.month_key, rs.week_start
      from public.attendance_records ar
      join relevant_sessions rs on rs.id = ar.session_id
      where ar.member_id = p_member_id and ar.attendance_status = 'present'
    ), monthly_calc as (
      select c.month_key,
        count(distinct c.week_start)::integer as class_weeks,
        ceil(count(distinct c.week_start) * 0.75)::integer as required_weeks,
        count(distinct p.week_start)::integer as present_weeks
      from class_weeks c
      left join present_weeks p
        on p.month_key = c.month_key and p.week_start = c.week_start
      group by c.month_key
    )
    select coalesce(sum(class_weeks), 0)::integer,
      coalesce(sum(required_weeks), 0)::integer,
      coalesce(sum(least(present_weeks, required_weeks)), 0)::integer,
      coalesce((select count(*) from public.attendance_records ar
        join relevant_sessions rs on rs.id = ar.session_id
        where ar.member_id = p_member_id and ar.attendance_status = 'present'), 0)::integer
    into v_total_class_weeks, v_required_attendances, v_completed_weeks, v_punctual_attendances
    from monthly_calc;

    v_evaluation_state := case when v_required_attendances = 0 then 'no_classes' else 'evaluated' end;
    if v_required_attendances > 0 then
      v_attendance_percent := least(100, round(100.0 * v_completed_weeks / v_required_attendances)::integer);
    end if;
  end if;

  -- Si no hubo semanas impartidas, no castigar al alumno por falta de clases.
  -- No se reporta 100%: evaluation_state sigue indicando que no hay evaluacion.
  v_attendance_ok := v_evaluation_state <> 'evaluated'
    or (v_required_attendances > 0 and v_completed_weeks >= v_required_attendances);

  -- Conservar y considerar mensualidades historicas vencidas (no borrar 2026).
  select count(*) into v_monthly_debt
  from public.monthly_payment_periods mpp
  left join public.monthly_payments mp
    on mp.period_id = mpp.id and mp.member_id = p_member_id
  where mpp.status = 'active'
    and make_date(mpp.payment_year, mpp.payment_month, 1) <= date_trunc('month', current_date)::date
    -- No inventar adeudos retroactivos por meses historicos sin registro.
    -- En el año actual se mantiene la regla anterior: mes sin pago = pendiente.
    and (mpp.payment_year = extract(year from current_date)::integer or mp.id is not null)
    and coalesce(mp.payment_status, 'pending') not in ('paid', 'waived', 'cancelled');

  select count(*) into v_other_debt
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
    'evaluation_state', v_evaluation_state,
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

revoke all on function public.aekia_member_event_eligibility(uuid) from public;
grant execute on function public.aekia_member_event_eligibility(uuid) to authenticated;

notify pgrst, 'reload schema';
