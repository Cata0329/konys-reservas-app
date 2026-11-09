# Konys Pizza · Sistema de reservas

Aplicación web para reservar mesas en Konys Pizza (Cra. 36 con calle 41, Bucaramanga) sin crear cuenta,
con la carta oficial del restaurante y un panel de administración protegido.
Proyecto del curso de la Universidad de Santander (UDES), prof. Carlos Carrascal.

- **Frontend:** HTML5, CSS3 y JavaScript vanilla (módulos ES), sin framework ni compilación.
- **Backend:** Supabase (PostgreSQL, Auth y Storage) con Row Level Security.
- **Pruebas:** Node `node:test` + PGlite (lógica y SQL) y Selenium con Python (recorridos en Chrome).
- **Despliegue:** Vercel. **Diseño:** mockups de baja fidelidad en `docs/mockups-baja-fidelidad/` y diseño de alta fidelidad de Figma en `docs/diseno/`.

> **Aplicación:** <https://konys-reservas-app-pruebas.vercel.app/> · **Video:** _pendiente_

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/Konys_Pizza_-_Sistema_de_Reservas.pdf`](docs/Konys_Pizza_-_Sistema_de_Reservas.pdf) | Documento del proyecto (requisitos) |
| [`docs/mockups-baja-fidelidad/`](docs/mockups-baja-fidelidad/) | Mockups de baja fidelidad (figuras 1 a 6 del documento): inicio, reserva, móvil, acceso, reservas y mesas |
| [`docs/diseno/`](docs/diseno/) | Diseño de alta fidelidad de Figma (12 pantallas de cliente y administrador) |
| [`docs/INFORME_AUDITORIA.md`](docs/INFORME_AUDITORIA.md) | Requisito por requisito (RF, RNF y entregables): cumple / parcial / falta |
| [`docs/CAMBIOS_SUPABASE.md`](docs/CAMBIOS_SUPABASE.md) | **Para Tatis:** qué SQL ejecutar, en qué orden, cómo comprobarlo y cómo revertirlo |
| [`docs/CATALOGO_KONYS.md`](docs/CATALOGO_KONYS.md) | Carta real (67 productos), decisiones de modelado e imágenes |
| [`docs/INFORME_PRUEBAS_SELENIUM.md`](docs/INFORME_PRUEBAS_SELENIUM.md) | Pruebas Selenium: casos, resultados y correcciones |
| [`docs/INFORME_CONSOLA.md`](docs/INFORME_CONSOLA.md) | Revisión de consola, red y terminal |
| [`docs/REGLA_DISPONIBILIDAD.md`](docs/REGLA_DISPONIBILIDAD.md) | Cómo se evitan las reservas duplicadas |

## Páginas

| Página | Archivo | Contenido |
|---|---|---|
| Inicio | `index.html` | Portada y consulta rápida (lleva a Mesas con la fecha, hora y personas elegidas) |
| Mesas | `mesas.html` | Disponibilidad, plano del salón y la terraza, filtros |
| Carta | `carta.html` | Carta real por categorías, buscador |
| Reservar | `reservar.html` | Flujo mesa → fecha → hora → datos → confirmación |
| Contacto | `contacto.html` | Dirección y horario por día (desde Supabase) |
| Mi reserva | `mi-reserva.html` | Consultar o cancelar una reserva con código + nombre |
| Panel | `admin.html` | Resumen, Mesas, Horarios, Reservas, Categorías y Carta (secciones por `#hash`) |

Inicio, Mesas, Carta y Contacto comparten encabezado y pie con `js/layout.js` (sin duplicar HTML); el menú marca la
página activa con `aria-current="page"`.

## Estructura

