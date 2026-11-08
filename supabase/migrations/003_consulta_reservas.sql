-- =====================================================================
-- Konys Pizza · Migración 003: consulta y cancelación de reservas por el cliente
--
-- Agrega dos funciones públicas (security definer) para la página «Mi reserva».
-- No crea tablas ni modifica datos existentes. Idempotente.
-- Instrucciones: docs/CAMBIOS_SUPABASE.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Consulta y cancelación de reservas por el cliente
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

