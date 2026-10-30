# Konys Pizza · Sistema de reservas

Aplicación web para reservar mesas en Konys Pizza (Cra. 36 con calle 41, Bucaramanga) sin crear
cuenta, con carta digital y un panel de administración protegido.

- **Frontend:** HTML5, CSS3 y JavaScript vanilla (módulos ES), sin frameworks ni paso de compilación.
- **Backend:** Supabase (PostgreSQL, Auth, Storage) con Row Level Security.
- **Despliegue previsto:** Vercel.
- **Diseño:** fiel al archivo de alta fidelidad de Figma (capturas en `docs/diseno/`).

> Enlace de la aplicación desplegada: _pendiente_ · Enlace del video: _pendiente_

---

## Estructura

```
konys-reservas-app/
├── index.html              # Inicio: portada, consulta rápida, mesas, carta y contacto
├── reservar.html           # Flujo de reserva: mesa → fecha y hora → datos → confirmación
├── admin.html              # Panel: acceso + Resumen, Mesas, Horarios, Reservas, Carta
├── css/
│   ├── styles.css          # Tokens del sistema visual, componentes y sitio público
│   └── admin.css           # Estilos del panel
├── js/
│   ├── supabase.js         # Cliente único de Supabase (lee js/config.js)
│   ├── api.js              # TODAS las consultas a Supabase y traducción de errores
│   ├── disponibilidad.js   # Cálculo de horarios libres (solo para mostrar)
│   ├── validaciones.js     # Validación de formularios
│   ├── formato.js          # Fechas, horas (zona America/Bogota) y precios
│   ├── ui.js               # Iconos, ilustraciones, alertas, diálogos
│   ├── inicio.js           # Lógica de index.html
│   ├── reserva.js          # Lógica de reservar.html
│   └── admin/              # app.js (acceso y navegación) + una sección por archivo
├── supabase/
│   ├── migrations/001_esquema_inicial.sql   # Tablas, reglas, funciones y RLS
│   └── seed.sql                             # Datos iniciales del diseño (mesas, horarios, carta)
├── scripts/
│   ├── generar-config.mjs  # Crea js/config.js desde .env (o variables de Vercel)
│   └── servidor-local.mjs  # Servidor estático para desarrollo
├── tests/                  # Pruebas de lógica y del esquema SQL
├── docs/
│   ├── REGLA_DISPONIBILIDAD.md
│   └── diseno/             # Capturas del diseño de Figma
├── .env.example
├── vercel.json
└── package.json            # Solo scripts y una dependencia de desarrollo para pruebas
```

La interfaz, las consultas a Supabase (`api.js`) y las validaciones (`validaciones.js`,
`disponibilidad.js`) están separadas, como pide el documento del proyecto (RNF-06).

---

## Puesta en marcha

### 1. Crear la base de datos en Supabase

