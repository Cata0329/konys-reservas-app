// Servidor estático mínimo para desarrollo (sin dependencias).
// Uso: npm run dev  →  http://localhost:5173
// Imita a Vercel: /admin sirve admin.html, /reservar sirve reservar.html,
// y envía las mismas cabeceras de seguridad (incluida la CSP).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirCsp, CABECERAS_SEGURIDAD } from './seguridad-http.mjs';

const raiz = resolve(fileURLToPath(new URL('../', import.meta.url)));
const puerto = Number(process.env.PORT) || 5173;
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
const bloqueados = ['.env', 'node_modules', '.git', 'supabase', 'tests', 'scripts', 'pruebas'];

/** Si js/config.js apunta a un Supabase local (pruebas), la CSP debe permitir conectarse a él. */
async function origenesLocales() {
  try {
    const texto = await readFile(join(raiz, 'js', 'config.js'), 'utf8');
    const url = texto.match(/"SUPABASE_URL":\s*"([^"]+)"/)?.[1];
    return url && /^http:\/\/(localhost|127\.0\.0\.1)/.test(url) ? [new URL(url).origin] : [];
  } catch {
    return [];
  }
}

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta === '/') ruta = '/index.html';
  else if (!extname(ruta)) ruta += '.html';
  const archivo = normalize(join(raiz, ruta));
  const relativo = archivo.slice(raiz.length + 1).replace(/\\/g, '/');
  const cabeceras = { ...CABECERAS_SEGURIDAD, 'Content-Security-Policy': construirCsp(await origenesLocales()) };
  if (!archivo.startsWith(raiz) || bloqueados.some((b) => relativo === b || relativo.startsWith(b + '/'))) {
    res.writeHead(403, cabeceras).end('Prohibido');
    return;
  }
  try {
    if (!(await stat(archivo)).isFile()) throw new Error();
    res.writeHead(200, { ...cabeceras, 'Content-Type': tipos[extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(archivo));
  } catch {
    res.writeHead(404, { ...cabeceras, 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(puerto, () => console.log(`Konys Pizza en http://localhost:${puerto}`));
