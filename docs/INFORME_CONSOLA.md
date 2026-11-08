# Informe de consola, red y terminal

- **Fecha:** 7 de noviembre de 2026.
- **Navegador:** Chrome 156.0.8078.80 (Windows 10), controlado por ChromeDriver con
  `goog:loggingPrefs = {browser: ALL, performance: ALL}` para leer la consola (pestaña *Console*) y las
  respuestas HTTP (pestaña *Network*) en cada caso de prueba. Además se revisó a mano en el navegador
  integrado de Claude Code (lectura de consola y de peticiones de red).
- **Backend usado:** Supabase local de pruebas (`tests/soporte/supabase-local.mjs`) con las migraciones reales.
  **No se pudo revisar contra el proyecto Supabase real** porque este equipo no tiene `.env` con sus
  credenciales (ver «Pendiente» al final).

## 1. Pantallas y recorridos revisados

| Pantalla | Acciones ejecutadas | Errores de la app en consola | Peticiones fallidas no previstas |
|---|---|---|---|
| Inicio (`/`) escritorio | Carga, navegación por anclas, consulta de disponibilidad (fecha, hora, personas), filtros de zona y personas, 15 pestañas de la carta, carga de 71 fotos (incluye repetidas en Recomendados) | 0 | 0 |
| Inicio (`/`) móvil 390 px | Carga y comprobación de desbordamiento horizontal | 0 | 0 |
| Reservar (`/reservar`) | Paso 1 (mesas), paso 2 (calendario y horas), paso 3 (validaciones de nombre y capacidad), confirmación | 0 | 0 |
| Reservar — carrera entre clientes | Segundo cliente confirma la misma franja | 0 | 0 (el `400` de `crear_reserva` es el rechazo esperado) |
| Mi reserva (`/mi-reserva`) | Consulta con nombre incorrecto y correcto, cancelación | 0 | 0 |
| Panel — acceso | Contraseña vacía, incorrecta (×5, bloqueo), correcta | 0 | 0 (los `400` de `/auth/v1/token` son las contraseñas incorrectas) |
| Panel — Resumen, Mesas, Horarios, Reservas, Categorías, Carta | Navegación por todas las secciones; crear, editar, activar/desactivar y eliminar mesas, jornadas, categorías y platos; cambiar estado de reservas | 0 | 0 (el `409` al borrar una mesa con historial es el rechazo esperado) |
| Panel — cierre de sesión | Manual y por inactividad | 0 | 0 |
| Panel — seguridad | Token manipulado, vencido, sesión cerrada reutilizada, tokens en la URL, usuario sin permisos | 0 | 0 (los `401`/`403` son los rechazos esperados) |

Advertencias (`WARNING`) registradas en la consola durante todos los recorridos: **0**.

## 2. Errores encontrados y corregidos

| # | Dónde | Error observado | Causa | Corrección | Resultado |
|---|---|---|---|---|---|
| 1 | Carta pública | Las fotos oficiales tapaban el nombre del producto (visto en la revisión visual) | La imagen ocupaba más alto que su contenedor | `css/styles.css`: imagen posicionada dentro del contenedor y títulos largos con salto de línea | Nombre y precio visibles en todas las tarjetas |
| 2 | Panel (`/admin`) | Respuestas `403 Forbidden` en `rest/v1/reservas` mientras el panel seguía visible (Selenium, ejecución 1) | Si la sesión desaparecía del almacenamiento, las consultas salían como rol anónimo y la app solo mostraba un aviso | `js/api.js`: un `42501 permission denied` o un JWT inválido dispara `konys:sesion-invalida` y `js/admin/app.js` cierra la sesión | Ya no hay consultas anónimas desde un panel abierto |
| 3 | Panel (`/admin`) | `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` en consola y `400` en `/auth/v1/token?grant_type=refresh_token` (Selenium, ejecución 2) | Al abrir el panel con una sesión guardada vencida, supabase-js intentaba renovarla en silencio | `js/supabase.js`: las sesiones con el token vencido se descartan antes de crear el cliente | Sin errores; se muestra el acceso |
| 4 | Sitio público sin configurar | `GET js/config.js 404` cuando no existe `.env` | El archivo se genera desde `.env` | No es un error de un recorrido normal: con la configuración hecha (`npm run config` o el build de Vercel) el archivo existe. Sin él, la página muestra un aviso explicando qué configurar | Documentado |
| 5 | Pruebas Selenium del pull | 30 capturas idénticas, ninguna prueba válida | El script era el ejemplo del profesor para otra app | Plantilla reescrita para Konys en `pruebas/` | 37/37 casos |

No se silenció la consola, no se filtraron mensajes ni se capturaron excepciones para ignorarlas: cada
corrección elimina la causa.

## 3. Mensajes que aparecen a propósito

Son respuestas de error del servidor en escenarios negativos, registradas por la capa de red de Chrome como
«Failed to load resource». Demuestran que la protección funciona en el servidor y **no** aparecen en un uso normal:

| Escenario | Petición | Código |
|---|---|---|
| Contraseña incorrecta / intentos repetidos | `POST /auth/v1/token?grant_type=password` | 400 |
| Dos clientes confirman la misma franja | `POST /rest/v1/rpc/crear_reserva` | 400 (`HORARIO_OCUPADO`) |
| Borrar una mesa con reservas históricas | `DELETE /rest/v1/mesas?id=eq.2` | 409 (clave foránea) |
| Token manipulado | `GET /auth/v1/user`, `GET /rest/v1/…` | 401 |
| Reutilizar una sesión cerrada | `GET /auth/v1/user` | 403 (`session_not_found`) |

## 4. Terminal

| Comando | Resultado |
|---|---|
| `npm install` | Sin errores (1 dependencia de desarrollo: `@electric-sql/pglite`) |
| `pip install -r pruebas/requirements.txt` | Instalados Selenium 4.52 y ReportLab 5.1 (no estaban en este equipo) |
| `npm test` | **48/48** (lógica, inactividad, CSP, validaciones, migraciones SQL con RLS y reversión) |
| `npm run supabase:pruebas` | Arranca y aplica 001 → seed → platos antiguos → 002 → seed_carta_real → 003 → 004 sin errores |
| `node scripts/servidor-local.mjs` | Arranca; sirve con CSP y cabeceras de seguridad |
| `py pruebas/pruebas_formulario.py --rapido --oculto` | **37/37** (base local) |
| `node --check` sobre todos los `.js`/`.mjs` | Sin errores de sintaxis |

Avisos de terminal no relacionados con el código: `pip` sugiere actualizarse y avisa de que
`cffi-gen-src.exe` no está en el `PATH` (no afecta a las pruebas).

## 5. Pendiente

- Repetir el recorrido contra el **Supabase real** cuando haya `.env` (los pasos están en el README). Los
  puntos a vigilar: que las migraciones 002 y 003 se hayan ejecutado y que el usuario administrador exista
  en `administradores`; si falta 002, la carta mostrará un error porque pide columnas nuevas.
- Repetirlo en el despliegue de Vercel (HTTPS y CSP reales) una vez autorizado.
