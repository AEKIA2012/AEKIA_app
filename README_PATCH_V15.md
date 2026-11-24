# AEKIA v15 · Registro, acceso, familia y asistencia

Parche **acumulativo**: incluye las correcciones v14.1 que aún no se descargaron, y las funciones nuevas v15. Se aplica **sobre la versión v14** (SQL `017` ya ejecutado). **No incluye importación automática del padrón 2027** ni modifica correos, relaciones familiares o datos de miembros por sí solo.

## Incluye

1. **Registro público funcional**: `/register` guarda solicitudes pendientes en Supabase con validación y control de duplicados.
2. **Solicitudes de registro** en el menú de administración: revisión, alta de ficha precargada, aprobación/rechazo. Para aprobar deben coincidir la CURP y el correo con la ficha activa de la persona.
3. **Activación de acceso**: después de la aprobación, la persona usa `/register` → *Activar acceso*, establece contraseña, confirma el correo y obtiene su perfil y rol Usuario.
4. **Alta manual completa**: Lista de miembros → ficha → *Preparar acceso de usuario*; la persona activa el acceso con su correo, sin contraseña temporal enviada por un administrador.
5. **Recuperación real de contraseña**: `/login` → *Forgot password* → enlace de Supabase → nueva contraseña.
6. **Familia y tutores**: enlaza hijos menores con un padre/tutor, configura permisos de información, pagos y eventos, desactiva/reactiva el vínculo. La opción *Visualizar como usuario* muestra al menor **aunque no tenga login propio**. No es necesario cambiar el correo de la persona menor para probarlo; utiliza el vínculo verificado.
7. **Asistencia**: confirmar clases impartidas por fecha o calendario, ver lista, capturar por persona, mostrar todos los miembros; Comisaría podrá editar con el SQL 020. Se quitaron mensajes extensos y advertencias que no corresponden al uso normal.
8. **Rutas directas** y build de Vite8: `vite.config.ts` evita que la optimización retire accidentalmente los componentes. El aviso de tamaño de bundle no bloquea la compilación.
9. **Estabilidad de carga**: se normalizó el inicio de consultas en los módulos para evitar errores de análisis estático de React. `npm run lint` finaliza sin errores (puede mostrar advertencias de dependencias de efectos).

## Antes de ejecutar los SQL

- Respaldar las tablas críticas y anotar el estado de roles de la cuenta de pruebas.
- Verificar **qué proyecto de Supabase** emplean Preview y Producción. Si es el mismo, las pruebas modifican datos reales.
- En **Supabase → Authentication**, habilitar *Confirm email*. Configurar **Site URL** y **Redirect URLs** para `https://aekia-app.vercel.app/login` y `https://aekia-app.vercel.app/change-password` (y los mismos caminos en el dominio Preview si se va a probar allí).
- Los enlaces de prueba de correo deben abrir el dominio autorizado correcto.

## Instalación ordenada

1. Trabajar sobre `main` actualizado después de haber incorporado v14, en nueva rama `release/v15-20261123`.
2. Copiar sobre el proyecto los archivos contenidos en este ZIP manteniendo su estructura. **No copiar** `dist` ni dependencias.
3. Compilar con `npm install` si hacen falta dependencias y `npm run build`.
4. Ejecutar en **Supabase SQL Editor** en este orden, cada archivo completo:
   - `database/020_v14_1_comisaria_attendance_edit.sql`
   - `database/021_v15_registration_workflow.sql`
   - `database/022_v15_guardian_view_as_without_child_login.sql`
5. Subir la rama, abrir Pull Request, verificar Preview. **Antes de fusionar**, comprobar que la configuración Auth y el SQL estén listos (Preview puede compartir la base real).
6. Fusionar a `main` y comprobar que Vercel despliegue `https://aekia-app.vercel.app/`.
7. Seguir la hoja **Pruebas_Admin** del Excel de QA, luego **Pruebas_Roles**, sin repetir la suite de admin. Anotar ID, resultado y evidencia por caso.
8. **No limpiar pruebas** hasta que exista respaldo y se conozcan los IDs exactos, con autorización explícita.

## Flujo completo de una nueva persona

1. La persona entra a `/register`, envía la solicitud.
2. Administración abre **Solicitudes de registro**, verifica identidad y datos, completa la ficha si hace falta y aprueba.
3. La persona vuelve a `/register` → **Activar acceso**, crea contraseña y confirma su correo.
4. Entra por `/login`, consulta datos personales y solo las funciones de su rol.

Alternativamente, administración puede **crear primero la ficha** y pulsar **Preparar acceso de usuario**, sin solicitud pública previa. El resto del proceso de activación es igual.

## Padre e hija (sin cambiar correo)

1. Administrador: Menú → **Familia y tutores** → seleccionar hija, padre, relación y permisos → **Guardar vínculo**.
2. Cerrar sesión de administrador y entrar con el correo propio del padre. En el menú, **Visualizar como usuario** → seleccionar a la hija.
3. Verificar datos, asistencia, pagos y eventos según los permisos otorgados. Después volver al perfil propio.
4. Si se creó el vínculo exclusivamente para QA, restaurar su estado original al finalizar, previa revisión.

## Alcance, seguridad y validación

- El flujo nuevo necesita ejecutar los SQL **y** tener correo confirmado en Auth. Compilar no equivale a probar Supabase en vivo.
- `021` instala un trigger en `auth.users` que crea/vincula el perfil únicamente si el correo fue confirmado y existe solicitud aprobada con CURP y correo iguales a los de la ficha activa. No modifica cuentas anteriores.
- `022` concede lectura familiar solo según parentesco/permisos autorizados y restringe la elegibilidad a consultas propias, familiares o administrativas.
- No se han creado usuarios, aprobado solicitudes, cambiado roles/correos, vinculado familiares, importado padrones ni eliminado pruebas en la base de producción.
- Los CSV y Excel con información personal están **solo** en el archivo de QA privado, nunca dentro de este parche publicable a GitHub.
- Para el padrón 2027, primero revisar **Cotejo_BD**, **Solo_en_BD** y **Pendientes**. No inactivar automáticamente a los siete que solo aparecen en la base actual.

## Cambios que se deben copiar

El ZIP contiene únicamente este README, los tres SQL 020–022, `vite.config.ts`, rutas/permisos de la app y las páginas modificadas o nuevas. Se entrega por separado el Excel privado de QA y cotejo, que **no se debe subir al repositorio**.
