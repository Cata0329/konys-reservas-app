# Konys Pizza · Sistema de reservas

Aplicación web para reservar mesas en Konys Pizza (Cra. 36 con calle 41, Bucaramanga) sin crear cuenta,
con la carta oficial del restaurante y un panel de administración protegido.

- **Frontend:** HTML5, CSS3 y JavaScript vanilla (módulos ES), sin framework ni compilación.
- **Backend:** Supabase (PostgreSQL, Auth y Storage) con Row Level Security.
- **Pruebas:** Node `node:test` + PGlite (lógica y SQL) y Selenium con Python (recorridos en Chrome).
- **Despliegue previsto:** Vercel. **Diseño:** fiel a Figma (capturas en `docs/diseno/`).

> Enlace de la aplicación desplegada: _pendiente de autorización_ · Enlace del video: _pendiente_

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/INFORME_AUDITORIA.md`](docs/INFORME_AUDITORIA.md) | Estado de RF-01…RF-14 y RNF-01…RNF-09 con evidencias |
| [`docs/CATALOGO_KONYS.md`](docs/CATALOGO_KONYS.md) | Catálogo oficial (67 productos), decisiones de modelado e imágenes |
| [`docs/INFORME_CONSOLA.md`](docs/INFORME_CONSOLA.md) | Revisión de consola, red y terminal |
| [`docs/INFORME_PRUEBAS_SELENIUM.md`](docs/INFORME_PRUEBAS_SELENIUM.md) | Casos Selenium, resultados y correcciones |
| [`docs/REGLA_DISPONIBILIDAD.md`](docs/REGLA_DISPONIBILIDAD.md) | Cómo se evitan las reservas duplicadas |

## Estructura

```
konys-reservas-app/
├── index.html · reservar.html · mi-reserva.html · admin.html
├── css/                    styles.css (sistema visual + sitio), admin.css
├── js/
│   ├── supabase.js         Cliente único (PKCE, sesión en sessionStorage, tiempo límite)
│   ├── api.js              TODAS las consultas a Supabase y traducción de errores
│   ├── disponibilidad.js · validaciones.js · formato.js · ui.js
│   ├── inicio.js · reserva.js · mi-reserva.js
│   └── admin/              app.js (acceso), inactividad.js (5 min), una sección por archivo
├── supabase/
│   ├── migrations/001_esquema_inicial.sql      Tablas, reglas, RLS
│   ├── migrations/002_catalogo_y_consulta.sql  Respaldo, columnas del catálogo, «Mi reserva»
│   ├── migrations/003_catalogo_oficial.sql     Catálogo oficial (GENERADO)
│   └── seed.sql                                Mesas y horarios iniciales
├── scripts/
│   ├── generar-config.mjs        .env → js/config.js (rechaza claves secretas)
│   ├── extraer-menu-konys.mjs    Menú oficial → docs/menu-oficial-konys.json
│   ├── generar-sql-catalogo.mjs  JSON → migración 003 + docs/CATALOGO_KONYS.md
│   ├── seguridad-http.mjs        CSP y cabeceras (las mismas que vercel.json)
│   └── servidor-local.mjs        Servidor de desarrollo
├── tests/                  *.test.mjs (Node), sql/, selenium/, soporte/supabase-local.mjs
├── pruebas/                Aporte previo (Selenium de otro formulario; ver informe)
└── docs/
```

## Puesta en marcha

### 1. Base de datos en Supabase

En **SQL Editor**, ejecuta en este orden (todas son idempotentes y ninguna borra tablas ni reservas):

| Paso | Archivo | Qué hace |
|---|---|---|
| 1 | `supabase/migrations/001_esquema_inicial.sql` | Esquema, reglas de reserva, RLS. *(Ya ejecutada si la base existe.)* |
| 2 | `supabase/seed.sql` | 9 mesas y horarios (solo si las tablas están vacías). *(Ya ejecutado si la base existe.)* |
| 3 | `supabase/migrations/002_catalogo_y_consulta.sql` | **Respalda** `platos` y `categorias` en el esquema `respaldo`, añade columnas del catálogo y las funciones de «Mi reserva». |
| 4 | `supabase/migrations/003_catalogo_oficial.sql` | Carga las 14 categorías y 67 productos oficiales, oculta los 7 platos de ejemplo y corrige «Limonada de coco». |

Comprobación después del paso 4:

```sql
select origen, disponible, count(*) from public.platos group by 1, 2 order by 1, 2;
-- Esperado: oficial/true 67 · prueba/false 7
select count(*) from respaldo.platos_antes_catalogo;  -- 8 (respaldo previo)
```

Para actualizar el catálogo en el futuro: `npm run menu:extraer`, `npm run menu:sql` y volver a ejecutar la 003
(no duplica productos y respeta la disponibilidad que haya definido el administrador).

### 2. Autenticación (Supabase → Authentication)

1. **Users → Add user**: correo y contraseña segura, *Auto Confirm User*. Después, en SQL Editor:
   ```sql
   insert into public.administradores (user_id, nombre)
   select id, 'Administrador' from auth.users where email = 'tu-correo@ejemplo.com';
   ```
2. **Sign In / Providers → desactiva «Allow new users to sign up»**.
3. **URL Configuration**: *Site URL* = la URL de Vercel; *Redirect URLs* = solo esa URL y
   `http://localhost:5173` (no uses comodines amplios).
