-- =====================================================================
-- Konys Pizza · Migración 004: horarios de atención reales
--
-- El documento del proyecto indica dos jornadas: 12:30 p. m. – 2:30 p. m. y
-- 5:00 p. m. – 11:00 p. m. El seed inicial había cerrado los lunes y dejado el
-- martes solo de noche (venía del diseño de Figma, no del restaurante).
-- Decisión del equipo (7 nov 2026): todos los días con las dos jornadas.
-- El administrador puede desactivar días o jornadas después desde el panel.
--
-- Idempotente: crea las jornadas que falten y ajusta las existentes.
-- No toca reservas. Instrucciones: docs/CAMBIOS_SUPABASE.md
-- =====================================================================

insert into public.horarios (dia_semana, jornada, hora_inicio, hora_fin, duracion_min, activo)
select d, j.jornada, j.inicio, j.fin, 60, true
from generate_series(1, 7) as d
cross join (values ('almuerzo', time '12:30', time '14:30'),
                   ('noche',    time '17:00', time '23:00')) as j(jornada, inicio, fin)
on conflict (dia_semana, jornada) do update
  set hora_inicio = excluded.hora_inicio,
      hora_fin    = excluded.hora_fin,
      activo      = true;
