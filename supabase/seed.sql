-- =====================================================================
-- Konys Pizza · Datos iniciales (ejecutar DESPUÉS de la migración 001)
--
-- Carga la configuración de partida que aparece en el diseño de Figma:
-- 9 mesas, horarios de martes a domingo y una carta de ejemplo.
-- Solo inserta si la tabla está vacía: no duplica ni borra nada.
-- Todo se puede editar después desde el panel de administración.
-- =====================================================================

insert into public.categorias (id, nombre, orden) values
  ('pizzas',   'Pizzas',   1),
  ('entradas', 'Entradas', 2),
  ('postres',  'Postres',  3),
  ('bebidas',  'Bebidas',  4)
on conflict (id) do nothing;

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

-- Carta de ejemplo (precios en COP tomados del diseño).
insert into public.platos (nombre, categoria_id, descripcion, precio, etiqueta, disponible, orden)
select * from (values
  ('Margherita de la casa', 'pizzas',   'Salsa de tomate, mozzarella fresca, albahaca y aceite de oliva.', 34900, 'clasica',      true,  1),
  ('Pepperoni Konys',       'pizzas',   'Pepperoni crocante, mozzarella y un toque de miel picante.',      39900, 'especialidad', true,  2),
  ('Vegetal al horno',      'pizzas',   'Pimentón, champiñones, aceitunas, tomate y albahaca.',           37900, 'vegetariana',  true,  3),
  ('Pollo BBQ',             'pizzas',   'Pollo desmechado, salsa BBQ ahumada, cebolla morada y queso.',   41900, null,           true,  4),
  ('Palitos de ajo y queso','entradas', 'Masa de la casa con mantequilla de ajo y mozzarella gratinada.', 14900, null,           true,  1),
  ('Tiramisú',              'postres',  'Capas de café, mascarpone y cacao.',                             17900, null,           true,  1),
  ('Calzone de arequipe',   'postres',  'Masa horneada rellena de arequipe y azúcar glass.',              19900, null,           false, 2),
  ('Limonada de coco',      'bebidas',  'Limón, crema de coco y hielo frapé.',                             9900, null,           true,  1)
) as v(nombre, categoria_id, descripcion, precio, etiqueta, disponible, orden)
where not exists (select 1 from public.platos);