4. **Rate Limits**: deja activos los límites de inicio de sesión (protección contra fuerza bruta en el servidor).
5. Recomendado: **JWT expiry** de 600–900 s (ver «Manejo de tokens»).

### 3. Variables de entorno

```bash
cp .env.example .env
```

| Variable | Dónde se obtiene |
|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → *Publishable key* (o *anon public*) |
| `ADMIN_EMAIL` | Correo del administrador del paso 2 |
| `CONTACTO_WHATSAPP`, `CONTACTO_INSTAGRAM` | Opcionales (pie de página) |

Nunca uses la clave `service_role` / `sb_secret_…`: el script se niega a generar la configuración si la detecta.

### 4. Ejecutar localmente

Requiere Node.js 18+.

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173> (panel en `/admin`, consulta de reservas en `/mi-reserva`).

## Pruebas

```bash
npm test
```

44 pruebas: lógica de disponibilidad, validaciones, control de inactividad, CSP y las migraciones SQL reales
sobre PostgreSQL embebido (solapamientos, cancelaciones, capacidad, turnos, catálogo, RLS por rol).

```bash
py -m pip install -r pruebas/requirements.txt
```

```bash
py -X utf8 tests/selenium/ejecutar.py
```

31 casos en Chrome (funcionales, seguridad, inactividad y consola). Usan un Supabase **local** de pruebas, nunca
la base real; ver [`docs/INFORME_PRUEBAS_SELENIUM.md`](docs/INFORME_PRUEBAS_SELENIUM.md).

## Seguridad

### Autorización (lo que realmente protege los datos)
- **RLS en todas las tablas.** El público solo lee mesas activas, horarios activos, categorías y platos disponibles.
- **Reservas:** el público no puede leer, insertar ni modificar la tabla. Solo usa funciones `security definer`:
  `crear_reserva()` (valida todo), `ocupacion()` (franjas sin datos personales), `consultar_reserva()` y
  `cancelar_reserva()` (requieren código **y** nombre; nunca devuelven el teléfono).
- **Panel:** Supabase Auth + tabla `administradores` + función `es_admin()` en cada política. Un usuario
  autenticado que no sea administrador no puede leer ni modificar nada (probado con solicitudes reales).
- **Clientes no modifican precios ni productos**: `anon` no tiene permisos de escritura en ninguna tabla.
- **Imágenes:** bucket `imagenes` de solo lectura pública; subir o borrar requiere ser administrador.

