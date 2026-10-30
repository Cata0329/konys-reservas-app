-- =====================================================================
-- Konys Pizza · Sistema de reservas
-- Migración 001: esquema inicial, reglas de negocio y seguridad (RLS)
--
-- Cómo usarla: Supabase → SQL Editor → pegar este archivo → Run.
-- Es NO destructiva: no borra tablas ni datos. Si una tabla ya existe,
-- se conserva (create ... if not exists). Las políticas se recrean.
-- =====================================================================

-- Necesaria para combinar "=" (mesa) y "&&" (solapamiento de rangos)
-- en una misma restricción de exclusión.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. Administradores
--    La autenticación la hace Supabase Auth (contraseñas cifradas por
--    Supabase). Esta tabla define QUIÉN de esos usuarios es administrador.
-- ---------------------------------------------------------------------
create table if not exists public.administradores (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  nombre    text,
  creado_en timestamptz not null default now()
);

-- Devuelve true si el usuario autenticado está en la tabla administradores.
-- security definer: puede leer la tabla aunque RLS la proteja.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.administradores where user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Mesas
-- ---------------------------------------------------------------------
create table if not exists public.mesas (
  id        bigint generated always as identity primary key,
  nombre    text not null unique
            check (char_length(btrim(nombre)) between 1 and 40),
  zona      text not null check (zona in ('salon', 'terraza')),
  capacidad smallint not null check (capacidad between 1 and 12),
  activa    boolean not null default true,
  foto_url  text,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Horarios de atención (jornadas por día de la semana)
--    dia_semana usa la norma ISO: 1 = lunes … 7 = domingo.
-- ---------------------------------------------------------------------
create table if not exists public.horarios (
  id           bigint generated always as identity primary key,
  dia_semana   smallint not null check (dia_semana between 1 and 7),
  jornada      text not null check (jornada in ('almuerzo', 'noche')),
  hora_inicio  time not null,
  hora_fin     time not null,
  duracion_min smallint not null default 60
               check (duracion_min between 15 and 240),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  constraint horarios_dia_jornada_unica unique (dia_semana, jornada),
  constraint horarios_fin_despues_de_inicio check (hora_fin > hora_inicio),
  -- Debe caber al menos una reserva completa dentro de la jornada.
  constraint horarios_cabe_una_reserva
    check (hora_fin - hora_inicio >= make_interval(mins => duracion_min::int)),
  -- Dos jornadas del mismo día no pueden cruzarse.
  constraint horarios_sin_cruce exclude using gist (
    dia_semana with =,
    tsrange(date '2000-01-03' + hora_inicio, date '2000-01-03' + hora_fin, '[)') with &&
  )
);

-- ---------------------------------------------------------------------
-- 4. Carta: categorías y platos
-- ---------------------------------------------------------------------
create table if not exists public.categorias (
  id     text primary key check (id ~ '^[a-z_]+$'),
  nombre text not null,
  orden  smallint not null default 0
);

create table if not exists public.platos (
  id           bigint generated always as identity primary key,
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 80),
  categoria_id text not null references public.categorias (id)
               on update cascade on delete restrict,
  descripcion  text check (descripcion is null or char_length(descripcion) <= 300),
  precio       integer not null check (precio >= 0),   -- pesos colombianos
  imagen_url   text,
  etiqueta     text check (etiqueta in ('clasica', 'especialidad', 'vegetariana')),
  disponible   boolean not null default true,
  orden        smallint not null default 0,
  creado_en    timestamptz not null default now()
);

create index if not exists platos_categoria_idx on public.platos (categoria_id, orden);

-- ---------------------------------------------------------------------
-- 5. Reservas
-- ---------------------------------------------------------------------
create table if not exists public.reservas (
  id               uuid primary key default gen_random_uuid(),
  -- on delete restrict: no se puede borrar una mesa con reservas históricas.
  mesa_id          bigint not null references public.mesas (id) on delete restrict,
  cliente_nombre   text not null check (char_length(btrim(cliente_nombre)) between 3 and 80),
  cliente_contacto text check (cliente_contacto is null or char_length(cliente_contacto) <= 40),
  num_personas     smallint not null check (num_personas between 1 and 12),
  fecha            date not null,
  hora_inicio      time not null,
  hora_fin         time not null,
  estado           text not null default 'confirmada'
                   check (estado in ('confirmada', 'cancelada', 'completada')),
  creado_en        timestamptz not null default now(),
  constraint reservas_fin_despues_de_inicio check (hora_fin > hora_inicio),
  -- REGLA CENTRAL CONTRA DOBLE RESERVA:
  -- para una misma mesa, dos reservas NO canceladas no pueden tener
  -- intervalos [inicio, fin) que se crucen. PostgreSQL lo garantiza
  -- incluso si dos clientes confirman en el mismo instante.
  constraint reservas_sin_solapamiento exclude using gist (
    mesa_id with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
  ) where (estado <> 'cancelada')
);

create index if not exists reservas_fecha_idx on public.reservas (fecha, hora_inicio);

