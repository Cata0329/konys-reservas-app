-- =====================================================================
-- Konys Pizza · Datos iniciales (ejecutar DESPUÉS de la migración 001)
--
-- Carga la configuración de partida que aparece en el diseño de Figma:
-- 9 mesas y horarios de martes a domingo (editables desde el panel).
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

-- Lunes sin atención. Martes solo noche. Miércoles a domingo: dos jornadas.
insert into public.horarios (dia_semana, jornada, hora_inicio, hora_fin, duracion_min)
select * from (values
  (2, 'noche',    time '17:00', time '23:00', 60),
  (3, 'almuerzo', time '12:30', time '14:30', 60),
  (3, 'noche',    time '17:00', time '23:00', 60),
  (4, 'almuerzo', time '12:30', time '14:30', 60),
  (4, 'noche',    time '17:00', time '23:00', 60),
  (5, 'almuerzo', time '12:30', time '14:30', 60),
  (5, 'noche',    time '17:00', time '23:00', 60),
  (6, 'almuerzo', time '12:30', time '14:30', 60),
  (6, 'noche',    time '17:00', time '23:00', 60),
  (7, 'almuerzo', time '12:30', time '14:30', 60),
  (7, 'noche',    time '17:00', time '23:00', 60)
) as v(dia_semana, jornada, hora_inicio, hora_fin, duracion_min)
where not exists (select 1 from public.horarios);

-- La carta NO se carga aquí: el catálogo oficial de Konys (categorías y
-- platos verificados en https://soyclubify.com/d/konys) lo carga la
-- migración supabase/migrations/003_catalogo_oficial.sql.