1. En [supabase.com](https://supabase.com), crea un proyecto (o abre el existente).
2. Ve a **SQL Editor → New query**, pega el contenido de
   `supabase/migrations/001_esquema_inicial.sql` y pulsa **Run**.
   La migración no borra datos: si una tabla ya existe, la conserva.
3. En otra consulta, pega `supabase/seed.sql` y pulsa **Run** (carga las 9 mesas, los horarios y la
   carta del diseño; solo inserta si las tablas están vacías).

### 2. Crear el usuario administrador

1. **Authentication → Users → Add user → Create new user**: escribe el correo y una contraseña
   segura, y marca *Auto Confirm User*.
2. En **SQL Editor** ejecuta (cambiando el correo):

   ```sql
   insert into public.administradores (user_id, nombre)
   select id, 'Administrador' from auth.users where email = 'tu-correo@ejemplo.com';
   ```

3. Recomendado: **Authentication → Sign In / Providers → desactiva "Allow new users to sign up"**.
   Aunque alguien creara una cuenta, no tendría permisos (no estaría en `administradores`).

### 3. Configurar las variables

```bash
cp .env.example .env
```

Completa en `.env`:

| Variable | Dónde se obtiene |
|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → *Publishable key* (o la *anon public* en proyectos antiguos) |
| `ADMIN_EMAIL` | El correo del administrador creado en el paso 2 |
| `CONTACTO_WHATSAPP`, `CONTACTO_INSTAGRAM` | Opcionales; se muestran en el pie de página |

**Nunca** uses la clave `service_role` / `sb_secret_…`: el script se niega a generar la
configuración si la detecta.

### 4. Ejecutar localmente

Requiere Node.js 18 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>. El panel está en <http://localhost:5173/admin>.

### 5. Pruebas

```bash
npm test
```

Ejecuta 28 pruebas: la lógica del navegador y la migración SQL real sobre PostgreSQL embebido
(PGlite), incluyendo reservas solapadas, cancelaciones, capacidad, mesas inactivas, turnos y RLS.

### 6. Desplegar en Vercel

1. Importa el repositorio en Vercel (framework: *Other*). `vercel.json` ya define el build
   (`node scripts/generar-config.mjs`) y las URL limpias (`/admin`, `/reservar`).
2. En **Settings → Environment Variables** añade `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y
   `ADMIN_EMAIL`.

---

## Seguridad

- **RLS activado en todas las tablas.** El público solo puede leer mesas activas, horarios activos,
  categorías y platos disponibles.
- **Reservas:** el público no puede leer, modificar ni insertar directamente en `reservas`. Solo
  puede llamar a `crear_reserva()` (valida todo y solo inserta los campos permitidos) y a
  `ocupacion()` (devuelve franjas ocupadas **sin** nombres ni teléfonos).
- **Panel:** autenticación real con Supabase Auth (contraseñas cifradas por Supabase) y
  autorización con la tabla `administradores` + función `es_admin()` en cada política. La ruta
  `/admin` no es la protección: sin una sesión de administrador, la base de datos no entrega ni
  acepta datos administrativos.
- **Imágenes:** bucket `imagenes` público de solo lectura; subir/borrar requiere ser administrador.
- **Secretos:** `.env` y `js/config.js` están en `.gitignore`. La clave publishable es pública por
  diseño; lo que protege los datos es RLS.

## Regla de disponibilidad

Ver [`docs/REGLA_DISPONIBILIDAD.md`](docs/REGLA_DISPONIBILIDAD.md). Resumen: reservas de duración
configurable (60 min) que empiezan cada 30 min dentro de las jornadas activas; una restricción de
exclusión de PostgreSQL impide que dos reservas no canceladas de la misma mesa se crucen, incluso
si se confirman al mismo tiempo.

## Decisiones tomadas donde el diseño no lo definía

- **Acceso al panel con solo contraseña** (como en el diseño): el correo del administrador viene de
  `ADMIN_EMAIL`. Para varios administradores habría que añadir un campo de correo.
- **Paso 1 "Mesa" y paso 3 "Tus datos"** no tienen pantalla propia en Figma: se construyeron con
  los mismos componentes (tarjetas de mesa, campos, contador) y los estados del archivo 4.
- **Pantalla de confirmación:** reutiliza la tarjeta "Tu reserva" con la alerta de éxito del sistema
  visual y un código corto de reserva.
- **Horarios:** cada jornada se guarda al pulsar "Guardar" en su fila (en vez de un único botón
  global), para que un error en una fila no bloquee las demás.
- **Seed:** la entrada "Palitos de ajo y queso" tiene precio y descripción de ejemplo (en el diseño
  aparecen cortados); edítalos desde el panel.
- **Contacto:** el diseño muestra `[TU NÚMERO DE WHATSAPP]` / `[TU INSTAGRAM]`; se configuran con
  variables y se ocultan si están vacías.

## Fuera del alcance (por ahora)

Pagos o anticipos, domicilios, app nativa, cuentas de clientes, notificaciones, reportes e
inventario. Tampoco hay límite de reservas por persona (anti-spam); sería una mejora futura.
