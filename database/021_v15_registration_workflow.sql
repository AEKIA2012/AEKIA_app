-- AEKIA v15: solicitudes publicas, revision y alta de acceso tras confirmacion de correo.
-- Aplicar DESPUES de 017 y 020. No afecta solicitudes ni usuarios existentes.
-- REQUISITO: Supabase Authentication > Confirm email = enabled.

alter table public.registration_requests enable row level security;

-- El alta publica debe pasar por la RPC, no por INSERT directo sin control.
revoke insert on public.registration_requests from anon, authenticated;

drop policy if exists registration_requests_admin_read_v15 on public.registration_requests;
create policy registration_requests_admin_read_v15 on public.registration_requests
for select to authenticated
using (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'));

drop policy if exists registration_requests_admin_review_v15 on public.registration_requests;
create policy registration_requests_admin_review_v15 on public.registration_requests
for update to authenticated
using (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'))
with check (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage'));

create or replace function public.aekia_submit_registration_request(
  p_first_names text, p_paternal_last_name text, p_maternal_last_name text,
  p_work_school_name text, p_curp text, p_email text
) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_curp text := upper(regexp_replace(trim(coalesce(p_curp,'')), '\s', '', 'g'));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_id uuid;
begin
  if length(trim(coalesce(p_first_names,''))) not between 1 and 180
    or length(trim(coalesce(p_paternal_last_name,''))) not between 1 and 180
    or length(trim(coalesce(p_maternal_last_name,''))) not between 1 and 180
    or length(trim(coalesce(p_work_school_name,''))) not between 1 and 180 then
    raise exception 'Completa todos los campos.';
  end if;
  if v_curp !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$' then
    raise exception 'CURP incorrecta.';
  end if;
  if length(v_email)>255 or v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' then
    raise exception 'Correo incorrecto.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_curp));
  if exists(select 1 from public.registration_requests rr
            where rr.status in ('pending','approved')
              and (rr.curp=v_curp or lower(rr.email)=v_email)) then
    raise exception 'Ya existe una solicitud con esos datos.';
  end if;
  if exists(select 1 from public.user_profiles up where lower(up.email)=v_email and up.auth_user_id is not null) then
    raise exception 'El correo ya tiene una cuenta. Usa Iniciar sesión.';
  end if;
  insert into public.registration_requests
    (first_names,paternal_last_name,maternal_last_name,work_school_name,curp,email,status)
  values
    (trim(p_first_names),trim(p_paternal_last_name),trim(p_maternal_last_name),
     trim(p_work_school_name),v_curp,v_email,'pending')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.aekia_submit_registration_request(text,text,text,text,text,text) from public;
grant execute on function public.aekia_submit_registration_request(text,text,text,text,text,text) to anon, authenticated;

create or replace function public.aekia_review_registration_request(
  p_request_id uuid, p_status text, p_admin_comment text default ''
) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_req public.registration_requests%rowtype;
begin
  if not (public.current_user_has_permission('members.edit') or public.current_user_has_permission('members.manage')) then
    raise exception 'No autorizado.';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'Estado inválido.'; end if;
  select * into v_req from public.registration_requests where id=p_request_id and status='pending' for update;
  if not found then raise exception 'La solicitud ya fue procesada.'; end if;
  if p_status='approved' and not exists(
    select 1 from public.members m where m.curp=v_req.curp
      and m.status='active' and lower(trim(coalesce(m.email,'')))=lower(trim(v_req.email))
  ) then
    raise exception 'Primero registra al miembro activo y verifica que su correo coincida con la solicitud.';
  end if;
  if p_status='approved' and exists(
    select 1 from public.user_profiles up
    where lower(up.email)=lower(v_req.email) and up.auth_user_id is not null
  ) then
    raise exception 'El correo ya tiene cuenta activa.';
  end if;
  update public.registration_requests
  set status=p_status, reviewed_at=now(), reviewed_by=public.current_user_profile_id(),
      admin_comment=nullif(trim(coalesce(p_admin_comment,'')),'')
  where id=p_request_id;
end;
$$;

revoke all on function public.aekia_review_registration_request(uuid,text,text) from public;
grant execute on function public.aekia_review_registration_request(uuid,text,text) to authenticated;

-- El administrador puede dar de alta a un miembro directamente y preparar
-- su activación sin crear contraseñas ni usar una service_role en el navegador.
create or replace function public.aekia_admin_prepare_member_access(p_member_id uuid)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_email text;
  v_request_id uuid;
begin
  if not (public.current_user_has_permission('members.edit')
      or public.current_user_has_permission('members.manage')) then
    raise exception 'No autorizado.';
  end if;

  select * into v_member from public.members
  where id=p_member_id and status='active' for update;
  if not found then raise exception 'El miembro no está activo o no existe.'; end if;

  v_email := lower(trim(coalesce(v_member.email,'')));
  if v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' then
    raise exception 'Registra un correo válido en la ficha del miembro.';
  end if;
  if exists (
    select 1 from public.user_profiles up
    where (lower(up.email)=v_email or up.member_id=p_member_id)
      and up.auth_user_id is not null
  ) then
    raise exception 'Ese correo ya tiene acceso activo. Verifica la cuenta existente.';
  end if;
  if exists (
    select 1 from public.registration_requests rr
    where rr.status='approved' and
      (rr.curp=v_member.curp or lower(rr.email)=v_email) and
      (rr.curp<>v_member.curp or lower(rr.email)<>v_email)
  ) then
    raise exception 'Hay una aprobación con esos datos asociada a otra identidad.';
  end if;

  select id into v_request_id from public.registration_requests
  where curp=v_member.curp and lower(email)=v_email and status='approved'
  order by reviewed_at desc limit 1;
  if v_request_id is not null then return v_request_id; end if;

  select id into v_request_id from public.registration_requests
  where curp=v_member.curp and lower(email)=v_email and status='pending'
  order by created_at desc limit 1 for update;

  if v_request_id is not null then
    update public.registration_requests set status='approved', reviewed_at=now(),
      reviewed_by=public.current_user_profile_id(),
      admin_comment='Acceso preparado desde ficha de miembro'
    where id=v_request_id;
  else
    insert into public.registration_requests (
      first_names,paternal_last_name,maternal_last_name,work_school_name,
      curp,email,status,reviewed_at,reviewed_by,admin_comment
    ) values (
      v_member.first_names,v_member.paternal_last_name,v_member.maternal_last_name,
      v_member.work_school_name,v_member.curp,v_email,'approved',now(),
      public.current_user_profile_id(),'Acceso preparado desde ficha de miembro'
    ) returning id into v_request_id;
  end if;
  return v_request_id;
end;
$$;
revoke all on function public.aekia_admin_prepare_member_access(uuid) from public;
grant execute on function public.aekia_admin_prepare_member_access(uuid) to authenticated;

create or replace function public.aekia_registration_activation_ready(p_email text)
returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$
  select exists (
    select 1 from public.registration_requests rr
    join public.members m on m.curp=rr.curp and m.status='active'
      and lower(trim(coalesce(m.email,'')))=lower(trim(rr.email))
    where lower(rr.email)=lower(trim(p_email)) and rr.status='approved'
  ) and not exists (
    select 1 from public.user_profiles up
    where lower(up.email)=lower(trim(p_email)) and up.auth_user_id is not null
  );
$$;
revoke all on function public.aekia_registration_activation_ready(text) from public;
grant execute on function public.aekia_registration_activation_ready(text) to anon,authenticated;

-- Vincular Auth -> perfil/miembro SOLAMENTE si Supabase confirmó el correo
-- y el administrador ya aprobó la solicitud para ese miembro.
create or replace function public.aekia_link_approved_signup_v15()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_req public.registration_requests%rowtype;
  v_member_id uuid;
  v_profile_id uuid;
  v_existing_user_id uuid;
  v_existing_member_id uuid;
  v_role_id uuid;
begin
  if new.email_confirmed_at is null or new.email is null then return new; end if;
  select * into v_req from public.registration_requests rr
  where lower(rr.email)=lower(new.email) and rr.status='approved'
  order by rr.reviewed_at desc limit 1;
  if not found then return new; end if;

  select id into v_member_id from public.members
  where curp=v_req.curp and status='active'
    and lower(trim(coalesce(email,'')))=lower(trim(v_req.email));
  if v_member_id is null then return new; end if;
  select id,auth_user_id,member_id into v_profile_id,v_existing_user_id,v_existing_member_id
  from public.user_profiles where lower(email)=lower(new.email) limit 1;
  if v_profile_id is not null then
    if v_existing_user_id is not null and v_existing_user_id<>new.id then return new; end if;
    if v_existing_member_id is not null and v_existing_member_id<>v_member_id then return new; end if;
    update public.user_profiles set auth_user_id=new.id,member_id=v_member_id,status='active',
      must_change_password=false,updated_at=now() where id=v_profile_id;
  else
    insert into public.user_profiles(auth_user_id,member_id,email,display_name,status,must_change_password)
    values(new.id,v_member_id,lower(new.email),concat_ws(' ',v_req.first_names,v_req.paternal_last_name,v_req.maternal_last_name),'active',false)
    returning id into v_profile_id;
  end if;

  select id into v_role_id from public.roles where code='member' and status='active';
  if v_role_id is not null then
    insert into public.user_roles(user_profile_id,role_id,status)
    values(v_profile_id,v_role_id,'active')
    on conflict(user_profile_id,role_id) do update set status='active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_aekia_auth_approved_signup_v15 on auth.users;
create trigger trg_aekia_auth_approved_signup_v15
after insert or update of email_confirmed_at on auth.users
for each row when (new.email_confirmed_at is not null)
execute function public.aekia_link_approved_signup_v15();

notify pgrst,'reload schema';
