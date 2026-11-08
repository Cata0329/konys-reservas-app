# Informe de auditoría — Konys Pizza, Sistema de Reservas

- **Fecha de la auditoría:** 7 de noviembre de 2026.
- **Estado auditado:** commit `4deacb0` de `main` (después del `git pull` con los aportes de Tatiana-ER).
- **Fuente de requisitos:** documento «Konys Pizza – Sistema de Reservas» (RF-01 a RF-14, RNF-01 a RNF-09).
- **Columna «Después»:** estado tras los cambios de esta iteración (detalle en la sección 4).

## 1. Estructura y tecnologías encontradas

| Aspecto | Hallazgo |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla (módulos ES). Sin framework ni paso de compilación. 3 páginas: `index.html`, `reservar.html`, `admin.html`. |
| Backend | Supabase (PostgreSQL + Auth + Storage). Cliente `@supabase/supabase-js@2.45.4` cargado desde jsDelivr. |
| Base de datos | `supabase/migrations/001_esquema_inicial.sql`: tablas `administradores`, `mesas`, `horarios`, `categorias`, `platos`, `reservas`; RLS activo en todas; funciones `es_admin()`, `ocupacion()`, `crear_reserva()`; restricción de exclusión `reservas_sin_solapamiento`. |
| Datos | `supabase/seed.sql`: 9 mesas, 11 jornadas y **8 platos de ejemplo inventados** (no verificados con el menú real). |
| Configuración | `.env` → `scripts/generar-config.mjs` → `js/config.js` (ignorado por Git). No hay `.env` en este equipo: **no hay credenciales locales de Supabase**. |
| Pruebas Node | `npm test`: 28 pruebas (lógica + migración SQL sobre PGlite). **28/28 aprobadas** al iniciar la auditoría. |
| Pruebas Selenium (aporte nuevo) | `pruebas/pruebas_formulario.py` + `ejecutar_pruebas.bat` + reporte PDF. **Prueban otra aplicación** («Restaurante El Fogón Dorado»: campos `identificacion`, `correo`, `fechaNacimiento`, `tipo`, modal `#modal`) que no existe en este proyecto. Por eso las 30 capturas del reporte son la misma imagen y las pruebas no validan Konys. Se conservan los archivos (no se borra trabajo ajeno) y la suite real se crea en `tests/selenium/`. |
| Selenium en este equipo | No estaba instalado; se instaló con `pruebas/requirements.txt` (Selenium 4.52, ReportLab 5.1). Chrome 156 disponible. |
| Despliegue | `vercel.json` con build `node scripts/generar-config.mjs`, URL limpias y cabeceras básicas (sin CSP). |
| Repositorio | `origin = github.com/Cata0329/konys-reservas-app`, rama `main` al día, árbol limpio. |

## 2. Requisitos funcionales