```
konys-reservas-app/
├── index.html · mesas.html · carta.html · contacto.html · reservar.html · mi-reserva.html · admin.html
├── css/                    styles.css (sistema visual + sitio), admin.css
├── js/
│   ├── supabase.js         Cliente único (PKCE, sesión en sessionStorage, tiempo límite)
│   ├── api.js              TODAS las consultas a Supabase y traducción de errores
│   ├── layout.js           Encabezado y pie compartidos
│   ├── consulta.js         Formulario «Consulta disponibilidad» (inicio y mesas)
│   ├── pagina-inicio.js · pagina-mesas.js · pagina-carta.js · pagina-contacto.js
│   ├── reserva.js · mi-reserva.js
│   ├── disponibilidad.js · validaciones.js · formato.js · ui.js
│   └── admin/              app.js (acceso), inactividad.js (5 min), una sección por archivo
├── supabase/
│   ├── migrations/001_esquema_inicial.sql    Tablas, reglas de reserva, RLS (ya ejecutada)
│   ├── migrations/002_carta_real.sql         Respaldo + estructura de la carta real
│   ├── migrations/003_consulta_reservas.sql  Funciones de «Mi reserva»
│   ├── migrations/004_horarios_reales.sql    Todos los días, dos jornadas
│   ├── migrations/005_fotos_sodas.sql        Foto oficial de dos sodas
│   ├── seed.sql                              Mesas y horarios iniciales (instalación nueva)
│   ├── seed_carta_real.sql                   Carta real: 14 categorías, 67 platos (GENERADO)
│   └── revertir/revertir_carta_real.sql      Deshace la carta real (probado)
├── scripts/                generar-config, servidor-local, seguridad-http, extraer-menu-konys, generar-sql-catalogo
├── tests/                  *.test.mjs (Node), sql/, soporte/supabase-local.mjs
├── pruebas/                Selenium: pruebas_formulario.py, reporte_pdf.py, reportes/
├── ejecutar_pruebas.bat
└── docs/
```

## Puesta en marcha

### 1. Base de datos (Supabase)

La guía paso a paso, con comprobaciones y cómo revertir, está en
**[`docs/CAMBIOS_SUPABASE.md`](docs/CAMBIOS_SUPABASE.md)**. Resumen del orden en el SQL Editor:

1. `supabase/migrations/002_carta_real.sql`
2. `supabase/seed_carta_real.sql`
3. `supabase/migrations/003_consulta_reservas.sql`
4. `supabase/migrations/004_horarios_reales.sql`
5. `supabase/migrations/005_fotos_sodas.sql`

(En una instalación desde cero, antes van `001_esquema_inicial.sql` y `seed.sql`.)

Para actualizar la carta en el futuro: `npm run menu:extraer` → `npm run menu:sql` → ejecutar de nuevo
`seed_carta_real.sql` (no duplica y respeta la disponibilidad que haya puesto el administrador).

### 2. Autenticación (Supabase → Authentication)

1. Crear el usuario administrador (*Users → Add user*, *Auto Confirm*) y registrarlo:
   ```sql
   insert into public.administradores (user_id, nombre)
   select id, 'Administrador' from auth.users where email = 'tu-correo@ejemplo.com';
   ```
2. Desactivar **Allow new users to sign up**.
3. *URL Configuration*: Site URL = `https://konys-reservas-app-pruebas.vercel.app`; Redirect URLs = esa URL y `http://localhost:5173`.
4. Dejar activos los *Rate Limits* de inicio de sesión. Recomendado: *JWT expiry* de 600–900 s.

### 3. Variables de entorno

```bash
cp .env.example .env
```

| Variable | Dónde se obtiene | Dónde va |
|---|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL | `.env` y Vercel |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → *Publishable key* (o *anon public*) | `.env` y Vercel |
| `CONTACTO_WHATSAPP`, `CONTACTO_INSTAGRAM` | Opcionales (pie de página) | `.env` y Vercel |
| `ADMIN_EMAIL_PRUEBAS`, `ADMIN_PASSWORD_PRUEBAS` | Credenciales del panel **solo para las pruebas Selenium** | Variables de entorno de tu terminal, **nunca** en archivos |
| `USUARIO_PRUEBAS_EMAIL`, `USUARIO_PRUEBAS_PASSWORD` | Opcional: una cuenta **sin** permisos de administración para la prueba de seguridad | Variables de entorno |

