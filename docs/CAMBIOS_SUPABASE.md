# Cambios en Supabase — guía para Tatis

Hola Tatis 👋. Este documento explica los cambios que hay que aplicar en la base de datos de Supabase del
proyecto (la cuenta es tuya). Todo está en archivos SQL nuevos; **la migración `001_esquema_inicial.sql` no se
toca** porque ya está ejecutada.

- **Dónde:** Supabase → tu proyecto → **SQL Editor** → *New query*. Pegas el contenido completo del archivo y pulsas **Run**.
- **Orden:** exactamente el de la tabla. Cada archivo se puede ejecutar más de una vez sin duplicar nada.
- **Qué NO hacen:** no borran tablas, no borran reservas ni mesas, no tocan usuarios.
- **Tiempo:** menos de 5 minutos en total.

## 1. Qué cambia y por qué

| Paso | Archivo | Qué hace | Por qué |
|---|---|---|---|
| 1 | `supabase/migrations/002_carta_real.sql` | Guarda una **copia de seguridad** de `platos` y `categorias` en un esquema privado `respaldo`. Agrega a `categorias`: `subtitulo`, `disponible_desde`, `disponible_hasta`. Agrega a `platos`: `subcategoria`, `recomendado`, `etiquetas`, `variantes`, `id_externo`, `origen`; permite precio vacío; amplía la descripción de 300 a 600 caracteres. | La carta actual (8 platos) es inventada. La carta real de Konys tiene 15 secciones, subsecciones (p. ej. «Konys clásicas»), variantes (Coca-Cola original o Zero), etiquetas oficiales y un producto sin precio publicado. |
| 2 | `supabase/seed_carta_real.sql` | Crea/actualiza las **14 categorías** reales y los **67 productos** reales con precio en COP e `imagen_url` oficial. Marca los 7 platos inventados como `origen = 'prueba'` y los **oculta** (no los borra). Corrige «Limonada de coco» con los datos oficiales. | Que la carta pública muestre solo productos reales verificados en el menú oficial (soyclubify.com/d/konys). |
| 3 | `supabase/migrations/003_consulta_reservas.sql` | Crea dos funciones: `consultar_reserva(codigo, nombre)` y `cancelar_reserva(codigo, nombre)`. | Página pública «Mi reserva»: el cliente consulta o cancela su reserva con el código de 8 caracteres **y** su nombre. Nunca devuelve el teléfono. |
| 4 | `supabase/migrations/004_horarios_reales.sql` | Deja **todos los días** con dos jornadas: almuerzo 12:30–14:30 y noche 17:00–23:00. | El documento del proyecto dice 12:30–2:30 p. m. y 5:00–11:00 p. m. El horario actual (lunes cerrado, martes solo noche) venía del diseño de Figma, no del restaurante. Decisión del equipo del 7 de noviembre de 2026. |
| 5 | `supabase/migrations/005_fotos_sodas.sql` | Pone la foto oficial a «SODA ARANDANOS» y «SODA MARACUYÁ» (solo si siguen sin foto). | La carta oficial usa la misma foto para las dos; la primera versión de la carta las dejó sin imagen. Decisión del equipo del 8 de noviembre de 2026. |

**Decisiones sobre la estructura de la carta** (aprobadas por el equipo):

- «Recomendados» **no** es una categoría: es la columna `platos.recomendado`, y la carta la muestra como primera pestaña.
- Se conservan los ids de categoría que ya existían (`pizzas`, `entradas`, `postres`, `bebidas`) y los nuevos siguen el patrón
  `^[a-z_]+$`: `menu_infantil`, `desgranados`, `papas_ikonicas`, `lasana`, `granizados`, `sodas`, `cerveza`, `cocteles`,
  `menu_almuerzos`, `congelados`. `bebidas` pasa a llamarse «Bebidas Frías».
- El *check* de `platos.etiqueta` (clasica/especialidad/vegetariana) **no se cambia**: los productos reales guardan sus
  etiquetas oficiales (p. ej. «PIZZA MASTER 2023») en la nueva columna `etiquetas`, y `etiqueta` queda vacía.
- Menú Almuerzos guarda su franja (12:00–14:30) y la carta muestra «Disponible ahora / Fuera de horario».
- Detalle de cada producto y de cada decisión: `docs/CATALOGO_KONYS.md`.

## 2. Pasos

### Antes de empezar (opcional, recomendado)

Supabase → **Database → Backups**: confirma que hay una copia reciente. La migración 002 además guarda su propio respaldo.

### Paso 1 — `002_carta_real.sql`

Pega el archivo completo y pulsa **Run**. Comprobación:

```sql
select count(*) as platos_respaldados from respaldo.platos_antes_catalogo;        -- 8
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'platos'
  and column_name in ('subcategoria','recomendado','etiquetas','variantes','id_externo','origen');  -- 6 filas
```

### Paso 2 — `seed_carta_real.sql`

Está en `supabase/` (no en `migrations/`). Pega el archivo completo y pulsa **Run**. Comprobación:

```sql
select origen, disponible, count(*) from public.platos group by 1, 2 order by 1, 2;
-- oficial | true  | 67
-- prueba  | false | 7

select count(*) from public.categorias;                                            -- 14

select nombre, categoria_id, precio from public.platos where lower(nombre) = 'limonada de coco';
-- Limonada de Coco | granizados | 12990

select nombre, count(*) from public.platos group by nombre having count(*) > 1;   -- 0 filas (sin duplicados)
```

