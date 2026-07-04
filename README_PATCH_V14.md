# AEKIA Patch V14 - cierre final

## Incluye

1. Elegibilidad reglamentaria mensual corregida:
   - hasta 3 asistencias puntuales por mes;
   - si hubo menos de 3 clases en ese mes, baja el requerido;
   - retardos no cuentan;
   - asistencias extra en un mes no compensan otro mes.

2. Visualizar como:
   - admin/mesa puede ver como perfiles con sus permisos reales;
   - usuarios familiares pueden ver menores/miembros activos con el mismo correo;
   - menores sin user_profile aparecen usando el member_id como perfil virtual.

3. Excel de listas de acceso:
   - mantiene solo rango A-H, con contenido útil B-H;
   - elimina columnas I en adelante;
   - deja filas 1-5 vacías para copiar/pegar limpio desde fila 6;
   - conserva combinaciones B-H.

4. Manual actualizado:
   - GitHub gratis privado;
   - Vercel gratis recomendado;
   - variables de entorno;
   - actualización por git push.

## SQL a ejecutar

`database/017_v14_final_fix.sql`

No reimportar datos.
