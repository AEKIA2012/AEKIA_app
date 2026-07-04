# AEKIA Patch v04 - Auth + botón reiniciar password

Incluye:

- `src/pages/LoginPage.tsx`: mensajes de correo no registrado, inactivo y password incorrecto.
- `src/pages/ChangePasswordPage.tsx`: actualiza password y quita `must_change_password` con RPC.
- `src/components/ProtectedRoute.tsx`: valida `must_change_password`.
- `database/006_auth_login_password_fix.sql`: funciones para login/cambio de password.
- `database/007_admin_reset_password_rpc.sql`: RPC para botón admin de reset de password.
- `src/pages/admin/MemberDetailAdminPage.tsx`: botón funcional "Reiniciar password a 12345678".
- `scripts/reset-member-password.mjs`: reset manual desde CMD si lo necesitas.

## Pasos

1. Copia esta carpeta `aekia-app` sobre tu proyecto.
2. En Supabase SQL Editor ejecuta completo:
   - `database/006_auth_login_password_fix.sql`
   - `database/007_admin_reset_password_rpc.sql`
3. Reinicia la app con `npm run dev`.
4. Prueba el botón desde: Lista de miembros > Ver > Reiniciar password a 12345678.

No pongas la service_role key dentro del frontend. El botón usa una función segura en Supabase que revisa permiso `members.manage`.
