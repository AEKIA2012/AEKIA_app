# AEKIA Patch v06 - Ajustes finales de módulos

## Aplicación
Copia la carpeta `aekia-app` sobre tu proyecto local y acepta reemplazar archivos.

Proyecto local:
`C:\Users\LCAXA\Documents\Proyectos\aekia-app`

Después ejecuta:

```cmd
cd C:\Users\LCAXA\Documents\Proyectos\aekia-app
npm install
npm run dev
```

## SQL obligatorio
Ejecuta en Supabase SQL Editor:

```text
database/009_roles_dynamic_and_finish_modules.sql
```

## Cambios principales

- Pagos de usuario: ✓ verde, parcial amarillo y pendiente rojo.
- Quejas usuario/admin: detalle en ventana modal, no alert flotante.
- Asistencia usuario: fecha + día de la semana; se elimina el texto raro de entrenamiento.
- Datos personales: dojo bloqueado para usuario normal, checkboxes No aplica corregidos, grados por disciplina editables.
- Admin quejas: exporta detalle, fecha de resolución y botón detalle a la izquierda.
- Admin pagos: vista por tarjetas, más cómoda que 12 columnas horizontales; nuevo cargo individual con monto por persona.
- Eventos: detalle en modal, edición, reactivación/cancelación y descarga de inscritos.
- Listas de acceso: dos grids separados, editar nombre, copiar lista, exportar Excel tipo formato japonés.
- Roles y permisos: edición dinámica de roles, usuarios asignados y permisos del rol.
- SQL: agrega permiso `members.japanese_name.edit`, ajuste de pagos parciales y constraints para asignaciones dinámicas.

## Nota de listas de acceso
El exportador genera un `.xls` compatible con Excel usando una tabla HTML con estructura japonesa, nombres, empresa/escuela, firmas, horarios, notas y bloque bilingüe. Mantiene la lógica del formato adjunto y permite abrirlo en Excel.