`ADMIN_EMAIL` ya no existe: el panel pide correo y contraseña, así el correo del administrador no viaja en la
configuración pública. Nunca uses la clave `service_role` / `sb_secret_…`: el script se niega a generar la
configuración si la detecta.

### 4. Ejecutar localmente (Node.js 18+)

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>. Si todavía no hay `.env`, el servidor sirve una configuración vacía (sin errores 404)
y la página avisa qué falta configurar.

## Pruebas

### Node (lógica y base de datos)

```bash
npm test
```

49 pruebas: disponibilidad, validaciones, control de inactividad, CSP y las migraciones SQL reales sobre PostgreSQL
embebido (solapamientos, cancelaciones, capacidad, turnos, carta real, horarios, reversión y RLS por rol).

### Selenium (recorridos en Chrome)

```bash
py -m pip install -r pruebas/requirements.txt
```

```bash
py pruebas/pruebas_formulario.py --rapido --oculto
```

(o doble clic en `ejecutar_pruebas.bat`). Genera un PDF en `pruebas/reportes/` con portada, resumen, detalle y capturas.

- Con `.env` (o `--real`) prueba contra **Supabase real**; con `--local` (o sin `.env`) usa una copia local con las
  mismas migraciones y no toca la base real.
- Para las pruebas del **panel de administración** (login, mesas, carta, reservas, inactividad, cerrar sesión), define antes
  `ADMIN_EMAIL_PRUEBAS` y `ADMIN_PASSWORD_PRUEBAS` (`set ADMIN_EMAIL_PRUEBAS=...` en cmd). Sin ellas salen **OMITIDAS**:
  no es un error, es que nadie puede entrar al panel sin contraseña.
- Las pruebas de reserva ya no dependen de esas credenciales: si no están, la reserva de prueba se cancela al terminar.
- Los datos que crean se llaman «PRUEBA SELENIUM» y se borran al terminar cada prueba, aunque falle.

| Grupo | Qué se prueba |
|---|---|
| Carga de páginas | Título, estilos, datos de Supabase y página activa en las 6 páginas |
| Navegación | Menú entre páginas; la consulta rápida abre Mesas con los datos |
| Mesas | Zona, capacidad y estado; filtros |
| Reserva | Flujo completo verificado en Supabase |
| Validaciones | Nombre vacío, personas = 0, capacidad, contacto inválido, sin hora (sin guardar nada) |
| Disponibilidad | Horario ocupado; doble reserva simultánea |
| Carta | Categorías reales, solo platos reales/disponibles, buscador, imágenes |
| Administración | Login incorrecto/correcto, acceso sin sesión, mesas, filtros de reservas, carta, cerrar sesión y «Atrás» |
| Seguridad | Inactividad (aviso y cierre), valor 300000, JWT fuera de la URL, XSS, usuario sin permisos, varias pestañas |
| Responsive | 375 px sin desbordamiento |
| Consola | Cero errores y cero advertencias en todo el recorrido |

Último resultado (base local): **37 aprobadas, 0 fallidas, 0 omitidas** (`docs/INFORME_PRUEBAS_SELENIUM.md`).

## Seguridad

### Autorización
- **RLS en todas las tablas.** El público solo lee mesas activas, horarios activos, categorías y platos disponibles.
- **Reservas:** el público no puede leer, insertar ni modificar la tabla; solo usa funciones `security definer`
  (`crear_reserva`, `ocupacion`, `consultar_reserva`, `cancelar_reserva`) que validan todo y nunca devuelven el teléfono.
- **Panel:** Supabase Auth + tabla `administradores` + `es_admin()` en cada política. Un usuario autenticado que no sea
  administrador no puede leer ni modificar nada (probado con solicitudes reales).