-- La capacidad vive en otra tabla, así que se valida con un trigger
-- (aplica también a cambios hechos desde el panel).
create or replace function public.validar_capacidad_reserva()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_capacidad smallint;
begin
  select capacidad into v_capacidad from public.mesas where id = new.mesa_id;
  if v_capacidad is not null and new.num_personas > v_capacidad then
    raise exception 'CAPACIDAD_EXCEDIDA'
      using detail = format('La mesa recibe hasta %s personas.', v_capacidad);
  end if;
  return new;
end;
$$;

drop trigger if exists reservas_validar_capacidad on public.reservas;
create trigger reservas_validar_capacidad
  before insert or update of mesa_id, num_personas on public.reservas
  for each row execute function public.validar_capacidad_reserva();

-- =====================================================================
-- 6. Funciones públicas (RPC)
--    El público NO lee ni escribe la tabla reservas directamente.
--    Solo usa estas dos funciones, que exponen lo mínimo necesario.
-- =====================================================================

-- Franjas ocupadas (sin datos personales) entre dos fechas.
-- El sitio público la usa para pintar horarios libres/ocupados.
create or replace function public.ocupacion(p_desde date, p_hasta date)
returns table (mesa_id bigint, fecha date, hora_inicio time, hora_fin time)
language sql
stable
security definer
set search_path = public
as $$
  select r.mesa_id, r.fecha, r.hora_inicio, r.hora_fin
  from public.reservas r
  join public.mesas m on m.id = r.mesa_id and m.activa
  where r.estado <> 'cancelada'
    and r.fecha between p_desde and least(p_hasta, p_desde + 62)
  order by r.fecha, r.hora_inicio;
$$;