### Manejo de tokens
- El acceso usa correo + contraseña con `supabase-js` (`signInWithPassword`): los tokens llegan en el cuerpo de
  la respuesta HTTPS, **nunca en la URL**.
- `flowType: 'pkce'` y `detectSessionInUrl: false`: aunque alguien abra `/admin#access_token=…`, la app no lo usa
  y además **borra** de la barra de direcciones cualquier `access_token`, `refresh_token`, `code` o `token`.
- La sesión se guarda en **`sessionStorage`** (clave `konys-admin-sesion`): desaparece al cerrar la pestaña. **No
  son cookies HttpOnly**: el JavaScript de la propia página puede leerla; por eso la CSP solo permite scripts
  propios y de `cdn.jsdelivr.net` (supabase-js).
- Al abrir el panel se llama a `auth.getUser()`, que valida el token **en el servidor** de Supabase Auth. Un token
  manipulado, vencido o de una sesión cerrada se rechaza y se borra.
- Cerrar sesión llama a `signOut({ scope: 'global' })`: Supabase revoca la sesión y todos sus refresh tokens.
  Igual que en cualquier JWT sin estado, el *access token* ya emitido sigue siendo aceptado por la API REST hasta
  su vencimiento; por eso se recomienda un *JWT expiry* corto (paso 2.5). La aplicación ya no lo conserva.

### Cierre por inactividad (5 minutos)
- `js/admin/inactividad.js`: `TIEMPO_INACTIVIDAD_MS = 300000`. Ratón, teclado, clic, rueda, desplazamiento y toque
  reinician el contador. Al vencer: `signOut` real, vuelta al acceso con «Tu sesión se cerró por inactividad», panel
  vaciado y URL sin la sección.
- Antes de cada clic, envío o cambio dentro del panel se comprueba que la sesión no haya vencido (por ejemplo, si el
  equipo estuvo suspendido); recargar la página tampoco reinicia el contador.
- Solo afecta al panel, no al sitio público.
- **Pruebas:** en `localhost` se puede acortar con `?inactividad=<segundos>` (nunca más de 5 min). En cualquier otro
  dominio el parámetro se ignora.

### Otras medidas
- **CSP** y cabeceras (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) en `vercel.json`,
  generadas desde `scripts/seguridad-http.mjs` y verificadas por una prueba.
- **XSS:** todo texto dinámico pasa por `esc()` antes de insertarse en el HTML.
- **Inyección SQL:** no hay SQL construido en el navegador; PostgREST y las funciones usan parámetros.
- **Validación doble:** formularios en el navegador y restricciones/funciones en la base.
- **Intentos de acceso:** tras 5 fallos el formulario se bloquea 60 s (además de los límites de Supabase Auth).
- **Secretos:** `.env` y `js/config.js` están en `.gitignore`; la clave publishable es pública por diseño.

## Despliegue en Vercel

1. Importar el repositorio (framework *Other*). `vercel.json` define el build, las URL limpias y las cabeceras.
2. *Settings → Environment Variables*: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ADMIN_EMAIL`.
3. Añadir la URL de Vercel en Supabase → Authentication → URL Configuration.
4. Vercel sirve todo por HTTPS; HSTS obliga al navegador a mantenerlo.

## Decisiones donde el diseño o la fuente no lo definían

- **Acceso con solo contraseña** (como en Figma): el correo viene de `ADMIN_EMAIL`.
- **Carta:** la fuente oficial es el menú de Konys en Clubify; ver [`docs/CATALOGO_KONYS.md`](docs/CATALOGO_KONYS.md).
- **Mi reserva:** el código de 8 caracteres de la confirmación + el nombre permiten consultar y cancelar.

## Fuera del alcance

Pagos, domicilios, app nativa, cuentas de clientes, notificaciones, reportes e inventario.
