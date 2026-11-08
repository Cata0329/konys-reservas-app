-- =====================================================================
-- Konys Pizza · Carta real (seed_carta_real.sql)
-- GENERADO por scripts/generar-sql-catalogo.mjs — no editar a mano.
-- Fuente: https://soyclubify.com/d/konys (consultada 2026-11-07)
-- Productos: 67 · Categorías: 14
--
-- Requiere la migración 002_carta_real.sql. Es idempotente: al ejecutarla de nuevo
-- actualiza los productos oficiales sin duplicarlos (clave id_externo) y
-- NO cambia la disponibilidad que el administrador haya definido.
-- =====================================================================

begin;

-- 1. Categorías oficiales (se conservan los ids existentes).
insert into public.categorias (id, nombre, orden, subtitulo, disponible_desde, disponible_hasta) values
  ('entradas', 'Entradas', 1, null, null, null),
  ('menu_infantil', 'Menú Infantil', 2, null, null, null),
  ('pizzas', 'Pizzas', 3, 'Todas nuestros konys traen PAPITAS AL HORNO', null, null),
  ('desgranados', 'Desgranados', 4, null, null, null),
  ('papas_ikonicas', 'Papas Ikónicas', 5, null, null, null),
  ('lasana', 'Lasaña', 6, null, null, null),
  ('granizados', 'Granizados', 7, null, null, null),
  ('sodas', 'Sodas', 8, 'Mocktails -bebidas sin alcohol', null, null),
  ('bebidas', 'Bebidas Frías', 9, null, null, null),
  ('cerveza', 'Cerveza', 10, null, null, null),
  ('cocteles', 'Cocteles', 11, null, null, null),
  ('postres', 'Postres', 12, null, null, null),
  ('menu_almuerzos', 'Menú Almuerzos', 13, 'disponible solo de 12 a 2:30 pm', '12:00', '14:30'),
  ('congelados', 'Congelados', 14, null, null, null)
on conflict (id) do update set
  nombre = excluded.nombre, orden = excluded.orden, subtitulo = excluded.subtitulo,
  disponible_desde = excluded.disponible_desde, disponible_hasta = excluded.disponible_hasta;

-- 2. Platos de ejemplo del seed que no existen en el menú oficial:
--    se conservan (respaldados en respaldo.platos_antes_catalogo) pero se
--    ocultan al público y se marcan como datos de prueba.
update public.platos
set origen = 'prueba', disponible = false
where id_externo is null
  and nombre in ('Margherita de la casa', 'Pepperoni Konys', 'Vegetal al horno', 'Pollo BBQ', 'Palitos de ajo y queso', 'Tiramisú', 'Calzone de arequipe');

-- 3. "Limonada de coco" del seed SÍ existe en el menú oficial (Granizados):
--    se vincula a su id oficial para corregirla en el paso 4 en lugar de duplicarla.
update public.platos
set id_externo = 'acc8ccae-22c5-42c2-ba79-3c1fefec3824'
where id_externo is null
  and lower(nombre) = 'limonada de coco'
  and not exists (select 1 from public.platos where id_externo = 'acc8ccae-22c5-42c2-ba79-3c1fefec3824');

-- 4. Productos oficiales (insertar o actualizar).
insert into public.platos
  (id_externo, nombre, categoria_id, subcategoria, descripcion, precio, imagen_url, recomendado, etiquetas, variantes, orden)
