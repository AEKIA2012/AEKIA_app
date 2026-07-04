# AEKIA App - paquete full screens v01

Este paquete corrige el problema de `grade_catalog.sort_order` y agrega pantallas funcionales base para todos los módulos del mockup.

## Archivos clave modificados

- `src/App.tsx`: rutas reales para todos los módulos.
- `src/pages/PersonalDataPage.tsx`
- `src/pages/AttendancePage.tsx`
- `src/pages/PaymentsPage.tsx`
- `src/pages/EventRegistrationPage.tsx`
- `src/pages/ComplaintsPage.tsx`
- `src/pages/admin/AdminAttendancePage.tsx`
- `src/pages/admin/AdminPaymentsPage.tsx`
- `src/pages/admin/AdminEventsPage.tsx`
- `src/pages/admin/AdminComplaintsPage.tsx`
- `src/pages/admin/AdminAccessListsPage.tsx`
- `src/pages/admin/AdminRolesPage.tsx`
- `src/pages/admin/MemberNewAdminPage.tsx`: se quitó `sort_order`.
- `src/components/ModuleShell.tsx`, `src/components/FormControls.tsx`
- `src/lib/helpers.ts`, `src/lib/useCurrentProfile.ts`

## Base de datos

Ejecuta en Supabase SQL Editor:

```sql
-- Ejecuta completo:
-- database/005_aekia_finish_modules.sql
```

Este SQL:

- Asegura `grade_order` para `grade_catalog`.
- Inserta/actualiza grados por disciplina.
- Crea políticas RLS para asistencia, pagos, eventos, quejas, listas de acceso y alertas.
- Siembra periodos 2025/2026/2027, eventos base, listas de acceso base y roles de mesa directiva.
- Agrega función de limpieza de logs mayores a 90 días.

## Importar datos operativos

Primero asegúrate de tener estos archivos en `/data`:

- `Asistencias Kendo 2025.xlsx`
- `Asistencias Kendo 2026.xlsx`
- `Mensualidades .xlsx`
- `_Mensualidades 2026.xlsx`
- `（水）学校開放受付＆チェックリスト【AGS剣友会】.xls`
- `（日）学校開放受付＆チェックリスト【AGS剣友会】.xls`

Luego en CMD:

```cmd
set SUPABASE_URL=https://TU-PROYECTO.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
node scripts/import-aekia-operational-data.mjs data
```

## Importante

- Nunca pongas `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.
- La app web solo debe usar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` o `VITE_SUPABASE_ANON_KEY`.
- Si sale error de Vite por dependencias, ejecuta `npm install` antes de `npm run dev`.

## Estado

Esto deja pantallas navegables y base funcional para probar flujo completo. Después conviene ajustar puntualmente:

1. Edición avanzada de listas de acceso con externos dentro del UI.
2. Detalle de logs de pagos.
3. Asignación masiva de candidatos en eventos.
4. Validaciones futuras: asistencia + pagos antes de permitir registro a eventos.
