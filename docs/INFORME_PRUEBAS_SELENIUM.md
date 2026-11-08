# Informe de pruebas Selenium

## 1. Punto de partida

El `git pull` trajo `pruebas/pruebas_formulario.py`, `ejecutar_pruebas.bat` y un reporte PDF (aporte de Tatiana-ER).
Al revisarlos se comprobó que **prueban otra aplicación** («Restaurante El Fogón Dorado»): buscan campos como
`identificacion`, `correo`, `fechaNacimiento`, radios `tipo` y un modal `#modal` que no existen en Konys. Por eso
sus 30 capturas son idénticas (la misma página sin los elementos esperados). Esos archivos **se conservaron sin
modificar** y se reutilizó su instalación (`pruebas/requirements.txt`: Selenium + ReportLab). La suite real del
proyecto está en `tests/selenium/`.

## 2. Cómo se ejecuta

```
npm install
py -X utf8 tests/selenium/ejecutar.py            # Chrome oculto (o: npm run test:selenium)
py -X utf8 tests/selenium/ejecutar.py --visible  # ver el navegador
py -X utf8 tests/selenium/ejecutar.py S03 I01    # solo algunos casos
```

El ejecutor (`tests/selenium/entorno.py`):

1. Genera `js/config.js` en **modo pruebas** (`node scripts/generar-config.mjs --pruebas`), que apunta a
   `http://localhost:54321`. Nunca toca la base de datos real.
2. Arranca `tests/soporte/supabase-local.mjs`: PostgreSQL embebido (PGlite) con **las mismas migraciones**
   001 → seed → platos antiguos → 002 → 003, RLS y roles `anon`/`authenticated`, más una emulación de
   PostgREST y Supabase Auth con JWT firmados, vencimiento, refresco y revocación de sesión.
3. Arranca `scripts/servidor-local.mjs` (mismas cabeceras y CSP que Vercel) en el puerto 5181.
4. Abre Chrome con `goog:loggingPrefs` (consola y red). **Tras cada caso** lee la consola y las respuestas
   HTTP: un error `SEVERE` o una respuesta ≥ 400 no prevista hace **fallar** el caso aunque las comprobaciones
   funcionales hayan pasado.
5. Al terminar restaura `js/config.js` desde `.env` (o lo elimina si no hay `.env`).

Usuarios de prueba (existen solo en el emulador, en memoria): `admin@konys.test` (administrador) y
`otro@konys.test` (autenticado sin permisos). Su contraseña se genera al azar en cada ejecución
(`SUPABASE_PRUEBA_CLAVE`); no hay contraseñas escritas en el código.

## 3. Criterio de aprobación

Ningún caso se aprueba solo porque Selenium encuentre elementos: cada uno verifica el resultado real
(registros en la base mediante la API, estado de la sesión en `sessionStorage` y en Supabase Auth, mensajes
mostrados, URL) y la ausencia de errores en consola/red.

**Errores provocados a propósito.** Algunos casos ejecutan acciones que *deben* fallar (contraseña incorrecta,
dos clientes reservando la misma franja, borrar una mesa con historial, token manipulado o revocado). En ellos
Chrome registra «Failed to load resource: 400/401/403/409». Ese mensaje lo escribe la capa de red del navegador
(no el código de la aplicación) y es la evidencia de que el servidor rechazó la operación. Cada caso declara el
patrón exacto que espera; cualquier otro error lo hace fallar.

## 4. Evolución de las ejecuciones

| Ejecución | Resultado | Problemas detectados | Corrección |
|---|---|---|---|
| 1 | 18/31 | (a) A04/A07: el panel siguió visible mientras las consultas salían **sin token** y recibían `403`. (b) `driver.get` a la misma página cambiando solo el `#hash` no recargaba. (c) Clics «interceptados» por pulsar durante el desplazamiento suave (`scroll-behavior: smooth`). | (a) **Defecto de la app**: `js/api.js` ahora trata el `403 permission denied` en el panel como sesión perdida y lo cierra. (b, c) Ajustes del arnés: recarga explícita y desplazamiento instantáneo antes de pulsar. |
| 2 | 28/31 | (d) S04: con una sesión guardada **vencida**, supabase-js intentaba refrescarla y escribía `AuthApiError: Invalid Refresh Token` en consola. (e) A02 intentaba borrar la Mesa 6, que en la base limpia no tenía reservas. (f) A06 vaciaba el buscador sin disparar `input`. | (d) **Defecto de la app**: `js/supabase.js` descarta la sesión vencida antes de crear el cliente (la pestaña llevaba > 5 min inactiva, así que debe volver a iniciar sesión). (e, f) El caso crea su propia reserva de apoyo y dispara el evento. |
| 3 | **31/31** | — | — |

