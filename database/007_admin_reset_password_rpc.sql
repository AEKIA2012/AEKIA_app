-- =========================================================
-- AEKIA Auth Fix v04 - Reset password desde botón de miembro
-- Crea una función RPC para que usuarios con members.manage puedan
-- reiniciar el password de un miembro a 12345678 y forzar cambio.
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_reset_member_password(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target_email text;
  target_auth_id uuid;
  target_profile_id uuid;
  actor_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado.';
  end if;

  if not public.current_user_has_permission('members.manage') then
    raise exception 'No tienes permiso para reiniciar passwords.';
  end if;

  select public.current_user_profile_id()
    into actor_profile_id;

  select
    lower(trim(m.email)),
    up.auth_user_id,
    up.id
  into
    target_email,
    target_auth_id,
    target_profile_id
  from public.members m
  left join public.user_profiles up
    on up.member_id = m.id
  where m.id = p_member_id
  limit 1;

  if target_email is null or target_email = '' then
    raise exception 'El miembro no tiene correo registrado.';
  end if;

  if target_profile_id is null then
    select up.id, up.auth_user_id
      into target_profile_id, target_auth_id
    from public.user_profiles up
    where lower(trim(up.email)) = target_email
    order by up.created_at desc
    limit 1;
  end if;

  if target_auth_id is null then
    select au.id
      into target_auth_id
    from auth.users au
    where lower(trim(au.email)) = target_email
    limit 1;
  end if;

  if target_auth_id is null then
    raise exception 'No existe usuario Auth para %. Ejecuta scripts/create-member-auth-users.mjs primero.', target_email;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt('12345678', extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = target_auth_id;

  update public.user_profiles
  set auth_user_id = target_auth_id,
      must_change_password = true,
      status = 'active',
      updated_at = now()
  where id = target_profile_id;

  insert into public.audit_logs (
    user_profile_id,
    module,
    action,
    entity_table,
    entity_id,
    old_values,
    new_values
  )
  values (
    actor_profile_id,
    'members',
    'reset_password',
    'members',
    p_member_id,
    jsonb_build_object('email', target_email),
    jsonb_build_object('temporary_password_set', true, 'must_change_password', true)
  );

  return 'Password reiniciado a 12345678. El usuario deberá cambiarlo al entrar.';
end;
$$;

grant execute on function public.admin_reset_member_password(uuid) to authenticated;
