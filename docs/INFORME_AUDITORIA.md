# Informe de auditoría — Konys Pizza, Sistema de Reservas

Comparación de la aplicación con el documento del proyecto (`docs/Konys_Pizza_-_Sistema_de_Reservas.pdf`):
RF-01 a RF-14, RNF-01 a RNF-09 y los entregables de las secciones 15 y 17.

- **Última revisión:** 7 de noviembre de 2026.
- **Estados:** ✅ cumple · 🟡 parcial · ❌ falta.
- La columna «Antes» refleja el estado del commit `3439df0`; «Ahora», el de esta entrega.

## 1. Requisitos funcionales

| Req. | Descripción | Antes | Ahora | Archivos | Evidencia / nota |
|---|---|---|---|---|---|
| RF-01 | Visualización de mesas disponibles | ✅ | ✅ | `mesas.html`, `js/pagina-mesas.js` | Página propia. Selenium «Mesas visibles con zona, capacidad y estado» |
| RF-02 | Selección de mesa | ✅ | ✅ | `js/pagina-mesas.js`, `reservar.html`, `js/reserva.js` | Tarjetas, plano y paso 1 del flujo |
| RF-03 | Elección de fecha | ✅ | ✅ | `js/reserva.js` (calendario) | Solo días con jornadas activas |
| RF-04 | Horarios disponibles | ✅ | ✅ | `js/disponibilidad.js`, RPC `ocupacion()` | Selenium «Un horario ocupado aparece tachado» |
| RF-05 | Reserva de mesa | ✅ | ✅ | RPC `crear_reserva()` en `001_esquema_inicial.sql` | Capacidad, turno, fecha y solapamiento validados en la base |
| RF-06 | Confirmación | ✅ | ✅ | `js/reserva.js` | Selenium «Flujo completo» comprueba los datos en pantalla y en Supabase |
| RF-07 | Carta digital | 🟡 | ✅* | `carta.html`, `js/pagina-carta.js`, `supabase/seed_carta_real.sql` | Antes: platos inventados. Ahora: 67 productos reales, 15 pestañas, buscador. *En producción falta que Tatis ejecute los SQL (`docs/CAMBIOS_SUPABASE.md`) |
| RF-08 | Acceso al panel protegido | 🟡 | ✅ | `admin.html`, `js/admin/app.js`, `js/admin/inactividad.js` | Supabase Auth + `administradores`; correo y contraseña; cierre por inactividad; PKCE; sin tokens en la URL |
| RF-09 | Registro de mesas | ✅ | ✅ | `js/admin/mesas.js` | Selenium «Crear mesa y activarla/desactivarla» |
| RF-10 | Listado de mesas | ✅ | ✅ | `js/admin/mesas.js` | — |
| RF-11 | Gestión de horarios | ✅ | ✅ | `js/admin/horarios.js`, `004_horarios_reales.sql` | Horario real del documento: todos los días 12:30–14:30 y 17:00–23:00 |
| RF-12 | Visualización de reservas con filtros | ✅ | ✅ | `js/admin/reservas.js` | Selenium «Filtros de reservas» |
| RF-13 | Cambio de estado de mesa | ✅ | ✅ | `js/admin/mesas.js` | La mesa inactiva desaparece del sitio público (comprobado por la API) |
| RF-14 | Gestión de la carta | 🟡 | ✅ | `js/admin/carta.js`, `js/admin/categorias.js` | Agregar, editar, ocultar, eliminar; categorías; precio opcional; subida de imagen al bucket `imagenes` |

## 2. Requisitos no funcionales

| Req. | Descripción | Antes | Ahora | Archivos | Evidencia / nota |
|---|---|---|---|---|---|
| RNF-01 | Usabilidad | ✅ | ✅ | todas las páginas | Mensajes con icono + texto, estados vacíos, aviso antes de cerrar sesión |
| RNF-02 | Responsividad | ✅ | ✅ | `css/styles.css`, `css/admin.css` | Selenium «Diseño adaptable en celular (375 px)» en 6 páginas |
| RNF-03 | Carga < 3 s | 🟡 | 🟡 | — | Sin compilación y con imágenes `lazy`; no se midió en producción |
| RNF-04 | Disponibilidad 99 % | 🟡 | 🟡 | `vercel.json` | Depende de Vercel y Supabase. **Vercel sirve una versión antigua** (ver sección 4) |
| RNF-05 | Seguridad | 🟡 | ✅ | `js/supabase.js`, `js/admin/app.js`, `vercel.json`, migraciones | RLS probado con 3 roles, CSP, `no-store` en el panel, inactividad, sin `ADMIN_EMAIL` en el navegador, HTTPS en Vercel |
| RNF-06 | Mantenibilidad (archivos por funcionalidad) | ✅ | ✅ | `js/layout.js`, `js/consulta.js`, `js/pagina-*.js`, `js/api.js` | Encabezado y pie compartidos en un módulo; consultas solo en `api.js` |
| RNF-07 | Compatibilidad | 🟡 | 🟡 | — | Probado en Chrome 156; el script de pruebas usa Edge como respaldo |
| RNF-08 | Escalabilidad | ✅ | ✅ | tablas de mesas, horarios, categorías y platos | Todo se gestiona desde el panel |
| RNF-09 | Trazabilidad (≥ 5 commits, varias personas, días distintos) | 🟡 | 🟡 | historial de Git | Hay 8 commits de 2 personas en 2 días. **Falta** que cada integrante haga commits propios en días distintos (no se pueden fabricar) |

## 3. Entregables (secciones 15 y 17)

| Entregable | Estado | Nota |
|---|---|---|
| Repositorio con nombre descriptivo, `.gitignore`, sin secretos | ✅ | `.env` y `js/config.js` ignorados; solo clave *publishable* |
| README con descripción, tecnologías, enlace de la app, enlace del video e instrucciones | 🟡 | Falta el **enlace del video** |
| Carpeta `/docs` con el documento del proyecto | ✅ | `docs/Konys_Pizza_-_Sistema_de_Reservas.pdf` |
| Mockups de **baja fidelidad** en `/docs` | ❌ | En `docs/diseno/` están los de **alta** fidelidad de Figma; los wireframes de baja fidelidad del grupo no están en el repositorio |
| Aplicación desplegada en Vercel conectada a Supabase | 🟡 | Desplegada, pero con una versión antigua (sección 4) |
| Video explicativo (5–8 min) | ❌ | Pendiente del grupo |
| Evidencia de commits (captura de la pestaña Commits) | ❌ | Pendiente del grupo |

## 4. Hallazgos importantes

1. **Vercel no muestra la versión actual.** El 7 de noviembre de 2026 <https://konys-reservas-app.vercel.app/> servía la primera
   versión (4 categorías, sin «Mi reserva»), aunque `main` ya tenía cambios posteriores. Hay que revisar en Vercel →
   *Settings → Git* que la rama de producción sea `main` y redesplegar.
2. **La base de datos real aún tiene la carta inventada** y el horario de Figma: hasta que se ejecuten los SQL de
   `docs/CAMBIOS_SUPABASE.md`, la carta en producción no es la real.
3. **Las pruebas Selenium del primer pull** eran el ejemplo del profesor sin adaptar; se reescribieron (37 pruebas, ver
   `docs/INFORME_PRUEBAS_SELENIUM.md`).
4. **Horario:** el reparto «lunes cerrado / martes solo noche» venía de Figma. El equipo decidió usar el del documento
   (todos los días, dos jornadas). Si el restaurante cierra algún día, se desactiva desde el panel.
