// Servidor estático mínimo para desarrollo (sin dependencias).
// Uso: npm run dev  →  http://localhost:5173
// Imita a Vercel: /admin sirve admin.html, /reservar sirve reservar.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('../', import.meta.url)));
const puerto = Number(process.env.PORT) || 5173;
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
const bloqueados = ['.env', 'node_modules', '.git', 'supabase', 'tests', 'scripts'];

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta === '/') ruta = '/index.html';
  else if (!extname(ruta)) ruta += '.html';
  const archivo = normalize(join(raiz, ruta));
  const relativo = archivo.slice(raiz.length + 1).replace(/\\/g, '/');
  if (!archivo.startsWith(raiz) || bloqueados.some((b) => relativo === b || relativo.startsWith(b + '/'))) {
    res.writeHead(403).end('Prohibido');
    return;
  }
  try {
    if (!(await stat(archivo)).isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': tipos[extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(archivo));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(puerto, () => console.log(`Konys Pizza en http://localhost:${puerto}`));
