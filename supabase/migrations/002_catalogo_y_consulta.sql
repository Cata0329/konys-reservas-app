-- =====================================================================
-- Konys Pizza · Migración 002
-- Estructura para el catálogo oficial, respaldo previo y consulta pública
-- de reservas por código.
--
-- Ejecutar DESPUÉS de 001 y ANTES de 003. Es idempotente: se puede
-- ejecutar varias veces sin duplicar nada ni borrar datos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Respaldo de los datos que se van a modificar (solo la primera vez).
--    El esquema "respaldo" no se expone por la API de Supabase.
-- ---------------------------------------------------------------------
create schema if not exists respaldo;
revoke all on schema respaldo from public;
do $$
begin
  if to_regclass('respaldo.platos_antes_catalogo') is null then
    create table respaldo.platos_antes_catalogo as table public.platos;
  end if;
  if to_regclass('respaldo.categorias_antes_catalogo') is null then
    create table respaldo.categorias_antes_catalogo as table public.categorias;
  end if;
end $$;
revoke all on all tables in schema respaldo from anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Categorías: subtítulo oficial y franja horaria opcional
--    (p. ej. "Menú Almuerzos: disponible solo de 12 a 2:30 pm").
-- ---------------------------------------------------------------------
alter table public.categorias add column if not exists subtitulo text;
alter table public.categorias add column if not exists disponible_desde time;
alter table public.categorias add column if not exists disponible_hasta time;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categorias_franja_valida') then
    alter table public.categorias add constraint categorias_franja_valida check (
      (disponible_desde is null and disponible_hasta is null)
      or (disponible_desde is not null and disponible_hasta is not null and disponible_hasta > disponible_desde)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categorias_nombre_valido') then
    alter table public.categorias add constraint categorias_nombre_valido
      check (char_length(btrim(nombre)) between 1 and 60);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Platos: campos que publica el menú oficial
-- ---------------------------------------------------------------------
alter table public.platos add column if not exists subcategoria text;
alter table public.platos add column if not exists recomendado boolean not null default false;
alter table public.platos add column if not exists etiquetas text[] not null default '{}';
alter table public.platos add column if not exists variantes jsonb not null default '[]'::jsonb;
-- Identificador del producto en la fuente oficial (evita duplicados al reimportar).
alter table public.platos add column if not exists id_externo text;
-- 'oficial' = verificado en el menú de Konys; 'prueba' = dato de ejemplo; 'manual' = creado en el panel.
alter table public.platos add column if not exists origen text not null default 'manual';
-- El precio puede no estar publicado (p. ej. "se vende por sabor, desde 6 unidades").
alter table public.platos alter column precio drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platos_id_externo_unico') then
    alter table public.platos add constraint platos_id_externo_unico unique (id_externo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platos_origen_valido') then
    alter table public.platos add constraint platos_origen_valido check (origen in ('oficial', 'prueba', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platos_subcategoria_valida') then
    alter table public.platos add constraint platos_subcategoria_valida
      check (subcategoria is null or char_length(subcategoria) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platos_variantes_es_lista') then
    alter table public.platos add constraint platos_variantes_es_lista check (jsonb_typeof(variantes) = 'array');
  end if;
  -- Las descripciones oficiales llegan a ~400 caracteres: se amplía el límite de 300 a 600.
  if exists (select 1 from pg_constraint where conname = 'platos_descripcion_check') then
    alter table public.platos drop constraint platos_descripcion_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platos_descripcion_largo') then
    alter table public.platos add constraint platos_descripcion_largo
      check (descripcion is null or char_length(descripcion) <= 600);
  end if;
end $$;

create index if not exists platos_recomendado_idx on public.platos (recomendado) where recomendado;

-- ---------------------------------------------------------------------
-- 3. Consulta y cancelación de reservas por el cliente
--    El cliente recibe un código de 8 caracteres (inicio del UUID). Para
--    consultar debe dar el código Y el nombre con que reservó; así nadie
--    puede leer reservas ajenas sin conocer ambos datos. No se expone el
--    teléfono ni ningún otro dato personal.
-- ---------------------------------------------------------------------
create or replace function public.consultar_reserva(p_codigo text, p_nombre text)
returns table (
  codigo         text,
  mesa_nombre    text,
  zona           text,
  fecha          date,
  hora_inicio    time,
  hora_fin       time,
  num_personas   smallint,
  estado         text,
  cancelable     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_codigo text := lower(btrim(coalesce(p_codigo, '')));
  v_nombre text := lower(btrim(coalesce(p_nombre, '')));
  v_ahora  timestamp := now() at time zone 'America/Bogota';
begin
  if v_codigo !~ '^[0-9a-f]{8}$' or char_length(v_nombre) < 3 then
    raise exception 'DATOS_CONSULTA_INVALIDOS';
  end if;
  return query
    select upper(left(r.id::text, 8)), m.nombre, m.zona, r.fecha, r.hora_inicio, r.hora_fin,
           r.num_personas, r.estado,
           (r.estado = 'confirmada' and r.fecha + r.hora_inicio > v_ahora)
    from public.reservas r
    join public.mesas m on m.id = r.mesa_id
    where left(r.id::text, 8) = v_codigo
      and lower(btrim(r.cliente_nombre)) = v_nombre
    limit 1;
end;
$$;

create or replace function public.cancelar_reserva(p_codigo text, p_nombre text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_codigo text := lower(btrim(coalesce(p_codigo, '')));
  v_nombre text := lower(btrim(coalesce(p_nombre, '')));
  v_ahora  timestamp := now() at time zone 'America/Bogota';
  v_id     uuid;
begin
  if v_codigo !~ '^[0-9a-f]{8}$' or char_length(v_nombre) < 3 then
    raise exception 'DATOS_CONSULTA_INVALIDOS';
  end if;
  select r.id into v_id
  from public.reservas r
  where left(r.id::text, 8) = v_codigo
    and lower(btrim(r.cliente_nombre)) = v_nombre
    and r.estado = 'confirmada'
    and r.fecha + r.hora_inicio > v_ahora
  limit 1
  for update;
  if v_id is null then
    raise exception 'RESERVA_NO_CANCELABLE';
  end if;
  update public.reservas set estado = 'cancelada' where id = v_id;
  return 'cancelada';
end;
$$;

revoke all on function public.consultar_reserva(text, text) from public;
grant execute on function public.consultar_reserva(text, text) to anon, authenticated;
revoke all on function public.cancelar_reserva(text, text) from public;
grant execute on function public.cancelar_reserva(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Defensa adicional: el público no puede escribir en ninguna tabla
--    (vuelve a aplicarse por si se crearon tablas o columnas nuevas).
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;