-- Crea una reserva validando TODAS las reglas en el servidor.
-- Los errores se devuelven con un código corto en el mensaje
-- (p. ej. 'HORARIO_OCUPADO') que el frontend traduce a texto amable.
create or replace function public.crear_reserva(
  p_mesa_id          bigint,
  p_fecha            date,
  p_hora_inicio      time,
  p_cliente_nombre   text,
  p_num_personas     integer,
  p_cliente_contacto text default null
)
returns table (
  id             uuid,
  mesa_nombre    text,
  zona           text,
  fecha          date,
  hora_inicio    time,
  hora_fin       time,
  num_personas   smallint,
  cliente_nombre text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  c_paso_min      constant int := 30;   -- las horas de inicio van cada 30 min
  c_max_dias       constant int := 60;   -- reservas hasta 60 días adelante
  v_ahora          timestamp := now() at time zone 'America/Bogota';
  v_nombre         text := btrim(coalesce(p_cliente_nombre, ''));
  v_contacto       text := nullif(btrim(coalesce(p_cliente_contacto, '')), '');
  v_mesa           public.mesas%rowtype;
  v_horario        public.horarios%rowtype;
  v_inicio_min     int;
  v_reserva        public.reservas%rowtype;
begin
  if char_length(v_nombre) < 3 or char_length(v_nombre) > 80 then
    raise exception 'NOMBRE_INVALIDO';
  end if;
  if v_contacto is not null and char_length(v_contacto) > 40 then
    raise exception 'CONTACTO_INVALIDO';
  end if;
  if p_num_personas is null or p_num_personas < 1 then
    raise exception 'PERSONAS_INVALIDAS';
  end if;

  select * into v_mesa from public.mesas m where m.id = p_mesa_id;
  if not found or not v_mesa.activa then
    raise exception 'MESA_NO_DISPONIBLE';
  end if;
  if p_num_personas > v_mesa.capacidad then
    raise exception 'CAPACIDAD_EXCEDIDA'
      using detail = format('La mesa recibe hasta %s personas.', v_mesa.capacidad);
  end if;

  if p_fecha is null or p_hora_inicio is null
     or p_fecha < v_ahora::date
     or p_fecha > v_ahora::date + c_max_dias then
    raise exception 'FECHA_FUERA_DE_RANGO';
  end if;
  if p_fecha + p_hora_inicio <= v_ahora then
    raise exception 'HORARIO_PASADO';
  end if;

  -- La hora debe caer dentro de una jornada activa de ese día,
  -- alineada a la cuadrícula de 30 min y sin pasarse del cierre.
  v_inicio_min := extract(epoch from p_hora_inicio)::int / 60;
  select * into v_horario
  from public.horarios h
  where h.activo
    and h.dia_semana = extract(isodow from p_fecha)
    and v_inicio_min >= extract(epoch from h.hora_inicio)::int / 60
    and v_inicio_min + h.duracion_min <= extract(epoch from h.hora_fin)::int / 60
    and (v_inicio_min - extract(epoch from h.hora_inicio)::int / 60) % c_paso_min = 0
  limit 1;
  if not found then
    raise exception 'FUERA_DE_HORARIO';
  end if;

  begin
    insert into public.reservas
      (mesa_id, cliente_nombre, cliente_contacto, num_personas,
       fecha, hora_inicio, hora_fin, estado)
    values
      (v_mesa.id, v_nombre, v_contacto, p_num_personas,
       p_fecha, p_hora_inicio,
       p_hora_inicio + make_interval(mins => v_horario.duracion_min::int),
       'confirmada')
    returning * into v_reserva;
  exception
    when exclusion_violation then
      raise exception 'HORARIO_OCUPADO';
  end;

  return query
    select v_reserva.id, v_mesa.nombre, v_mesa.zona, v_reserva.fecha,
           v_reserva.hora_inicio, v_reserva.hora_fin,
           v_reserva.num_personas, v_reserva.cliente_nombre;
end;
$$;

-- =====================================================================
-- 7. Row Level Security
-- =====================================================================
alter table public.administradores enable row level security;
alter table public.mesas           enable row level security;
alter table public.horarios        enable row level security;
alter table public.categorias      enable row level security;
alter table public.platos          enable row level security;
alter table public.reservas        enable row level security;

-- Administradores: cada usuario solo puede ver su propia fila
-- (el panel la usa para saber si la cuenta tiene permisos).
drop policy if exists "admin ve su fila" on public.administradores;
create policy "admin ve su fila" on public.administradores
  for select to authenticated using (user_id = auth.uid());

-- Mesas: el público ve solo las activas; el admin ve y gestiona todas.
drop policy if exists "mesas lectura" on public.mesas;
create policy "mesas lectura" on public.mesas
  for select to anon, authenticated using (activa or public.es_admin());
drop policy if exists "mesas admin insertar" on public.mesas;
create policy "mesas admin insertar" on public.mesas
  for insert to authenticated with check (public.es_admin());
drop policy if exists "mesas admin actualizar" on public.mesas;
create policy "mesas admin actualizar" on public.mesas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "mesas admin eliminar" on public.mesas;
create policy "mesas admin eliminar" on public.mesas
  for delete to authenticated using (public.es_admin());

-- Horarios: el público ve solo los activos.
drop policy if exists "horarios lectura" on public.horarios;
create policy "horarios lectura" on public.horarios
  for select to anon, authenticated using (activo or public.es_admin());
drop policy if exists "horarios admin insertar" on public.horarios;
create policy "horarios admin insertar" on public.horarios
  for insert to authenticated with check (public.es_admin());
drop policy if exists "horarios admin actualizar" on public.horarios;
create policy "horarios admin actualizar" on public.horarios
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "horarios admin eliminar" on public.horarios;
create policy "horarios admin eliminar" on public.horarios
  for delete to authenticated using (public.es_admin());

-- Categorías: lectura pública, escritura admin.
drop policy if exists "categorias lectura" on public.categorias;
create policy "categorias lectura" on public.categorias
  for select to anon, authenticated using (true);
drop policy if exists "categorias admin escribir" on public.categorias;
create policy "categorias admin escribir" on public.categorias
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Platos: el público ve solo los disponibles.
drop policy if exists "platos lectura" on public.platos;
create policy "platos lectura" on public.platos
  for select to anon, authenticated using (disponible or public.es_admin());
drop policy if exists "platos admin insertar" on public.platos;
create policy "platos admin insertar" on public.platos
  for insert to authenticated with check (public.es_admin());
drop policy if exists "platos admin actualizar" on public.platos;
create policy "platos admin actualizar" on public.platos
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "platos admin eliminar" on public.platos;
create policy "platos admin eliminar" on public.platos
  for delete to authenticated using (public.es_admin());

-- Reservas: SOLO el admin lee, actualiza o elimina.
-- No hay política de INSERT: el público crea reservas únicamente
-- mediante public.crear_reserva(), que valida todo.
drop policy if exists "reservas admin leer" on public.reservas;
create policy "reservas admin leer" on public.reservas
  for select to authenticated using (public.es_admin());
drop policy if exists "reservas admin actualizar" on public.reservas;
create policy "reservas admin actualizar" on public.reservas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "reservas admin eliminar" on public.reservas;
create policy "reservas admin eliminar" on public.reservas
  for delete to authenticated using (public.es_admin());

-- Defensa adicional: el rol anónimo no tiene permisos de escritura
-- sobre ninguna tabla, aunque alguien añadiera una política por error.
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke all on public.reservas from anon;
revoke all on public.administradores from anon;

revoke all on function public.crear_reserva(bigint, date, time, text, integer, text) from public;
grant execute on function public.crear_reserva(bigint, date, time, text, integer, text) to anon, authenticated;
revoke all on function public.ocupacion(date, date) from public;
grant execute on function public.ocupacion(date, date) to anon, authenticated;
grant execute on function public.es_admin() to anon, authenticated;

-- =====================================================================
-- 8. Almacenamiento de imágenes (fotos de mesas y platos)
--    Bucket público de solo lectura; solo el admin puede subir/borrar.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes', 'imagenes', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "imagenes admin subir" on storage.objects;
create policy "imagenes admin subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imagenes' and public.es_admin());
drop policy if exists "imagenes admin actualizar" on storage.objects;
create policy "imagenes admin actualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'imagenes' and public.es_admin());
drop policy if exists "imagenes admin borrar" on storage.objects;
create policy "imagenes admin borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imagenes' and public.es_admin());
