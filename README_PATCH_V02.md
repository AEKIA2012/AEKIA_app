# AEKIA Patch v02

Este parche corrige y agrega:

1. `MemberNewAdminPage.tsx`: ya no usa `grade_catalog.sort_order`.
2. `AdminAttendancePage.tsx`: usa combobox por celda, actualización más rápida y exportación Excel `.xlsx`.
3. `AdminPaymentsPage.tsx`: usa combobox por mes, actualización más rápida, orden por pagos al corriente y exportación Excel `.xlsx`.
4. `AdminEventsPage.tsx`, `AdminAccessListsPage.tsx`, `AdminRolesPage.tsx`: grids con desplazamiento horizontal.
5. `src/lib/exportExcel.ts`: helper de exportación a Excel.
6. `scripts/create-member-auth-users.mjs`: crea usuarios Auth para miembros con correo y password temporal `12345678`.

## Copiar archivos

Copia la carpeta `aekia-app` encima de tu proyecto local:

`C:\Users\LCAXA\Documents\Proyectos\aekia-app`

Luego ejecuta:

```cmd
npm install
```

## Crear usuarios de miembros

Usa el mismo CMD donde ya tienes:

```cmd
set SUPABASE_URL=...
set SUPABASE_SERVICE_ROLE_KEY=...
```

Corre:

```cmd
node scripts/create-member-auth-users.mjs
```

Después `lcaxag@hotmail.com` debe entrar con `12345678` y pedir cambio de password.