## 5. Resultados de la última ejecución

Capturas de cada caso en `tests/selenium/resultados/capturas_<fecha>/` y detalle completo (incluidos los
mensajes de consola previstos) en `tests/selenium/resultados/ultimo.json`.

<!-- RESULTADOS -->
Ejecución: 2026-11-07 18-59-41 · Chrome 156.0.8078.80 · Selenium (Python) · **31/31 aprobadas**.

| Código | Grupo | Caso | Estado | Resultado obtenido | Consola / red | Duración |
|---|---|---|---|---|---|---|
| F01 | Funcional | La página principal carga con mesas activas y sin errores | **APROBADA** | 8 mesas activas visibles; la Mesa 9 (inactiva) no aparece. | Sin errores | 2.1 s |
| F02 | Funcional | Navegación entre secciones y páginas | **APROBADA** | Carta (ancla), Mi reserva y Reservar se abren correctamente. | Sin errores | 3.7 s |
| F03 | Funcional | Las categorías de la carta corresponden al menú oficial | **APROBADA** | 15 pestañas (Recomendados + 14 categorías) en el mismo orden que la fuente oficial. | Sin errores | 1.0 s |
| F04 | Funcional | Solo se muestran productos reales con su precio oficial | **APROBADA** | 67 productos visibles = 67 oficiales; precios iguales; 0 platos ficticios. | Sin errores | 8.3 s |
| F05 | Funcional | Las fotos oficiales cargan y los productos sin foto lo indican | **APROBADA** | 71 fotos oficiales mostradas (incluye repetidas en Recomendados), 0 rotas; 2 productos rotulados «sin foto oficial». | Sin errores | 11.2 s |
| F06 | Funcional | Menú Almuerzos muestra su franja de 12:00 a 2:30 p. m. | **APROBADA** | Aviso de franja visible y los 3 productos oficiales de almuerzo. | Sin errores | 1.4 s |
| F07 | Funcional | Consulta de mesas disponibles por fecha y hora | **APROBADA** | Filtro de 6 personas para 2026-11-08: Mesa 5, Mesa 8. | Sin errores | 1.1 s |
| F08 | Funcional | Consulta de horarios: calendario y horas según la configuración | **APROBADA** | 14 horas para el 2026-11-11 (almuerzo 12:30–1:30, noche 5:00–10:00); los lunes están cerrados. | Sin errores | 0.8 s |
| F09 | Funcional | Creación de una reserva y verificación en la base de datos | **APROBADA** | Reserva 61D6A336 guardada: Mesa 3, 2026-11-12 12:30, 3 personas, estado confirmada. | Sin errores | 2.8 s |
| F10 | Funcional | Validación de formularios (nombre vacío y capacidad excedida) | **APROBADA** | Nombre vacío marcado; 4 personas en Mesa 1 bloqueado en la interfaz y rechazado por el servidor (400). | Sin errores | 1.8 s |
| F11 | Funcional | Prevención de reservas duplicadas (dos clientes a la vez) | **APROBADA** | Mesa 7 2026-11-14 12:30: el segundo cliente recibió «Alguien acaba de reservar»; 1 sola reserva en la base. | 2 respuesta(s) de error provocadas a propósito | 2.3 s |
| F12 | Funcional | Mi reserva: consulta y cancelación por el cliente | **APROBADA** | Con nombre equivocado no se muestra nada; con el correcto se ve y se cancela; la franja 12:30 quedó libre. | Sin errores | 2.9 s |
| A01 | Funcional | Inicio de sesión administrativo (incorrecto y correcto) | **APROBADA** | Contraseña incorrecta rechazada; correcta abre el panel; sesión solo en sessionStorage. | 2 respuesta(s) de error provocadas a propósito | 2.0 s |
| A02 | Funcional | Gestión de mesas: crear, desactivar y eliminar | **APROBADA** | Mesa creada (visible al público), desactivada (oculta), Mesa 2 con historial protegida, mesa nueva eliminada. | 2 respuesta(s) de error provocadas a propósito | 4.7 s |
| A03 | Funcional | Gestión de horarios: editar y validar una jornada | **APROBADA** | Martes noche cambiado a 5:00–10:00 p. m.; el servidor rechaza una reserva a las 9:30 p. m. (FUERA_DE_HORARIO). | Sin errores | 1.9 s |
| A04 | Funcional | Gestión de reservas: filtrar y cambiar estado | **APROBADA** | Filtro por estado aplicado y una reserva pasó a «completada» en la base. | Sin errores | 2.6 s |
| A05 | Funcional | Gestión de categorías: crear, editar y proteger las que tienen platos | **APROBADA** | Categoría creada (con validación del identificador), editada y eliminada; «Pizzas» protegida. | Sin errores | 4.7 s |
| A06 | Funcional | Gestión de platos: crear sin precio, ocultar y eliminar | **APROBADA** | Plato sin precio guardado como «por confirmar», ocultado y eliminado; los 7 platos de prueba se identifican. | Sin errores | 4.2 s |
| A07 | Funcional | Cierre de sesión manual | **APROBADA** | Sesión cerrada, almacenamiento limpio y /admin#reservas pide contraseña. | Sin errores | 3.2 s |
| S01 | Seguridad | Acceso directo al panel sin autenticación | **APROBADA** | Se muestra el acceso; la API rechaza leer reservas como anónimo (403). | Sin errores | 1.3 s |
| S02 | Seguridad | Usuario autenticado SIN permisos de administración | **APROBADA** | Acceso denegado en la interfaz; por API: actualizar precio → 0 filas, leer reservas → 0 filas, crear categoría → 403. | Sin errores | 1.3 s |
| S03 | Seguridad | Token manipulado | **APROBADA** | La API responde 401 al token alterado y el panel vuelve a pedir contraseña. | 2 respuesta(s) de error provocadas a propósito | 1.7 s |
| S04 | Seguridad | Token vencido | **APROBADA** | Token vencido: 401 en la API y el panel pide iniciar sesión. | Sin errores | 0.8 s |
| S05 | Seguridad | Reutilizar una sesión ya cerrada | **APROBADA** | Restaurar la sesión copiada no reabre el panel; Auth responde 403 (sesión revocada). | 2 respuesta(s) de error provocadas a propósito | 1.9 s |
| S06 | Seguridad | Tokens en la URL: se ignoran y se borran | **APROBADA** | URL limpiada a «/admin» y no se inició sesión. | Sin errores | 0.4 s |
| S07 | Seguridad | Operaciones administrativas sin autorización (solicitudes reales) | **APROBADA** | Todas rechazadas: leer reservas → 403, insertar reserva directa → 403, cambiar precio → 403, desactivar mesa → 403, borrar horario → 403, crear categoría → 403, leer administradores → 403. | Sin errores | 0.1 s |
| S08 | Seguridad | Protección frente a intentos repetidos de acceso | **APROBADA** | Tras 5 contraseñas incorrectas el formulario se bloquea 60 s (Supabase Auth también limita en el servidor). | 10 respuesta(s) de error provocadas a propósito | 2.5 s |
| I01 | Inactividad | La actividad reinicia el contador y la inactividad cierra la sesión | **APROBADA** | Con actividad siguió abierta 15 s; sin actividad se cerró a los 8.5 s con el mensaje de inactividad. | Sin errores | 28.4 s |
| I02 | Inactividad | Tras expirar no se pueden hacer operaciones y al volver a entrar el control se reinicia | **APROBADA** | Tras expirar el panel se oculta y la sesión queda revocada (403); al reingresar el contador empieza de cero. | Sin errores | 17.6 s |
| I03 | Inactividad | El valor de producción es 5 minutos y el corto solo funciona en localhost | **APROBADA** | Producción: 300 000 ms (5 min); ?inactividad=8 solo se acepta en localhost. | Sin errores | 0.2 s |
| C01 | Consola | Recorrido completo sin errores de consola ni de red | **APROBADA** | Sin errores en: index, reservar.html, reservar.html?mesa=4, mi-reserva.html, admin, admin#resumen, admin#mesas, admin#horarios, admin#reservas, admin#categorias, admin#carta, index (móvil 390 px). | Sin errores | 7.8 s |
<!-- /RESULTADOS -->
