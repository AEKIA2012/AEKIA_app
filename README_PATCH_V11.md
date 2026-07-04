# AEKIA Patch V11

Correcciones incluidas:

- Otros cargos solo cuentan como adeudo si ya llegó la fecha límite de pago; sin fecha límite cuentan como vencidos.
- El cálculo de aptitud usa el mismo criterio que Mi asistencia: sesiones reales de las disciplinas que practica el miembro, 1 asistencia puntual por semana, máximo 9 semanas requeridas en 3 meses.
- Visualizar como usuario ahora también funciona para familias con el mismo correo; usuarios normales solo ven perfiles con su mismo correo.
- El buscador de visualizar como muestra resultados tocables y cambia automáticamente al usuario seleccionado.
- Alertas reales disponibles desde el icono de alertas en cualquier módulo, tanto para usuarios normales como mesa directiva/admin.
- Nuevo módulo admin: Log / auditoría.
- Auditoría automática de inserts, updates y deletes en tablas clave, más logs de login y consultas de módulos.
- Retención de auditoría: 2 meses, con limpieza automática al registrar nuevos movimientos.
- Botón de listas de acceso abreviado a “Excel”.

Pasos:

1. Copiar la carpeta `aekia-app` encima del proyecto local.
2. Ejecutar en Supabase SQL Editor: `database/014_v11_family_audit_and_debt_fix.sql`.
3. Guardar todo en VS Code.
4. Ejecutar `npm install` y `npm run dev`.

No reimportar datos.
