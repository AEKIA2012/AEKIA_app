AEKIA PATCH V13 - CIERRE FINAL
==============================

Este parche incluye solo los últimos ajustes solicitados:

1. Elegibilidad/asistencia reglamentaria corregida por mes:
   - Solo cuenta asistencia puntual.
   - Una asistencia puntual cumple la semana.
   - Por cada mes se piden hasta 3 semanas cumplidas.
   - Si en un mes hubo menos de 3 semanas reales con clase, baja el requerido.

2. Visualizar como usuario:
   - Admin puede visualizar como cualquier perfil activo.
   - Familia solo puede ver perfiles con el mismo correo del perfil/miembro o menores vinculados como tutor.
   - Los módulos admin se ocultan al visualizar como alguien que no tiene permisos.

3. Registro a eventos:
   - Botón de inscripción queda del lado izquierdo.

4. Listas de acceso:
   - Exportación XML de Excel con merges B:H más parecidos al formato base japonés.
   - Mantiene orden manual de miembros/externos.

5. Manual de publicación:
   - Se corrige a Vercel como opción recomendada gratuita.
   - Netlify como alternativa.
   - Se elimina Hostinger como opción principal.

SQL requerido:
- database/016_v13_final_finish.sql
