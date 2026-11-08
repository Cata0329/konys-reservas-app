-- Estado de la tabla platos en Supabase ANTES del catálogo oficial:
-- los 8 platos de ejemplo que cargaba el seed inicial (commit f740f6a).
-- Se usa en las pruebas para comprobar las migraciones 002 y 003 sobre esos datos.
insert into public.categorias (id, nombre, orden) values
  ('pizzas',   'Pizzas',   1),
  ('entradas', 'Entradas', 2),
  ('postres',  'Postres',  3),
  ('bebidas',  'Bebidas',  4)
on conflict (id) do nothing;

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
