# AEKIA v14 — Roles visibles, UX y asistencia 2027

Fecha: 23/11/2026. Base: v13 fusionada a `main` (`40dd9da`).

## Incluye

1. Modal visible **Operación realizada / Entendido** para datos personales, quejas, roles, listas de acceso, edición/alta de miembros, pagos (abonos), eventos y control de asistencia. El formulario conserva su posición.
2. Lista de miembros en tarjetas de ancho adaptable, sin tabla gigante ni scroll horizontal.
3. Control de asistencia con pestañas **Por fecha**, **Por persona** y **Calendario**. Registros sin capturar ya no aparecen como faltas; se pueden editar y limpiar. Sesiones canceladas se conservan en el historial.
4. Fechas nuevas requieren disciplina; el administrador confirma que la clase se realizó. **Crear una sesión no la convierte automáticamente en semana computable**.
5. Desde 01/01/2027, asistencia reglamentaria dinámica: por cada mes, `ceil(75% × semanas realmente impartidas)`. Una asistencia puntual cuenta una sola vez por semana, aunque el integrante asista a varias clases. Semanas canceladas, futuras y no confirmadas se excluyen. Las semanas que cruzan meses pertenecen al mes del lunes; la primera de 2027 se asigna a enero.
6. Cero semanas impartidas muestra **Sin evaluación**, no 100%. Mientras no exista un periodo evaluable, la falta de clases no bloquea inscripciones por asistencia; los pagos vencidos sí pueden bloquear.
7. El menú principal destaca los **roles reales activos** del perfil, incluso al usar «Visualizar como» (el menú sigue filtrando permisos como antes).
8. Las mensualidades de años anteriores conservan registro y permiten abonos retroactivos. Adeudos históricos explícitos y todavía pendientes cuentan; NO se generan adeudos históricos ficticios para meses sin registro.

**No incluye:** importación del Excel 2027 (pendiente de recibir), cambios a datos de miembros, contraseñas, creación de perfiles de menores ni despliegue automático. La función familiar existente permanece; se añade un diagnóstico de solo lectura para probar tutor/menor y detectar si al menor le falta perfil.

## Archivos de base de datos

- `database/017_v14_2027_attendance_roles.sql`: **OBLIGATORIO**. Ejecutar una vez en SQL Editor del proyecto Supabase correcto (`oriwjxbqghyxhrexcael`), después de 016. No borra datos.
- `private_queries/018_v14_cambiar_mi_rol_por_numero.sql`: **OPCIONAL y PRIVADO**. Por defecto desactiva `comisaria` del correo personal configurado, para revertir la prueba del usuario. Cambia `v_rol_numero` y `v_activar`; acepta 1=admin, 2=comisaria, 3=control_accesos_dojo, 4=mesa_directiva_consulta, 5=tesoreria, 6=member; 7=secretario está inactivo y se rechaza.
- `private_queries/019_v14_diagnostico_padres_hijos.sql`: **OPCIONAL, PRIVADO y de solo lectura**. Muestra vínculos y permisos existentes para el tutor enlazado con ese correo.

**Importante:** no copies `private_queries/` al repositorio ni lo incluyas en Git. Los SQL 018/019 van en el ZIP solo para tu uso directo en SQL Editor.

Antes de ejecutar 017, guardar copia del SQL de la función actual mediante:

```sql
select pg_get_functiondef('public.aekia_member_event_eligibility(uuid)'::regprocedure);
```

Verificar que se tiene respaldo general de Supabase. **No ejecutar 001..016 otra vez**.

## Aplicar el parche en tu Windows (PowerShell)

1. En `C:\Users\LCAXA\Documents\Proyectos\aekia-app`:

```powershell
git switch main
git pull --ff-only origin main
git status -sb
git switch -c release/v14-20261123
```

2. Descomprimir este ZIP *fuera* del repositorio, en Descargas. Su carpeta interna es `aekia-app`.
3. Copiar **solo** `src` y el SQL obligatorio `017`. Los SQL privados `018/019` se ejecutan desde Descargas, sin copiarlos al repositorio. En este ejemplo, sustituir la ruta del ZIP descomprimido si cambia:

```powershell
$patch = 'C:\Users\LCAXA\Downloads\aekia_patch_v14_2027\aekia-app'
Copy-Item -Path "$patch\src\*" -Destination '.\src' -Recurse -Force
Copy-Item -Path "$patch\database\017_v14_2027_attendance_roles.sql" -Destination '.\database' -Force
Copy-Item -Path "$patch\README_PATCH_V14.md" -Destination '.' -Force
npm.cmd run build
```

4. Ejecutar primero el SQL 017 en Supabase. El menú de roles y los cambios de asistencia requieren esa migración. Los scripts privados de `private_queries/` no son requisito para publicar.

5. Revisar que no haya archivos privados en el staged:

```powershell
git status -sb
git add src database/017_v14_2027_attendance_roles.sql README_PATCH_V14.md
git diff --cached --name-only
git diff --cached --check
git commit -m "AEKIA v14: attendance 2027, role badges and UX"
git push -u origin release/v14-20261123
```

6. Abrir PR en GitHub: base `main` ← compare `release/v14-20261123`. **Probar primero el deployment Preview** de Vercel; luego fusionar si todo funciona y esperar `Ready` en producción.
7. Después del merge:

```powershell
git switch main
git pull --ff-only origin main
git status -sb
```

## Pruebas mínimas (en Preview)

- Entrar a `/login` directamente, refrescar y volver a entrar con usuario real.
- Ir a Datos personales, bajar al final, guardar, comprobar que aparece el modal **Entendido** sin tener que subir.
- Ver el recuadro de roles reales en Menú principal; con tu prueba de Comisaría debería mostrar `Comisaría` y `Usuario`. Para quitarlo, ejecutar **018 como viene**, refrescar sesión y comprobar que queda `Usuario`.
- Lista de miembros: nombres, dojo, disciplinas, correo y botón Ver visibles sin desplazamiento lateral.
- Control asistencia: cambiar las tres pestañas. Seleccionar clase histórica; una casilla sin registro debe decir **Sin capturar**, no **Falta**. Marcar y corregir individualmente con usuario autorizado.
- En Calendario, crear un entrenamiento con disciplina y comprobar que nace como **Programada**. No confirmar fechas futuras; no marcar retroactivamente una sesión 2026 como evaluación 2027.
- El módulo personal debe mostrar **Sin evaluación** antes de enero 2027, conservando la consulta de asistencias anteriores al ajustar fechas.
- Revisar un pago 2026 desde Control de pagos (cambiar año), sin modificarlo si solo estás comprobando.
- Para padre-hijo, ejecutar el SQL privado `019` desde Descargas y probar con usuario real de tutor. Si el menor no tiene perfil en `user_profiles`, la v13/v14 todavía requiere una mejora específica de «Visualizar como»; NO crear cuentas duplicadas ni reutilizar correos solo para forzar la prueba.

## Validación de esta entrega

- Compilación `npm run build`: OK (TypeScript y Vite).
- Prueba aislada de regla semanal: **5 semanas impartidas => 4 requeridas**; **0 semanas => Sin evaluación**, OK.
- SQL 017 preparado según el esquema de v13, **pendiente de ejecutar y validar en Supabase real**.
- La app no se ha desplegado directamente desde este paquete. Después de las pruebas, abrir PR y fusionar como v13.
