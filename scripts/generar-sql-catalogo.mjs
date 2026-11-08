// Genera supabase/seed_carta_real.sql a partir de
// docs/menu-oficial-konys.json (extraído con scripts/extraer-menu-konys.mjs).
//
// Reglas aplicadas (ver docs/CATALOGO_KONYS.md):
//  - Nombre, descripción, precio, etiquetas, variantes e imagen se copian tal cual.
//  - "Recomendados" no es una categoría: se marca platos.recomendado = true.
//  - Las subsecciones (p. ej. "KONYS CLÁSICAS") van en platos.subcategoria.
//  - Precio 0 en la fuente = precio no publicado → NULL ("precio por confirmar").
//  - Una imagen que la fuente usa en varios productos no se asigna a ninguno.
//  - Los platos de ejemplo del seed se ocultan y se marcan como 'prueba'.
import { readFile, writeFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const menu = JSON.parse(await readFile(new URL('docs/menu-oficial-konys.json', raiz), 'utf8'));

// Sección oficial → id de categoría (se conservan los ids existentes: entradas, pizzas, postres, bebidas).
const CATEGORIAS = {
  'Entradas': { id: 'entradas' },
  'Menú Infantil': { id: 'menu_infantil' },
  'Pizzas': { id: 'pizzas' },
  'Desgranados': { id: 'desgranados' },
  'Papas Ikónicas': { id: 'papas_ikonicas' },
  'Lasaña': { id: 'lasana' },
  'Granizados': { id: 'granizados' },
  'Sodas': { id: 'sodas' },
  'Bebidas Frías': { id: 'bebidas' },
  'Cerveza': { id: 'cerveza' },
  'Cocteles': { id: 'cocteles' },
  'Postres': { id: 'postres' },
  'Menú Almuerzos': { id: 'menu_almuerzos', desde: '12:00', hasta: '14:30' },
  'Congelados': { id: 'congelados' },
};
// Platos del seed inicial que NO están en el menú oficial.
const PLATOS_DE_PRUEBA = ['Margherita de la casa', 'Pepperoni Konys', 'Vegetal al horno', 'Pollo BBQ',
  'Palitos de ajo y queso', 'Tiramisú', 'Calzone de arequipe'];

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

const recomendados = new Set(menu.secciones.find((s) => s.nombre === 'Recomendados')?.productos.map((p) => p.id_clubify));
const productos = [];
const vistos = new Set();
menu.secciones.forEach((s) => {
  if (s.nombre === 'Recomendados') return;
  const cat = CATEGORIAS[s.nombre];
  if (!cat) throw new Error(`Sección sin categoría asignada: ${s.nombre}`);
  const agregar = (lista, sub) => lista.forEach((p) => {
    if (vistos.has(p.id_clubify)) return;
    vistos.add(p.id_clubify);
    productos.push({ ...p, categoria: cat.id, subcategoria: sub, orden: productos.filter((x) => x.categoria === cat.id).length + 1 });
  });
  agregar(s.productos, null);
  s.subsecciones.forEach((sub) => agregar(sub.productos, capitalizar(sub.nombre)));
});

// Imágenes que la fuente comparte entre productos distintos: no son verificables por producto.
const usosImagen = {};
productos.forEach((p) => { if (p.imagen) usosImagen[p.imagen] = (usosImagen[p.imagen] ?? 0) + 1; });

const filas = productos.map((p) => {
  const imagen = p.imagen && usosImagen[p.imagen] === 1 ? p.imagen : null;
  const precio = p.precio > 0 ? p.precio : null;
  const variantes = JSON.stringify(p.variantes);
  return `  (${q(p.id_clubify)}, ${q(p.nombre)}, ${q(p.categoria)}, ${q(p.subcategoria)}, ${q(p.descripcion)}, ${precio ?? 'null'}, ${q(imagen)}, ${recomendados.has(p.id_clubify)}, ${arr(p.etiquetas)}, ${q(variantes)}::jsonb, ${p.orden})`;
});

const categoriasSql = Object.entries(CATEGORIAS).map(([nombre, c], i) => {
  const sec = menu.secciones.find((s) => s.nombre === nombre);
  return `  (${q(c.id)}, ${q(nombre)}, ${i + 1}, ${q(sec?.subtitulo ?? null)}, ${c.desde ? q(c.desde) : 'null'}, ${c.hasta ? q(c.hasta) : 'null'})`;
});

const sql = `-- =====================================================================
-- Konys Pizza · Carta real (seed_carta_real.sql)
-- GENERADO por scripts/generar-sql-catalogo.mjs — no editar a mano.
-- Fuente: ${menu.fuente} (consultada ${menu.consultado.slice(0, 10)})
-- Productos: ${productos.length} · Categorías: ${categoriasSql.length}
--
-- Requiere la migración 002_carta_real.sql. Es idempotente: al ejecutarla de nuevo
-- actualiza los productos oficiales sin duplicarlos (clave id_externo) y
-- NO cambia la disponibilidad que el administrador haya definido.
-- =====================================================================

begin;

-- 1. Categorías oficiales (se conservan los ids existentes).
insert into public.categorias (id, nombre, orden, subtitulo, disponible_desde, disponible_hasta) values
${categoriasSql.join(',\n')}
on conflict (id) do update set
  nombre = excluded.nombre, orden = excluded.orden, subtitulo = excluded.subtitulo,
  disponible_desde = excluded.disponible_desde, disponible_hasta = excluded.disponible_hasta;

-- 2. Platos de ejemplo del seed que no existen en el menú oficial:
--    se conservan (respaldados en respaldo.platos_antes_catalogo) pero se
--    ocultan al público y se marcan como datos de prueba.
update public.platos
set origen = 'prueba', disponible = false
where id_externo is null
  and nombre in (${PLATOS_DE_PRUEBA.map(q).join(', ')});

-- 3. "Limonada de coco" del seed SÍ existe en el menú oficial (Granizados):
--    se vincula a su id oficial para corregirla en el paso 4 en lugar de duplicarla.
update public.platos
set id_externo = ${q(productos.find((p) => p.nombre === 'Limonada de Coco')?.id_clubify)}
where id_externo is null
  and lower(nombre) = 'limonada de coco'
  and not exists (select 1 from public.platos where id_externo = ${q(productos.find((p) => p.nombre === 'Limonada de Coco')?.id_clubify)});

-- 4. Productos oficiales (insertar o actualizar).
insert into public.platos
  (id_externo, nombre, categoria_id, subcategoria, descripcion, precio, imagen_url, recomendado, etiquetas, variantes, orden)
values
${filas.join(',\n')}
on conflict (id_externo) do update set
  nombre = excluded.nombre, categoria_id = excluded.categoria_id, subcategoria = excluded.subcategoria,
  descripcion = excluded.descripcion, precio = excluded.precio, imagen_url = excluded.imagen_url,
  recomendado = excluded.recomendado, etiquetas = excluded.etiquetas, variantes = excluded.variantes,
  orden = excluded.orden, etiqueta = null, origen = 'oficial';

update public.platos set origen = 'oficial' where id_externo is not null and origen <> 'oficial';

commit;
`;

await writeFile(new URL('supabase/seed_carta_real.sql', raiz), sql, 'utf8');
const sinImagen = productos.filter((p) => !(p.imagen && usosImagen[p.imagen] === 1)).map((p) => p.nombre);

// ---------------------------------------------------------------------
// docs/CATALOGO_KONYS.md (mismo origen de datos que el SQL)
// ---------------------------------------------------------------------
const celda = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const precioMd = (p) => (p.precio > 0 ? `$${p.precio.toLocaleString('es-CO').replace(/,/g, '.')}` : 'Por confirmar (la fuente publica $0)');
const nombresCategoria = Object.fromEntries(Object.entries(CATEGORIAS).map(([n, c]) => [c.id, n]));
const tablaCategorias = Object.entries(CATEGORIAS).map(([nombre, c], i) => {
  const sec = menu.secciones.find((s) => s.nombre === nombre);
  const n = productos.filter((p) => p.categoria === c.id).length;
  const franja = c.desde ? `${c.desde}–${c.hasta}` : '—';
  return `| ${i + 1} | ${nombre} | \`${c.id}\` | ${n} | ${celda(sec?.subtitulo) || '—'} | ${franja} |`;
});
const tablaProductos = productos.map((p, i) => {
  const imagen = p.imagen && usosImagen[p.imagen] === 1 ? `[foto](${p.imagen})` : 'Sin foto individual (compartida en la fuente)';
  const extras = [
    recomendados.has(p.id_clubify) ? 'Recomendado' : '',
    p.etiquetas.length ? `Etiquetas: ${p.etiquetas.join(', ')}` : '',
    p.variantes.length ? `Variantes: ${p.variantes.map((v) => `${v.grupo}: ${v.nombre} (+$${v.delta})`).join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  return `| ${i + 1} | ${celda(p.nombre)} | ${nombresCategoria[p.categoria]}${p.subcategoria ? ` › ${p.subcategoria}` : ''} | ${precioMd(p)} | ${celda(p.descripcion) || '_(la fuente no publica descripción)_'} | ${imagen} | ${celda(extras) || '—'} | \`${p.id_clubify}\` |`;
});

const doc = `# Catálogo oficial de Konys Pizza

> **Archivo generado** por \`scripts/generar-sql-catalogo.mjs\` a partir de \`docs/menu-oficial-konys.json\`.
> Para actualizarlo: \`npm run menu:extraer\` → \`npm run menu:sql\` → ejecutar \`supabase/seed_carta_real.sql\` en Supabase.

- **Fuente de verificación:** ${menu.fuente} (menú de pedidos oficial de Konys en Clubify).
- **Fecha de consulta:** ${menu.consultado.slice(0, 10)}.
- **Método:** los datos se leyeron del JSON estructurado que la propia página entrega al navegador
  (secciones, productos, precios, variantes, etiquetas e imágenes), sin transcripción manual.
- **Totales:** ${productos.length} productos únicos · ${tablaCategorias.length} categorías · ${productos.length - sinImagen.length} con foto oficial individual.

## Decisiones de modelado

| Situación en la fuente | Cómo se guarda | Motivo |
|---|---|---|
| Sección «Recomendados» repite productos de otras secciones | \`platos.recomendado = true\` (no es categoría) | Evitar duplicados; la carta pública la muestra como primera pestaña. |
| Subsecciones (Konys de autor, clásicas, icónicas, combos; Antojitos mini; Cocteles cremosos/clásicos) | \`platos.subcategoria\` | La fuente las presenta dentro de una categoría. |
| Variantes (Coca-Cola: «COCACOLA ZERO» +$0) | \`platos.variantes\` (JSON) | No se convierten en productos independientes. |
| Adiciones opcionales (p. ej. «Papas enchuladas» +$2.000) | No se importan | Son para pedidos a domicilio; la reserva no gestiona pedidos (fuera del alcance). |
| Precio $0 en «CONO CONGELADO» (se vende por sabor, desde 6 unidades) | \`precio = NULL\` → «Precio por confirmar» | Mostrar $0 sería un precio falso. |
| La misma foto en «SODA ARANDANOS» y «SODA MARACUYÁ» | Sin imagen (ilustración rotulada «sin foto oficial») | No se puede verificar a cuál de los dos corresponde. |
| Descripciones vacías (granizados, gaseosas, cervezas…) | \`descripcion = NULL\` | No se inventan ingredientes. |
| Franja «disponible solo de 12 a 2:30 pm» (Menú Almuerzos) | \`categorias.disponible_desde = 12:00\`, \`disponible_hasta = 14:30\` | La carta muestra «Disponible ahora / Fuera de horario». |
| Nombres con mayúsculas, emojis o erratas de la fuente | Se conservan tal cual | Regla: respetar los nombres originales. |

### Imágenes

Se usan las URL públicas oficiales del menú (\`${new URL(productos.find((p) => p.imagen).imagen).origin}\`), comprobadas una a una
(respuesta 200, \`image/webp\`). **No se descargaron copias al repositorio** porque no consta una licencia que
permita redistribuirlas; si Konys lo autoriza, pueden subirse al bucket \`imagenes\` de Supabase desde el panel.
La CSP del sitio permite únicamente ese origen de imágenes además de Supabase.

## Platos de ejemplo que había en Supabase

| Plato | ¿Está en el menú oficial? | Acción |
|---|---|---|
| Margherita de la casa | No | Respaldado, \`origen = 'prueba'\`, oculto |
| Pepperoni Konys | No (existe «CARNES- Autentica PEPPERONI», con otro nombre, precio y descripción) | Respaldado, \`origen = 'prueba'\`, oculto |
| Vegetal al horno | No (existe «VEGGIE», distinto) | Respaldado, \`origen = 'prueba'\`, oculto |
| Pollo BBQ | No (existe «BBQ», $27.900, distinto) | Respaldado, \`origen = 'prueba'\`, oculto |
| Palitos de ajo y queso | No | Respaldado, \`origen = 'prueba'\`, oculto |
| Tiramisú | No | Respaldado, \`origen = 'prueba'\`, oculto |
| Calzone de arequipe | No | Respaldado, \`origen = 'prueba'\`, oculto |
| Limonada de coco | **Sí**: «Limonada de Coco» (Granizados) | Se conserva el mismo registro y se corrige: nombre, categoría \`granizados\`, precio $12.990 (antes $9.900), descripción vacía como en la fuente (la anterior era inventada), foto oficial |

Respaldo previo: tablas \`respaldo.platos_antes_catalogo\` y \`respaldo.categorias_antes_catalogo\` (migración 002_carta_real.sql).
Los platos de prueba no se borran automáticamente: no tienen dependencias, así que el administrador puede eliminarlos desde el panel
(filtro «Origen: Dato de prueba») cuando el equipo lo decida.

## Categorías

| Orden | Categoría | Id | Productos | Subtítulo oficial | Franja |
|---|---|---|---|---|---|
${tablaCategorias.join('\n')}

## Productos

| # | Producto | Categoría | Precio | Descripción oficial | Imagen | Otros datos | Id en la fuente |
|---|---|---|---|---|---|---|---|
${tablaProductos.join('\n')}
`;
await writeFile(new URL('docs/CATALOGO_KONYS.md', raiz), doc, 'utf8');
console.log('✔ docs/CATALOGO_KONYS.md');
console.log(`✔ seed_carta_real.sql: ${productos.length} productos, ${categoriasSql.length} categorías`);
console.log(`  Sin imagen individual verificable: ${sinImagen.join(', ') || 'ninguno'}`);
console.log(`  Sin precio publicado: ${productos.filter((p) => !(p.precio > 0)).map((p) => p.nombre).join(', ') || 'ninguno'}`);
