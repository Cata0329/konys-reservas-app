-- =====================================================================
-- Konys Pizza · Migración 002: estructura para la carta real
--
-- Prepara las tablas para el catálogo oficial de Konys (los datos se cargan
-- después con supabase/seed_carta_real.sql). Antes de cambiar nada respalda
-- platos y categorías en el esquema "respaldo" (no expuesto por la API).
--
-- Es idempotente: se puede ejecutar varias veces sin duplicar ni borrar datos.
-- Instrucciones para ejecutarla y revertirla: docs/CAMBIOS_SUPABASE.md
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
-- 3. Defensa adicional: el público no puede escribir en ninguna tabla
--    (vuelve a aplicarse por si se crearon tablas o columnas nuevas).
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;