values
  ('542f33c8-ba5e-4a26-9eed-05fc3150c8d9', 'Entrada mini Konitos', 'entradas', null, 'Cinco (5) mini Konys,
rellenos de queso
gratinado fundido, napolitana y 1 sabor a elegir.
- HAWAIANOS
- PEPERONI
- SOLO QUESO', 15000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/ca8eaf3240ff77c294ac.webp', true, '{}'::text[], '[]'::jsonb, 1),
  ('de49fa26-1461-4e23-87ae-48cf2df205ee', 'NACHOS ENCHULADOS', 'entradas', null, 'Nachos crocantes , con queso rayado , tártara de la casa y piña caramelizada, la opción perfecta para compartir y picar una explosión de sabores.', 13000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/5f391c77d5ee97d17510.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('eca6087d-828f-4010-bcb1-e8493592aadf', 'Salchi pulpitos', 'menu_infantil', null, 'Mini salchichas con
papitas doradas, acompanadas
de nuestras salsas , un
juguito Hit y galletas Chips para
un toque dulce.', 22000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/682eba4659dc1091fb65.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('c15786a5-84b5-4286-8593-2b48822b31ca', 'Chicki chicken', 'menu_infantil', null, 'Cuatro (4) nuggets de pollo dorados
acompanados de papas a la francesa,
salsa especial y un juguito Hit con
galletas Chips para completar la', 23000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/bd95cb89d4dc1ba05b84.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('cea9cde3-c837-44c6-9bc9-971af3cf7534', 'BUKARA⭐💚(GANADORA PIZZA MASTER)', 'pizzas', 'Konys de autor', 'GANADORA PIZZA MASTER 2023
Un homenaje a la ciudad Bonita, con trozos de jugosa carne de hamburguesa mermelada de tocineta ahumada en reducción de miel y panela, sobre nuestra exquisita salsa napolitana.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/0e187fecd98121e6931e.webp', true, array['PIZZA MASTER 2023']::text[], '[]'::jsonb, 1),
  ('b0fbb80c-610d-40b4-81ef-f4793fcc6d91', 'KONYS DULCINEA (CONOPIZZA DE TEMPORADA)', 'pizzas', 'Konys de autor', 'Pollo al horno marinado, jugoso y lleno de sabor, combinado con mozzarella argentino y nuestro Cremoso de Tocineta Ahumada Caramelizada con base de queso crema Kraft, una mezcla intensa, dulce y salada que se derrite en cada mordida.
Todo coronado con un nacho en salsa de la casa y lluvia de parmesano.
Acompañado de papitas fritas al horno.
Una experiencia que redefine lo que creías que era una pizza.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/b77773e5c0856de86671.webp', true, array['GANADORAMETROPOLITANPIZZATOUR']::text[], '[]'::jsonb, 2),
  ('13c047fd-c4bc-4f6e-8fd7-7189ceccd4ce', 'Colombianísima', 'pizzas', 'Konys de autor', 'PARTICIPANTE PIZZA MASTER 2022
Jugosa carne desmechada, dulces maduritos fritos y maicitos frescos, coronados con un trozo de arepa de maíz.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/7831a2578cfd3ad74f05.webp', false, '{}'::text[], '[]'::jsonb, 3),
  ('4872c9a0-c375-4f19-b060-764da5da197f', 'LASAGNA', 'pizzas', 'Konys de autor', 'Carne molida sazonada, tocineta ahumada, y queso parmesano gratinado en una cremosa salsa blanca y napolitana.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/64627bd65e3655b7fc74.webp', false, '{}'::text[], '[]'::jsonb, 4),
  ('1debf68d-2aa9-4592-9e3c-eee0ddfbbdfe', 'IKÓNICA', 'pizzas', 'Konys de autor', 'Trozos de nuggets de pollo, jamón ahumado y queso cheddar para una combinación de texturas y sabores únicos.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/6ec17787905e8de28bf4.webp', false, '{}'::text[], '[]'::jsonb, 5),
  ('bfab7e98-c3ff-4fc2-8fdf-0d74d358b316', 'CARBONARA', 'pizzas', 'Konys de autor', 'Tocineta Ahumada, jamón ahumado, maíz dulce y queso parmesano sobre una cremosa salsa blanca.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/1034eba8a955553ccc6c.webp', false, '{}'::text[], '[]'::jsonb, 6),
  ('dc08e22e-3df7-4efd-815e-0662d0940c3a', 'HAWAIANA', 'pizzas', 'Konys clásicas', 'La combinación perfecta de tocineta y jamón ahumados, piña OroMiel para un equilibrio de dulce y salado.', 27900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/86dbbbd3c4bf90779098.webp', false, '{}'::text[], '[]'::jsonb, 7),
  ('ac112ede-76a2-4a4f-b593-c61b1468e7ab', 'MEXICANA', 'pizzas', 'Konys clásicas', 'Deliciosa carne molida sazonada, maíz tierno, pimentón y cebolla caramelizada, coronada con crujientes nachos con un toque de picante Tex-Mex.', 27900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/843459c525c80ac87554.webp', false, '{}'::text[], '[]'::jsonb, 8),
  ('c06292c1-9f61-4ad6-a110-1699a9bf3bcd', 'CHICKEN', 'pizzas', 'Konys clásicas', 'Trozos de pollo horneado y maíz tierno que resaltan el sabor de nuestra clásica salsa napolitana.', 27900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/33553819860f86652eff.webp', false, '{}'::text[], '[]'::jsonb, 9),
  ('d8a95da1-59a4-4a4a-b888-e9f858d20b1b', 'VEGGIE', 'pizzas', 'Konys clásicas', 'Champiñones frescos, maíz tierno, cebolla caramelizada y queso parmesano, creando una opción llena de sabor y textura.', 27900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/d05101df78cc495c4ea6.webp', false, '{}'::text[], '[]'::jsonb, 10),
  ('eeea7045-9249-4d1c-b016-87b28ab99419', 'BBQ', 'pizzas', 'Konys clásicas', 'Pollo en salsa BBQ con un toque ranchero y cebolla caramelizada que potencia su dulzura natural.', 27900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/4e8535ded16ca440a96c.webp', false, '{}'::text[], '[]'::jsonb, 11),
  ('9a886ee0-efbb-4ab7-9414-dbd2312dbabd', 'TERIYORK', 'pizzas', 'Konys clásicas', 'Pollo jugoso, carne molida sazonada, cebolla caramelizada y pimentón fresco para una explosión de sabor.', 27900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/3f8569f648315c96e6d9.webp', false, '{}'::text[], '[]'::jsonb, 12),
  ('82901a9c-5127-4d30-a64a-0ac82888a80e', 'ESPECIAL', 'pizzas', 'Konys icónicas', 'Mezcla irresistible de pollo jugoso marinado, tocineta ahumada y champiñones frescos en nuestra salsa napolitana.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/41e9d791e87353005f7f.webp', false, '{}'::text[], '[]'::jsonb, 13),
  ('3efb7653-96e8-4e5b-aa12-a8ca744641d0', 'CARNES- Autentica PEPPERONI', 'pizzas', 'Konys icónicas', 'Pepperoni picante, cábano y jamón ahumado, una combinación perfecta para los amantes de la proteína.', 29900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/8e8f58968ee96bcfa28d.webp', false, '{}'::text[], '[]'::jsonb, 14),
  ('9a14afd5-bcf3-475b-8c92-be8b357295f8', 'MAR & TIERRA', 'pizzas', 'Konys icónicas', 'Exquisita mezcla de camarones jugosos, pollo marinado, pimentón fresco y maíz tierno.', 30900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/9667c2bc02e094478267.webp', false, '{}'::text[], '[]'::jsonb, 15),
  ('f6b4205d-b979-4f6e-ae21-973bdb026e28', 'MARINERA', 'pizzas', 'Konys icónicas', 'Camarón fresco, pulpo tierno y palmito en nuestra exclusiva salsa especial de la casa.', 30900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/757c090f4d6b0d8b0151.webp', false, '{}'::text[], '[]'::jsonb, 16),
  ('c1165d0c-b475-47c8-be3c-1ec34b70c50b', 'ITALIANISIMA', 'pizzas', 'Konys icónicas', 'amón serrano madurado, tomates asados
y un toque de salsa pesto, coronada con
con un toque final de queso parmesano.', 31900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/61e7260b77dfdcade456.webp', false, '{}'::text[], '[]'::jsonb, 17),
  ('8acdf0a6-4b62-43a8-9961-aba6881ef8c5', 'BONDIOLA', 'pizzas', 'Konys icónicas', 'Corte premium de bondiola de cerdo ahumada, combinada con champiñones frescos y queso parmesano, sobre nuestra inigualable salsa napolitana.', 31900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/7566073b5a0503f3801d.webp', false, '{}'::text[], '[]'::jsonb, 18),
  ('b80d9ff8-0cdc-47c7-9149-43433959a992', 'COMBO AMIGOS X4', 'pizzas', 'Combos icónicos', '- Cuatro (4) Konys Pizza de sabores seleccionados (Solo sabores CLASICOS DE $27.900 )
- Papas fritas al horno (400gr)
- Cuatro granizadas en dos sabores tradicionales', 142000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/1ffb28414160f09c1de7.webp', false, '{}'::text[], '[]'::jsonb, 19),
  ('8d3e3bc1-fe47-4467-b663-d8e90ae9b83f', 'COMBO PARCHE X6', 'pizzas', 'Combos icónicos', '- Seis (6) Konys Pizza de
sabores seleccionados Solo sabores CLASICOS DE $27.900 
- Papas fritas al horno (600 gr)
- Seis granizadas en tres sabores tradicionales', 210000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/8bf184586567521c033d.webp', false, '{}'::text[], '[]'::jsonb, 20),
  ('4a156e1b-81d3-4600-bf70-5749619a18f6', 'DESGRANADO DE CARNE', 'desgranados', null, 'Desgranado al horno servido en Kono en masa crocante, relleno de mazorca bogotana, salteado con carne desmechada, chorizo santarosano, salsita Konys y queso mozzarella, acompañado de una porción de papas fritas al horno', 38500, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/f37c99e6c75c435000ea.webp', true, '{}'::text[], '[]'::jsonb, 1),
  ('96f19c38-aada-429d-856f-6407c6f236ef', 'DESGRANADO POLLO', 'desgranados', null, 'Desgranado al horno servido en Kono en masa crocante, relleno de mazorca bogotana, salteado con pollo en cuadritos, tocineta ahumada, salsita Konys y queso mozzarella, acompañado de una porción de papas fritas al horno.', 37500, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/85782ca2b645d53b9c00.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('a1058af1-84a5-41c0-b549-fb734d871543', 'PAPAS LOCAS - Fries ikonicas', 'papas_ikonicas', null, 'UNICAS PAPAS LOCAS FRITAS SIN ACEITE DE LA CIUDAD.
 Papa francesa al horno, cubiertas con chorizo
santarosano, salchicha llanera, trozos de carne
de hamburguesa, lechuga fresca, maicitos,
salsa tártara, salsa de pina y queso RAYADO.
¡Una explosión de sabor en cada bocado!', 39000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/cf39cabbad09f02445c6.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('17b55b52-a35b-4aa9-94fd-f8e68a472a0e', 'Chicken fries mini', 'papas_ikonicas', 'Antojitos mini', 'Papas fritas al horno sin aceite, nuggets de pollo (echos en konys) bañadas en queso mozarrella derretido y salsas de la casa (tartara y pina)', 22000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/5c8dec6233d88201f3c3.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('4c8cc0ee-7d9d-49e8-8354-02c81eb24ff6', 'Chorifries Mini', 'papas_ikonicas', 'Antojitos mini', 'Papas fritas al horno sin aceite, chorizo de cerdo artesanal, quesito costeño y salsas de la casa (tartara y piña)', 22000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/671bb8b8936e29962e1a.webp', false, '{}'::text[], '[]'::jsonb, 3),
  ('4aa32597-ce67-46c7-89d1-3fbc3fd78cf2', 'Salchifries Mini', 'papas_ikonicas', 'Antojitos mini', 'Papas fritas al horno sin aceite, salchichas horneadas, quesito costeño, y salsas de la casa (tartara y piña)', 22000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/7ed82e0b633e0e686e24.webp', false, '{}'::text[], '[]'::jsonb, 4),
  ('a3c9a52b-dc1d-4962-8fa6-6bfc84d4e94b', 'PORCION DE PAPAS', 'papas_ikonicas', 'Antojitos mini', 'Porcion de 200 gramos de Papitas fritas sin aceite.', 7900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/08491888a97f911aa951.webp', false, '{}'::text[], '[]'::jsonb, 5),
  ('ffba5994-f5e3-4304-b685-45e397467e48', 'LASAÑA (Sabor del día)', 'lasana', null, 'Acompañada de deliciosas papas fritas sin aceite + Salsa de la casa', 31800, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/25717ce25c91bdd00a7f.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('a9cc8cd6-dcbc-48dc-b155-8c5a01b29bf9', 'Limón', 'granizados', null, null, 9900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/c1e7fdb543012310845c.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('e022d3a3-0847-4959-ae98-03e0d8afe1bf', 'Naranja', 'granizados', null, null, 9900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/ca16552986ef31cfc06e.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('abb7dc38-220a-47bd-8f0f-5e10c1d1b655', 'Mandarina', 'granizados', null, null, 9900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/63a5e4b2c7bf6bdb5af2.webp', false, '{}'::text[], '[]'::jsonb, 3),
  ('cd900990-49b5-4151-9d90-7b4c956bbb9e', 'YerbaBuena', 'granizados', null, null, 9900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/f997c725df7045d6a278.webp', false, '{}'::text[], '[]'::jsonb, 4),
  ('3125d196-1461-431d-9589-0b5c16e7d453', 'MaracuMango', 'granizados', null, null, 9900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/25408355322b8937086a.webp', true, '{}'::text[], '[]'::jsonb, 5),
  ('437ae033-1ddb-4d05-bedb-759b173332a7', 'Cerezada', 'granizados', null, null, 12990, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/e94467c9922ea4f82c4b.webp', false, '{}'::text[], '[]'::jsonb, 6),
  ('303ca998-85ab-4c4c-b1ea-caa17b362dcf', 'Piña Colada', 'granizados', null, null, 12990, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/7a465641461be8b18331.webp', false, '{}'::text[], '[]'::jsonb, 7),
  ('acc8ccae-22c5-42c2-ba79-3c1fefec3824', 'Limonada de Coco', 'granizados', null, null, 12990, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/3abe69507b473960d1a5.webp', false, '{}'::text[], '[]'::jsonb, 8),
  ('774214e4-d7ac-4415-a5e0-f1c10ebfacca', 'SODA LULO FIZZ', 'sodas', null, 'Mermelada de Lulo, limón, soda, perlas explosivas de maracuyá y ginger ale macerados. Una bebida refrescante y deliciosa para acompañar tu experiencia ikonica.', 12900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/4e292ca476f7b3365f81.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('0d5c856e-b81e-4338-9e04-f2b26e27ea37', 'SODA ARANDANOS', 'sodas', null, 'Sirope natural de Arandanos, arandanos frescos, limón, soda, perlas explosivas de cereza. Una bebida refrescante y deliciosa para acompañar tu experiencia ikonica.', 12900, null, false, '{}'::text[], '[]'::jsonb, 2),
  ('3ead6925-f168-4b8a-93f9-a6c10bca12cb', 'SODA FRUTOS ROJOS', 'sodas', null, 'Sirope natural de frutos rojos, fresa picada, limón, soda, y perlas explosivas de cereza. Una bebida refrescante y deliciosa para acompañar tu experiencia ikonica.', 12900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/d59fb2dd0ce91aca3319.webp', true, '{}'::text[], '[]'::jsonb, 3),
  ('85d83346-4aa9-4195-8068-3e0d5c638076', 'SODA MARACUYÁ', 'sodas', null, 'Sirope natural de maracuyá, limón, soda, perlas explosivas de maracuyá. Una bebida refrescante y deliciosa para acompañar tu experiencia ikonica.', 12900, null, false, '{}'::text[], '[]'::jsonb, 4),
  ('98a8f26e-9250-47dc-ad75-2b4148605d68', 'Limonada de Panela', 'bebidas', null, 'Deliciosa limonada de panela natural , una bebida Refrescante y perfecta.', 7000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/5f59a9856fd1c73fec34.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('7d424d3a-c3f5-45e9-bddc-7ef1db3b7083', 'Postobon 400ml', 'bebidas', null, null, 6000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/85dd03743c6db53cee73.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('c0261e8e-473a-4bdf-8c39-d11357d6b7b6', 'Coca-Cola 400ml (pidela original o ZERO )', 'bebidas', null, null, 6000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/ceb6db1e1752c179066a.webp', false, '{}'::text[], '[{"grupo":"Tamaño","nombre":"COCACOLA ZERO","delta":0}]'::jsonb, 3),
  ('bb023fc9-1fe0-47d7-9fd3-dc16285bc916', 'Jugo Hit 500ml', 'bebidas', null, null, 6000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/4f484cb87b03385e0d4c.webp', false, '{}'::text[], '[]'::jsonb, 4),
  ('2791da60-7afa-43ae-b3ef-76467709d8b6', 'Soda', 'bebidas', null, null, 6000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/cfd2965ffcda200e998d.webp', false, '{}'::text[], '[]'::jsonb, 5),
  ('41b6b11f-482c-4738-9b55-90f5e4a89051', 'Agua (con Gas / sin Gas)', 'bebidas', null, null, 6000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/78e3ac8529cf0d17f357.webp', false, '{}'::text[], '[]'::jsonb, 6),
  ('13b52476-046d-4ff0-a606-1a823fab46e4', 'Club Colombia Dorada', 'cerveza', null, null, 7000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/37c9a86629bf82400b4a.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('253cbb32-6ae5-4482-a5f0-112ea7f03120', 'Corona 330ml', 'cerveza', null, null, 9000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/e52e0be0d10137fc457d.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('eb82c608-16e5-4d90-bdbc-f8ba4d4b6db1', '3 Cordilleras Rosada', 'cerveza', null, null, 9000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/f43650066d635cd6e965.webp', false, '{}'::text[], '[]'::jsonb, 3),
  ('32eb548a-4fcc-4c7c-887c-3f575b794174', 'Stella Artois', 'cerveza', null, null, 9000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/4884fae151ad95d925d0.webp', false, '{}'::text[], '[]'::jsonb, 4),
  ('04b538e1-4819-4ada-ac70-ca551eb4b483', 'Piña colada', 'cocteles', 'Cocteles cremosos', 'Cremoso cóctel a base de piña, helado de coco ,coco ,ron Havana', 35000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/4797a89e7556fec6a913.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('4e323c08-6cb8-45dc-a714-f4408669e7b5', 'MARACUMIX', 'cocteles', 'Cocteles cremosos', 'Cremosa PULPA MARACUMANGO, acompañado de lechera, zumo Limón, ron Havana, rodeado de borde de Tajín.', 35000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/199a92e8e3cee47986e6.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('6e284445-a47b-41fd-8531-367fe1ec7057', 'Daiquiri de fresa', 'cocteles', 'Cocteles cremosos', 'Cremosa mezcla con Fresa natural y frutos rojos ,zumo de limón, base cremosa , ron Havana.', 35000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/934b7c97b2d636bb811c.webp', false, '{}'::text[], '[]'::jsonb, 3),
  ('002d003d-7b3e-4856-8293-cfc5959510da', 'PALOMA', 'cocteles', 'Cocteles clasicos', 'cóctel refrescante a base de tequila olmeca, zumo de limón, soda ginger , michelada con sal y Tajín para potenciar sabores.', 38000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/20876905101c32258666.webp', false, '{}'::text[], '[]'::jsonb, 4),
  ('a1d9648f-293a-410b-b647-5ee952d7c782', 'MARGARITA LIMÓN', 'cocteles', 'Cocteles clasicos', 'Tequila
Olmeca Reposado syrup simple,
zumo de limón , michelada
con sal y tajin.', 38000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/cbef87336c7cd7e68e84.webp', false, '{}'::text[], '[]'::jsonb, 5),
  ('10789401-db29-4824-9a59-7faa8fc45249', 'IKONIC MOJITO', 'cocteles', 'Cocteles clasicos', 'Todo un clásico, Ron havana 3 años, zumo de limón, hierbabuena fresca, top de soda', 35000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/c210359d1f840d3bee27.webp', false, '{}'::text[], '[]'::jsonb, 6),
  ('28d21f84-4569-4f18-9c5e-b1aa2f2b1b40', 'COPA HELADO CLÁSICA', 'postres', null, 'helado de sabor cookie and cream ,acompañado de fresa , con topping de lechera , salsa chocolate y maní', 4900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/fbf9bc9f68e8f4a66062.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('0eb7c112-41a9-4f80-9f1e-a6068b693ada', 'COPA HELADO IKONICA', 'postres', null, 'doble bolita de helado de sabor cookie and cream ,acompañado de fresa , con topping de lechera , salsa chocolate y maní', 7900, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/eb77140881c11a7992ad.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('33faa1db-c81c-4d54-8523-d2fa286cd92c', 'LASAÑA DE CARNE', 'menu_almuerzos', null, 'Carne molida, napolitana, queso mozzarella argentino, bechamel, parmesano y pasta', 22990, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/51b31b5e0c66acf55ced.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('d4a7efc3-0822-4037-8e41-d1e952383336', 'LASAÑA MIXTA', 'menu_almuerzos', null, 'Carne, pollo horneado marinado, queso mozzarella argentino, parmesano, salsa bechamel y pasta', 22990, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/09f84bd50949b696f41d.webp', false, '{}'::text[], '[]'::jsonb, 2),
  ('25a6554a-4d97-4437-b642-492955e83bb2', 'LASAÑA DE MADURO', 'menu_almuerzos', null, 'Carne, queso mozzarella argentino, béchamel, parmesano y capas de delicioso maduro asado
(Solo disponible días en especial o por encargos)', 23990, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/e1097a0c86074587f342.webp', false, '{}'::text[], '[]'::jsonb, 3),
  ('900a1411-344e-4007-8584-12ab85ee0feb', 'LASAÑA PRELISTA', 'congelados', null, 'Deliciosa lasaña prelista para hornear 15 minutos, se entrega en recipiente y refrigerada o congelada según como las desee el cliente 
“puedes guardarla en el congelador y prepararla cuando quieras”', 18000, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/fe135cb16f2fbe5d3642.webp', false, '{}'::text[], '[]'::jsonb, 1),
  ('1d717c49-95d5-4c88-b3e4-c7ae8b5dab3f', 'CONO CONGELADO', 'congelados', null, 'Pide los conos rellenos según el sabor que desees y te los vendemos empacados al vacío (congelados o refrigerados) para que puedas hornearlos en casa todas las veces que desees , se vende a partir de 6 unidades.', null, 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/dad880e99038bd9d2453.webp', false, '{}'::text[], '[]'::jsonb, 2)
on conflict (id_externo) do update set
  nombre = excluded.nombre, categoria_id = excluded.categoria_id, subcategoria = excluded.subcategoria,
  descripcion = excluded.descripcion, precio = excluded.precio, imagen_url = excluded.imagen_url,
  recomendado = excluded.recomendado, etiquetas = excluded.etiquetas, variantes = excluded.variantes,
  orden = excluded.orden, etiqueta = null, origen = 'oficial';

update public.platos set origen = 'oficial' where id_externo is not null and origen <> 'oficial';

commit;