| Req. | Descripción | Estado al auditar | Evidencia / archivos | Después |
|---|---|---|---|---|
| RF-01 | Visualización de mesas disponibles | Completado | `index.html` (#mesas), `js/inicio.js` → `pintarMesas()`; RLS solo expone mesas activas | Completado |
| RF-02 | Selección de mesa | Completado | Tarjetas y plano enlazan a `reservar.html?mesa=…`; paso 1 en `js/reserva.js` | Completado |
| RF-03 | Elección de fecha | Completado | Calendario en `js/reserva.js` (`calendarioHTML`), días cerrados según `horarios` | Completado |
| RF-04 | Horarios disponibles | Completado | `js/disponibilidad.js` + RPC `ocupacion()` | Completado |
| RF-05 | Reserva de mesa | Completado | RPC `crear_reserva()` valida capacidad, turno, fecha y solapamiento | Completado |
| RF-06 | Confirmación de reserva | Completado | `mostrarConfirmacion()` en `js/reserva.js` | Completado + código consultable en «Mi reserva» |
| RF-07 | Carta digital | **Presenta errores** | Funciona técnicamente, pero muestra **8 platos inventados** como si fueran reales; solo 4 categorías frente a las 14 del menú oficial; sin imágenes reales | Completado con catálogo oficial (67 productos, 14 categorías, imágenes oficiales) |
| RF-08 | Acceso al panel | **Parcialmente implementado** | Supabase Auth + tabla `administradores` (correcto), pero sin cierre por inactividad, sesión en `localStorage`, `detectSessionInUrl` activo (aceptaría tokens en la URL) y sin validar la sesión contra el servidor al cargar | Completado (PKCE, sesión por pestaña, `getUser()`, inactividad 5 min) |
| RF-09 | Registro de mesas | Completado | `js/admin/mesas.js` (cajón «Nueva mesa») | Completado |
| RF-10 | Listado de mesas | Completado | Tabla en `js/admin/mesas.js` | Completado |
| RF-11 | Gestión de horarios | Completado | `js/admin/horarios.js`; restricciones `horarios_sin_cruce` y `horarios_cabe_una_reserva` | Completado |
| RF-12 | Visualización de reservas | Completado | `js/admin/reservas.js` con filtros fecha/mesa/estado y paginación | Completado |
| RF-13 | Cambio de estado de mesa | Completado | Interruptor «Activa» en `js/admin/mesas.js` | Completado |
| RF-14 | Gestión de la carta | **Parcialmente implementado** | CRUD de platos funciona, pero **no existe gestión de categorías**, el precio es obligatorio (no admite «precio por confirmar»), no hay subcategorías, recomendados ni variantes | Completado (sección «Categorías», subcategorías, recomendados, variantes, precio opcional) |

## 3. Requisitos no funcionales

| Req. | Descripción | Estado al auditar | Evidencia | Después |
|---|---|---|---|---|
| RNF-01 | Usabilidad | Completado | Flujo en 3 pasos, mensajes con icono + texto, estados vacíos | Completado |
| RNF-02 | Responsividad | Completado | Media queries 1080/900/560 px; verificado sin desbordamiento a 375 px | Completado (pestañas de carta desplazables con 15 categorías) |
| RNF-03 | Rendimiento < 3 s | Parcialmente implementado | Sin build, pocas peticiones; no medido formalmente | Medido en Selenium (ver informe de pruebas) |
| RNF-04 | Disponibilidad 99 % | Pendiente (depende del despliegue) | Vercel + Supabase gestionados; aún no desplegado | Pendiente de despliegue autorizado |
| RNF-05 | Seguridad | **Parcialmente implementado** | RLS correcto y probado; faltaban CSP, cierre por inactividad, PKCE, limpieza de tokens en URL, validación de sesión en servidor, límite de intentos | Completado (ver sección 4) |
| RNF-06 | Mantenibilidad | Completado | Vistas, `api.js`, `validaciones.js` y `disponibilidad.js` separados | Completado |
| RNF-07 | Compatibilidad | Parcialmente implementado | Solo probado en Chromium | Probado en Chrome 156 con Selenium |
| RNF-08 | Escalabilidad | Completado | Mesas, horarios y platos dinámicos; categorías ahora también | Completado |
| RNF-09 | Trazabilidad (≥ 5 commits) | Parcialmente implementado | 3 commits (1 de Cata0329, 2 de Tatiana-ER) | Commits descriptivos adicionales en esta iteración |

## 4. Problemas encontrados y decisión tomada

| # | Problema | Gravedad | Decisión |
|---|---|---|---|
| 1 | Los 8 platos del seed no están en el menú oficial (salvo «Limonada de Coco») | Alta | Migración `003`: se respaldan, se marcan `origen = 'prueba'` y se ocultan; «Limonada de coco» se corrige con los datos oficiales. |
| 2 | Pruebas Selenium de otro proyecto | Alta | Se conservan en `pruebas/` y se crea la suite real en `tests/selenium/`. |
| 3 | `detectSessionInUrl` activo: un enlace con `#access_token=…` iniciaría sesión | Media | Flujo PKCE, `detectSessionInUrl: false` y limpieza de parámetros de autenticación de la URL. |
| 4 | Sesión en `localStorage` (persiste tras cerrar el navegador) | Media | `sessionStorage`: la sesión muere al cerrar la pestaña. |
| 5 | Al cargar `/admin` se usaba `getSession()` (solo lectura local) | Media | `getUser()` valida el token en Supabase Auth; si es inválido, vencido o revocado se cierra la sesión. |
| 6 | Sin cierre por inactividad | Alta (pedido del profesor) | `js/admin/inactividad.js`: 5 minutos exactos. |
| 7 | Sin CSP | Media | CSP en `vercel.json` y en el servidor local. |
| 8 | Sin gestión de categorías en el panel | Media | Nueva sección «Categorías». |
| 9 | Cliente no puede consultar su reserva | Media | Página `mi-reserva.html` + RPC `consultar_reserva()` / `cancelar_reserva()`. |
| 10 | Sin límite de intentos de acceso en la interfaz | Baja (Supabase ya limita en el servidor) | Bloqueo temporal tras 5 intentos fallidos + documentación de los límites de Supabase Auth. |
| 11 | No hay credenciales de Supabase en este equipo | Bloqueante para verificar la base real | Todo se verificó con la migración real sobre PostgreSQL embebido; las acciones manuales están en el README. |