### Paso 3 — `003_consulta_reservas.sql`

Pega el archivo completo y pulsa **Run**. Comprobación (debe responder sin error y sin filas):

```sql
select * from public.consultar_reserva('00000000', 'Nadie Nadie');
```

### Paso 4 — `004_horarios_reales.sql`

Pega el archivo completo y pulsa **Run**. Comprobación:

```sql
select dia_semana, jornada, hora_inicio, hora_fin, activo
from public.horarios order by dia_semana, hora_inicio;
-- 14 filas: días 1 a 7, cada uno con almuerzo 12:30–14:30 y noche 17:00–23:00, activo = true
```

### Paso 5 — `005_fotos_sodas.sql` (nuevo, 8 nov 2026)

> **Tatis: si ya ejecutaste los pasos 1 a 4, solo te falta este.** No hace falta repetir los anteriores.

Pega el archivo completo y pulsa **Run**. Comprobación:

```sql
select nombre, imagen_url is not null as tiene_foto from public.platos
where nombre in ('SODA ARANDANOS', 'SODA MARACUYÁ');
-- las dos filas con tiene_foto = true
select count(*) from public.platos where origen = 'oficial' and imagen_url is null;   -- 0
```

### Paso 6 — comprobar desde la página

1. Abre <https://konys-reservas-app.vercel.app/carta.html> (después del nuevo despliegue): deben verse 15 pestañas
   empezando por «Recomendados» y fotos reales.
2. En el panel (`/admin`), sección **Carta**, filtra «Origen: Dato de prueba»: deben aparecer los 7 platos inventados,
   ocultos. Si el equipo decide borrarlos, se eliminan desde ahí (no tienen dependencias).

## 3. Configuración de Authentication (una sola vez)

1. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up**.
2. **Authentication → URL Configuration**: *Site URL* = `https://konys-reservas-app.vercel.app`; *Redirect URLs* = esa
   misma URL y `http://localhost:5173`.
3. **Authentication → Rate Limits**: deja activos los límites de inicio de sesión.
4. El panel ahora pide **correo y contraseña** (el correo ya no viaja en la configuración pública). El administrador debe
   estar en la tabla `administradores`:
   ```sql
   select u.email from public.administradores a join auth.users u on u.id = a.user_id;
   ```

## 4. Cómo revertir

Cada paso se puede deshacer por separado. Ejecuta solo lo que necesites, en orden inverso (5 → 4 → 3 → 2 → 1).

**Revertir paso 5 (fotos de sodas):**

```sql
update public.platos set imagen_url = null
where id_externo in ('0d5c856e-b81e-4338-9e04-f2b26e27ea37', '85d83346-4aa9-4195-8068-3e0d5c638076');
```

**Revertir paso 4 (horarios)** — vuelve al horario anterior (lunes cerrado, martes solo noche):

```sql
update public.horarios set activo = false
where dia_semana = 1 or (dia_semana = 2 and jornada = 'almuerzo');
```

**Revertir paso 3 (Mi reserva):**

```sql
drop function if exists public.cancelar_reserva(text, text);
drop function if exists public.consultar_reserva(text, text);
```

**Revertir paso 2 (carta real)** — vuelve a la carta anterior exactamente como estaba. Ejecuta el archivo
`supabase/revertir/revertir_carta_real.sql` (está probado en `tests/sql/esquema.test.mjs`).

**Revertir paso 1 (estructura)** — solo después de revertir el paso 2. Las columnas nuevas no molestan a la versión
anterior de la página, así que normalmente **no hace falta**. Si aun así se quieren quitar:

```sql
alter table public.platos drop column if exists subcategoria, drop column if exists recomendado,
  drop column if exists etiquetas, drop column if exists variantes, drop column if exists id_externo,
  drop column if exists origen;
alter table public.categorias drop column if exists subtitulo, drop column if exists disponible_desde,
  drop column if exists disponible_hasta;
-- precio vuelve a ser obligatorio solo si ningún plato quedó sin precio:
alter table public.platos alter column precio set not null;
-- el esquema respaldo se puede borrar cuando ya no se necesite: drop schema respaldo cascade;
```

## 5. Seguridad (no cambia)

- RLS sigue activo en todas las tablas: el público solo lee mesas activas, horarios activos, categorías y platos
  disponibles; nunca lee ni modifica reservas directamente.
- El esquema `respaldo` no está expuesto en la API.
- El bucket `imagenes` sigue siendo de lectura pública y escritura solo para administradores.
- En el código **no hay** claves `service_role` / `sb_secret_`: solo la *publishable key*, que se configura en Vercel.

## 6. Cómo se probó antes de enviártelo

Los cuatro archivos se ejecutaron en un PostgreSQL real (PGlite) partiendo **del mismo estado que tiene hoy tu base**
(seed original con los 8 platos inventados y el horario antiguo), dos veces seguidas para comprobar que no duplican nada:
`npm test` → 49 pruebas aprobadas (`tests/sql/esquema.test.mjs`). Además, 37 pruebas Selenium recorrieron la aplicación
sobre esa copia.
