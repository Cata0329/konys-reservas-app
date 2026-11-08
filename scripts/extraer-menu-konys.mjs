// Extrae el menú oficial de Konys desde https://soyclubify.com/d/konys
// (fuente oficial indicada por el restaurante) y lo guarda en
// docs/menu-oficial-konys.json con la fecha de consulta.
//
// No inventa nada: copia nombre, descripción, precio, variantes, etiquetas
// e imagen tal como los publica la página. Uso:
//   node scripts/extraer-menu-konys.mjs            (descarga la página)
//   node scripts/extraer-menu-konys.mjs pagina.html (usa un HTML ya guardado)
import { readFile, writeFile } from 'node:fs/promises';

const URL_MENU = 'https://soyclubify.com/d/konys';
const salida = new URL('../docs/menu-oficial-konys.json', import.meta.url);

const html = process.argv[2]
  ? await readFile(process.argv[2], 'utf8')
  : await (await fetch(URL_MENU, { headers: { 'User-Agent': 'Mozilla/5.0 (konys-reservas-app)' } })).text();

// La página (Next.js) incluye sus datos en llamadas self.__next_f.push([1,"..."]).
const trozos = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]));
const flujo = trozos.join('');

const secciones = [];
function recorrer(o) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach(recorrer); return; }
  if (Array.isArray(o.products) && o.name && o.id) secciones.push(o);
  for (const k of Object.keys(o)) if (k !== 'products') recorrer(o[k]);
}
for (const linea of flujo.split('\n')) {
  const i = linea.indexOf(':');
  if (i < 0 || !linea.includes('"products"')) continue;
  try { recorrer(JSON.parse(linea.slice(i + 1))); } catch { /* línea que no es JSON */ }
}
if (!secciones.length) throw new Error('No se encontraron secciones: la página cambió de formato.');

const porId = new Map(secciones.map((s) => [s.id, s]));
const subIds = new Set(secciones.flatMap((s) => (s.subsections ?? []).map((x) => x.id)));
const producto = (p) => ({
  id_clubify: p.id,
  nombre: p.name.trim(),
  descripcion: (p.description ?? '').trim() || null,
  precio: p.basePrice,
  precio_max: p.priceMax,
  imagen: p.imageUrl ?? null,
  etiquetas: p.tags ?? [],
  recomendado: Boolean(p.isRecommended),
  variantes: (p.variants ?? []).map((v) => ({ grupo: v.groupName, nombre: v.name, delta: v.priceDelta })),
});
const seccion = (s) => ({
  nombre: s.name.trim(),
  descripcion: s.description ?? null,
  subtitulo: s.tagline ?? null,
  productos: (s.products ?? []).map(producto),
  subsecciones: (s.subsections ?? []).map((x) => seccion(porId.get(x.id) ?? x)),
});

const menu = {
  fuente: URL_MENU,
  consultado: new Date().toISOString(),
  secciones: secciones.filter((s) => !subIds.has(s.id)).map(seccion),
};
await writeFile(salida, JSON.stringify(menu, null, 2) + '\n', 'utf8');
const total = new Set(secciones.flatMap((s) => s.products.map((p) => p.id))).size;
console.log(`✔ ${menu.secciones.length} secciones, ${total} productos únicos → docs/menu-oficial-konys.json`);