- **Imágenes:** bucket `imagenes` de lectura pública; subir o borrar requiere ser administrador.

### «Token de seguridad en la URL»: interpretación implementada

El profesor lo mencionó sin más detalle. Implementamos la interpretación más defendible:

1. **El token de sesión (JWT) nunca aparece en la URL**, ni en la consulta (`?`) ni en el fragmento (`#`): se inicia
   sesión con correo y contraseña y el cliente usa `flowType: 'pkce'` y `detectSessionInUrl: false`. Si alguien abre
   `/admin#access_token=…`, la app no lo usa y lo **borra** de la barra de direcciones.
2. **Ninguna ruta del panel se abre sin iniciar sesión:** `admin.html#mesas` sin sesión muestra el acceso; además, la base de
   datos rechaza cualquier operación sin un token de administrador válido (la ruta oculta no es la protección).
3. **Tras cerrar sesión o expirar** el token no queda ni en `localStorage` ni en la URL: la sesión vive en `sessionStorage`
   (se borra al salir y al cerrar la pestaña), `signOut` revoca la sesión en Supabase y el panel tiene `Cache-Control: no-store`,
   así que «Atrás» no vuelve a mostrarlo.

> ⚠️ **Por confirmar con el profesor** si con «token de seguridad en la URL» se refería a otra cosa (por ejemplo, enlaces
> firmados para que el cliente vea su reserva). Hoy el cliente consulta su reserva con código + nombre en `mi-reserva.html`.

Detalle técnico: la sesión **no** usa cookies HttpOnly (supabase-js en el navegador guarda la sesión en `sessionStorage`);
la CSP solo permite scripts propios y de `cdn.jsdelivr.net`. Un *access token* ya emitido sigue siendo válido para la API
hasta que vence, como cualquier JWT; por eso se recomienda un *JWT expiry* corto.

### Cierre por inactividad (5 minutos)
- `js/admin/inactividad.js`: `INACTIVIDAD_MS = 300000`. Ratón, teclado, clic, rueda, desplazamiento y toque reinician el contador.
- A los **4 minutos** aparece «¿Sigues ahí?» con el botón **Seguir conectado**.
- A los 5 minutos: `signOut` real, se borra la sesión guardada, vuelve el acceso con «Tu sesión se cerró por inactividad»,
  el panel queda vacío y la URL sin la sección.
- **Varias pestañas:** la actividad en una mantiene vivas las demás y cerrar sesión (o expirar) en una cierra todas
  (evento `storage`; en `localStorage` solo se guarda una marca de tiempo, nunca el token).
- Solo en `localhost`/`127.0.0.1` se puede acortar con `?inactividad=<segundos>` para las pruebas.

### Otras medidas
- **CSP** y cabeceras de seguridad en `vercel.json` (generadas desde `scripts/seguridad-http.mjs` y verificadas por una prueba);
  `Cache-Control: no-store` en el panel.
- **XSS:** todo texto dinámico pasa por `esc()` antes de insertarse en el HTML (revisado en `admin/*.js`, `ui.js`, `reserva.js`
  y las páginas públicas; la prueba Selenium «XSS» lo verifica).
- **Intentos de acceso:** tras 5 fallos el formulario se bloquea 60 s (además de los límites de Supabase Auth).
- **Secretos:** `.env` y `js/config.js` están en `.gitignore`.

## Despliegue en Vercel

1. *Settings → Git*: la rama de producción debe ser `main` (el 7/11/2026 el sitio publicado era una versión antigua).
2. *Settings → Environment Variables*: `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. El build (`node scripts/generar-config.mjs`)
   genera `js/config.js` en cada despliegue.
3. `vercel.json` define URL limpias (`/carta`, `/admin`…), cabeceras de seguridad y HTTPS (HSTS).

## Fuera del alcance

Pagos, domicilios, app nativa, cuentas de clientes, notificaciones, reportes e inventario.
