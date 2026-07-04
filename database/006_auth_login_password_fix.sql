-- =========================================================
-- AEKIA Auth Fix v03
-- Corrige:
-- 1) Validación de correo antes de login.
-- 2) Mensajes de correo no registrado / inactivo.
-- 3) Marcado seguro de password cambiado.
-- =========================================================

create or replace function public.aekia_login_email_status(input_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_status text;
begin
  select up.status
    into profile_status
  from public.user_profiles up
  where lower(trim(up.email)) = lower(trim(input_email))
  order by up.created_at desc
  limit 1;

  if profile_status is null then
    return 'not_registered';
  end if;

  if profile_status <> 'active' then
    return 'inactive';
  end if;

  return 'registered';
end;
$$;

grant execute on function public.aekia_login_email_status(text) to anon;
grant execute on function public.aekia_login_email_status(text) to authenticated;

create or replace function public.aekia_mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set must_change_password = false,
      updated_at = now()
  where auth_user_id = auth.uid();
end;
$$;

grant execute on function public.aekia_mark_password_changed() to authenticated;

-- Permite que el usuario lea su propio perfil. Si ya existe, se recrea limpio.
drop policy if exists user_profiles_select_own_v03 on public.user_profiles;
create policy user_profiles_select_own_v03
on public.user_profiles
for select
to authenticated
using (auth_user_id = auth.uid());

-- Política directa para actualización propia. La app usa RPC para password,
-- pero esta política ayuda para futuras pantallas de perfil.
drop policy if exists user_profiles_update_own_v03 on public.user_profiles;
create policy user_profiles_update_own_v03
on public.user_profiles
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());
