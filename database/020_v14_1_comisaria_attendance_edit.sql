-- AEKIA v14.1: permitir a Comisaria administrar las asistencias.
-- Ejecutar en Supabase SQL Editor DESPUES de 017/v14.
-- Idempotente: no modifica miembros ni registros de asistencia.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'attendance.edit'
where r.code = 'comisaria'
  and r.status = 'active'
on conflict (role_id, permission_id) do nothing;

notify pgrst, 'reload schema';

-- Verificacion de solo lectura; debe devolver una fila:
select r.code as rol, p.code as permiso, r.status as estado
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.permissions p on p.id = rp.permission_id
where r.code = 'comisaria'
  and p.code = 'attendance.edit';
