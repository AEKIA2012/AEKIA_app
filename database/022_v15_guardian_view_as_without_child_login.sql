-- AEKIA v15: mostrar hijos vinculados sin inventarles un correo/login.
-- No inserta parentescos ni modifica correos. Aplicar despues de 021.

create or replace function public.aekia_family_view_as_profiles()
returns table(id uuid,display_name text,email text,member_id uuid)
language sql stable security definer set search_path=public,pg_temp
as $$
  select m.id,
    trim(concat_ws(' ',m.first_names,m.paternal_last_name,nullif(m.maternal_last_name,'.'))),
    coalesce(m.email,''),m.id
  from public.member_guardians mg
  join public.members m on m.id=mg.minor_member_id
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and parent.status='active'
    and mg.status='active' and mg.can_view_data=true and m.status='active'
    and not exists(select 1 from public.user_profiles child where child.member_id=m.id and child.status='active');
$$;
revoke all on function public.aekia_family_view_as_profiles() from public;
grant execute on function public.aekia_family_view_as_profiles() to authenticated;

create or replace function public.aekia_family_member_for_view_as(p_member_id uuid)
returns table(id uuid,auth_user_id uuid,member_id uuid,email text,display_name text,status text)
language sql stable security definer set search_path=public,pg_temp
as $$
  select m.id,null::uuid,m.id,coalesce(m.email,''),
    trim(concat_ws(' ',m.first_names,m.paternal_last_name,nullif(m.maternal_last_name,'.'))),m.status
  from public.aekia_family_view_as_profiles() allowed
  join public.members m on m.id=allowed.member_id
  where allowed.id=p_member_id;
$$;
revoke all on function public.aekia_family_member_for_view_as(uuid) from public;
grant execute on function public.aekia_family_member_for_view_as(uuid) to authenticated;

drop policy if exists member_guardians_admin_edit_v15 on public.member_guardians;
create policy member_guardians_admin_edit_v15 on public.member_guardians
for all to authenticated
using (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'));

-- Permisos de lectura por parentesco, independientes de la existencia de Auth del menor.
drop policy if exists attendance_records_guardian_select_v15 on public.attendance_records;
create policy attendance_records_guardian_select_v15 on public.attendance_records
for select to authenticated using (exists(
  select 1 from public.member_guardians mg
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and mg.minor_member_id=attendance_records.member_id
    and mg.status='active' and mg.can_view_data=true
));

drop policy if exists monthly_payments_guardian_select_v15 on public.monthly_payments;
create policy monthly_payments_guardian_select_v15 on public.monthly_payments
for select to authenticated using (exists(
  select 1 from public.member_guardians mg
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and mg.minor_member_id=monthly_payments.member_id
    and mg.status='active' and mg.can_view_payments=true
));

drop policy if exists other_payments_guardian_select_v15 on public.other_payment_assignments;
create policy other_payments_guardian_select_v15 on public.other_payment_assignments
for select to authenticated using (exists(
  select 1 from public.member_guardians mg
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and mg.minor_member_id=other_payment_assignments.member_id
    and mg.status='active' and mg.can_view_payments=true
));

drop policy if exists event_registrations_guardian_select_v15 on public.event_registrations;
create policy event_registrations_guardian_select_v15 on public.event_registrations
for select to authenticated using (exists(
  select 1 from public.member_guardians mg
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and mg.minor_member_id=event_registrations.member_id
    and mg.status='active' and mg.can_register_events=true
));

drop policy if exists event_registrations_guardian_insert_v15 on public.event_registrations;
create policy event_registrations_guardian_insert_v15 on public.event_registrations
for insert to authenticated with check (exists(
  select 1 from public.member_guardians mg
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and mg.minor_member_id=event_registrations.member_id
    and mg.status='active' and mg.can_register_events=true
));

drop policy if exists event_registrations_guardian_update_v15 on public.event_registrations;
create policy event_registrations_guardian_update_v15 on public.event_registrations
for update to authenticated using (exists(
  select 1 from public.member_guardians mg
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and mg.minor_member_id=event_registrations.member_id
    and mg.status='active' and mg.can_register_events=true
)) with check (exists(
  select 1 from public.member_guardians mg
  join public.user_profiles parent on parent.member_id=mg.guardian_member_id
  where parent.auth_user_id=auth.uid() and mg.minor_member_id=event_registrations.member_id
    and mg.status='active' and mg.can_register_events=true
));

-- La RPC previa de elegibilidad era SECURITY DEFINER y aceptaba cualquier UUID.
-- Exponer solo el wrapper que comprueba pertenencia, parentesco o permiso admin.
revoke execute on function public.aekia_member_event_eligibility(uuid) from public,anon,authenticated;

create or replace function public.aekia_authorized_member_event_eligibility(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if not (
    exists(select 1 from public.user_profiles up
      where up.auth_user_id=auth.uid() and up.member_id=p_member_id and up.status='active')
    or exists(select 1 from public.member_guardians mg
      join public.user_profiles up on up.member_id=mg.guardian_member_id
      where up.auth_user_id=auth.uid() and up.status='active'
      and mg.minor_member_id=p_member_id and mg.status='active' and mg.can_view_data=true)
    or public.current_user_has_permission('members.view')
    or public.current_user_has_permission('members.edit')
    or public.current_user_has_permission('members.manage')
  ) then
    raise exception 'No autorizado para consultar elegibilidad.';
  end if;
  return public.aekia_member_event_eligibility(p_member_id);
end;
$$;
revoke all on function public.aekia_authorized_member_event_eligibility(uuid) from public;
grant execute on function public.aekia_authorized_member_event_eligibility(uuid) to authenticated;

notify pgrst,'reload schema';
