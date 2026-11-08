-- =====================================================================
-- Konys Pizza · Datos iniciales (ejecutar DESPUÉS de la migración 001)
--
-- Carga la configuración de partida que aparece en el diseño de Figma:
-- 9 mesas y horarios de lunes a domingo (editables desde el panel).
-- Solo inserta si la tabla está vacía: no duplica ni borra nada.
-- Todo se puede editar después desde el panel de administración.
-- =====================================================================


insert into public.mesas (nombre, zona, capacidad, activa)
select * from (values
  ('Mesa 1', 'salon',   2, true),
  ('Mesa 2', 'salon',   2, true),
  ('Mesa 3', 'salon',   4, true),
  ('Mesa 4', 'salon',   4, true),
  ('Mesa 5', 'salon',   6, true),
  ('Mesa 6', 'terraza', 4, true),
  ('Mesa 7', 'terraza', 4, true),
  ('Mesa 8', 'terraza', 6, true),
  ('Mesa 9', 'terraza', 2, false)
) as v(nombre, zona, capacidad, activa)
where not exists (select 1 from public.mesas);

-- Todos los días: almuerzo 12:30–14:30 y noche 17:00–23:00 (documento del proyecto).
insert into public.horarios (dia_semana, jornada, hora_inicio, hora_fin, duracion_min)
select d, j.jornada, j.inicio, j.fin, 60
from generate_series(1, 7) as d
cross join (values ('almuerzo', time '12:30', time '14:30'),
                   ('noche',    time '17:00', time '23:00')) as j(jornada, inicio, fin)
where not exists (select 1 from public.horarios);

-- La carta NO se carga aquí: el catálogo oficial de Konys (categorías y
-- platos verificados en https://soyclubify.com/d/konys) lo carga la
-- archivo supabase/seed_carta_real.sql (después de la migración 002).
