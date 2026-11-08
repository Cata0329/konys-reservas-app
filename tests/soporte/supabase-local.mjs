// =====================================================================
// Supabase local SOLO PARA PRUEBAS (no se usa en producción).
//
// Emula lo mínimo de PostgREST (REST + RPC) y de Supabase Auth sobre un
// PostgreSQL real embebido (PGlite), ejecutando las MISMAS migraciones del
// proyecto con RLS y roles anon/authenticated. Así las pruebas Selenium
// comprueban permisos reales sin tocar la base de datos de producción.
//
// Uso:  node tests/soporte/supabase-local.mjs [puerto]   (por defecto 54321)
//
// Usuarios de prueba (solo existen aquí, se crean en memoria al arrancar):
//   admin@konys.test  → administrador
//   otro@konys.test   → autenticado SIN permisos de administración
//   Contraseña de ambos: la de la variable SUPABASE_PRUEBA_CLAVE. Si no se define,
//   se genera una aleatoria en cada arranque (y no se muestra).
//   tests/selenium/ejecutar.py crea una nueva en cada ejecución.
//
// Fidelidad con Supabase:
//  - JWT HS256 firmados y con vencimiento; un token manipulado o vencido
//    recibe 401 (como PostgREST).
//  - Cerrar sesión revoca la sesión y sus refresh tokens; GET /auth/v1/user
//    con un token de una sesión cerrada responde 403 (como Supabase Auth).
//  - Igual que en Supabase, un access token NO vencido sigue siendo aceptado
//    por la API REST hasta su vencimiento aunque se cierre la sesión.
// =====================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const PUERTO = Number(process.argv[2]) || 54321;
const raiz = new URL('../../', import.meta.url);
const CLAVE = process.env.SUPABASE_PRUEBA_CLAVE || randomBytes(18).toString('base64url');
const SECRETO_JWT = randomBytes(32);
const DURACION_TOKEN_S = Number(process.env.SUPABASE_PRUEBA_JWT_S) || 3600;

const USUARIOS = {
  'admin@konys.test': { id: '11111111-1111-1111-1111-111111111111', admin: true },
  'otro@konys.test': { id: '22222222-2222-2222-2222-222222222222', admin: false },
};
const sesiones = new Map(); // id → { usuario, activa }
const refrescos = new Map(); // refresh_token → id de sesión

// ---------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------
const db = new PGlite({ extensions: { btree_gist }, parsers: { 1082: (v) => v } }); // fechas como texto (igual que PostgREST)
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id serial primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;`);
const sql = (ruta) => readFile(new URL(ruta, raiz), 'utf8');
await db.exec(await sql('supabase/migrations/001_esquema_inicial.sql'));
await db.exec(await sql('supabase/seed.sql'));
await db.exec(await sql('tests/sql/fixtures/platos_ejemplo_antiguos.sql')); // estado real antes del catálogo
await db.exec(await sql('supabase/migrations/002_catalogo_y_consulta.sql'));
await db.exec(await sql('supabase/migrations/003_catalogo_oficial.sql'));
for (const [email, u] of Object.entries(USUARIOS)) {
  await db.query('insert into auth.users values ($1, $2)', [u.id, email]);
  if (u.admin) await db.query('insert into public.administradores (user_id, nombre) values ($1, $2)', [u.id, 'Admin pruebas']);
}

let cola = Promise.resolve();
const enSerie = (fn) => { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; };

// ---------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const firmar = (datos) => createHmac('sha256', SECRETO_JWT).update(datos).digest('base64url');

function emitirToken(usuario, sesionId, venceEn = DURACION_TOKEN_S) {
  const ahora = Math.floor(Date.now() / 1000);
  const datos = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: usuario.id, email: usuario.email, role: 'authenticated', aud: 'authenticated', session_id: sesionId,
    iat: ahora, exp: ahora + venceEn,
  })}`;
  return `${datos}.${firmar(datos)}`;
}

/** Devuelve { carga } si el token es válido, { error } si no, o {} si es la clave anónima. */
function verificarToken(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return {}; // clave publishable (no es JWT): rol anon
  const esperado = Buffer.from(firmar(`${partes[0]}.${partes[1]}`));
  const recibido = Buffer.from(partes[2]);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
    return { error: { code: 'PGRST301', message: 'JWSError (CompactDecodeError Invalid signature)' } };
  }
  const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString());
  if (carga.exp <= Math.floor(Date.now() / 1000)) return { error: { code: 'PGRST301', message: 'JWT expired' } };
  return { carga };
}

function nuevaSesion(email) {
  const usuario = { ...USUARIOS[email], email };
  const id = randomUUID();
  const refresh = randomBytes(24).toString('hex');
  sesiones.set(id, { usuario, activa: true });
  refrescos.set(refresh, id);
  return respuestaSesion(usuario, id, refresh);
}

function respuestaSesion(usuario, id, refresh) {
  return {
    access_token: emitirToken(usuario, id), token_type: 'bearer', expires_in: DURACION_TOKEN_S,
    expires_at: Math.floor(Date.now() / 1000) + DURACION_TOKEN_S, refresh_token: refresh,
    user: { id: usuario.id, email: usuario.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
  };
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
const intentosFallidos = new Map();

function auth(req, url, cuerpo) {
  const ruta = url.pathname.replace('/auth/v1', '');
  if (ruta === '/token' && url.searchParams.get('grant_type') === 'password') {
    const email = cuerpo?.email;
    const fallos = intentosFallidos.get(email) ?? 0;
    if (fallos >= 10) return { estado: 429, datos: { code: 'over_request_rate_limit', msg: 'Request rate limit reached' } };
    if (!USUARIOS[email] || cuerpo?.password !== CLAVE) {
      intentosFallidos.set(email, fallos + 1);
      return { estado: 400, datos: { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' } };
    }
    intentosFallidos.delete(email);
    return { estado: 200, datos: nuevaSesion(email) };
  }
  if (ruta === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const id = refrescos.get(cuerpo?.refresh_token);
    const sesion = sesiones.get(id);
    if (!sesion?.activa) return { estado: 400, datos: { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' } };
    refrescos.delete(cuerpo.refresh_token); // rotación: cada refresh token sirve una vez
    const nuevo = randomBytes(24).toString('hex');
    refrescos.set(nuevo, id);
    return { estado: 200, datos: respuestaSesion(sesion.usuario, id, nuevo) };
  }
  const { carga, error } = verificarToken(req);
  if (ruta === '/user') {
    if (error || !carga) return { estado: 401, datos: { code: 'bad_jwt', msg: error?.message ?? 'invalid JWT' } };
    if (!sesiones.get(carga.session_id)?.activa) {
      return { estado: 403, datos: { code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' } };
    }
    return { estado: 200, datos: { id: carga.sub, email: carga.email, aud: 'authenticated', role: 'authenticated' } };
  }
  if (ruta === '/logout') {
    if (carga) {
      const sesion = sesiones.get(carga.session_id);
      if (sesion) sesion.activa = false;
      for (const [r, id] of refrescos) if (id === carga.session_id || url.searchParams.get('scope') === 'global') refrescos.delete(r);
    }
    return { estado: 204, datos: null };
  }
  return { estado: 404, datos: { msg: 'no soportado en el emulador' } };
}

// ---------------------------------------------------------------------
// REST (subconjunto de PostgREST que usa la aplicación)
// ---------------------------------------------------------------------
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error(`identificador inválido ${s}`), { code: 'PGRST100' });
  return `"${s}"`;
};
const EMBEBIDOS = { mesas: 'mesa_id' };

function columnas(select) {
  if (!select || select === '*') return '*';
  const partes = [];
  let prof = 0;
  let actual = '';
  for (const c of select) {
    if (c === '(') prof++;
    if (c === ')') prof--;
    if (c === ',' && prof === 0) { partes.push(actual.trim()); actual = ''; } else actual += c;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes.map((p) => {
    const m = p.match(/^(\w+)\((.*)\)$/);
    if (!m) return `t.${ident(p)}`;
    const cols = m[2].split(',').map((x) => x.trim());
    return `(select json_build_object(${cols.map((c) => `'${c}', e.${ident(c)}`).join(', ')}) from public.${ident(m[1])} e where e.id = t.${ident(EMBEBIDOS[m[1]])}) as ${ident(m[1])}`;
  }).join(', ');
}

function filtros(params, valores) {
  const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  const cond = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(k)) continue;
    const [op, ...resto] = v.split('.');
    const valor = resto.join('.');
    if (!ops[op]) throw Object.assign(new Error(`operador no soportado ${op}`), { code: 'PGRST100' });
    valores.push(valor === 'true' ? true : valor === 'false' ? false : valor);
    cond.push(`t.${ident(k)} ${ops[op]} $${valores.length}`);
  }
  return cond.length ? `where ${cond.join(' and ')}` : '';
}

function ejecutarComo(carga, fn) {
  return enSerie(async () => {
    const sub = carga?.sub ?? '';
    await db.exec(`set role ${carga ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${sub.replace(/[^0-9a-f-]/gi, '')}', false);`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
  });
}

async function rest(req, url, cuerpo) {
  const { carga, error } = verificarToken(req);
  if (error) return { estado: 401, datos: { ...error, details: null, hint: null } };
  const partes = url.pathname.split('/').filter(Boolean);
  const params = [...url.searchParams];
  const unico = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  const contar = (req.headers.prefer ?? '').includes('count=exact');

  if (partes[2] === 'rpc') {
    const args = Object.entries(cuerpo ?? {});
    const consulta = `select * from public.${ident(partes[3])}(${args.map(([k], i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
    const r = await ejecutarComo(carga, () => db.query(consulta, args.map(([, v]) => v)));
    // Una función escalar (returns text) devuelve el valor, no una fila.
    const escalar = r.fields.length === 1 && r.fields[0].name === partes[3];
    return { estado: 200, datos: escalar ? r.rows[0]?.[partes[3]] ?? null : r.rows };
  }

  const tabla = ident(partes[2]);
  const valores = [];
  const sel = columnas(url.searchParams.get('select'));
  let r;
  let total = null;
  if (req.method === 'GET') {
    const where = filtros(params, valores);
    const orden = url.searchParams.get('order');
    const order = orden ? `order by ${orden.split(',').map((o) => { const [c, d] = o.split('.'); return `t.${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(', ')}` : '';
    const limit = url.searchParams.get('limit') ? `limit ${Number(url.searchParams.get('limit'))}` : '';
    const offset = url.searchParams.get('offset') ? `offset ${Number(url.searchParams.get('offset'))}` : '';
    r = await ejecutarComo(carga, async () => {
      if (contar) total = (await db.query(`select count(*)::int n from public.${tabla} t ${where}`, valores)).rows[0].n;
      return db.query(`select ${sel} from public.${tabla} t ${where} ${order} ${limit} ${offset}`, valores);
    });
  } else if (req.method === 'POST') {
    const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    const cols = Object.keys(filas[0]);
    const vals = filas.map((f) => `(${cols.map((c) => { valores.push(f[c]); return `$${valores.length}`; }).join(', ')})`).join(', ');
    r = await ejecutarComo(carga, () => db.query(
      `with t as (insert into public.${tabla} (${cols.map(ident).join(', ')}) values ${vals} returning *) select ${sel} from t`, valores));
  } else if (req.method === 'PATCH') {
    const sets = Object.entries(cuerpo).map(([c, v]) => { valores.push(v); return `${ident(c)} = $${valores.length}`; });
    const where = filtros(params, valores);
    r = await ejecutarComo(carga, () => db.query(
      `with t as (update public.${tabla} t set ${sets.join(', ')} ${where} returning t.*) select ${sel} from t`, valores));
  } else if (req.method === 'DELETE') {
    const where = filtros(params, valores);
    r = await ejecutarComo(carga, () => db.query(`with t as (delete from public.${tabla} t ${where} returning t.*) select ${sel} from t`, valores));
  } else {
    return { estado: 405, datos: { message: 'método no soportado' } };
  }
  if (unico) {
    if (r.rows.length !== 1) {
      return { estado: 406, datos: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${r.rows.length} rows`, hint: null } };
    }
    return { estado: 200, datos: r.rows[0] };
  }
  const desde = Number(url.searchParams.get('offset') ?? 0);
  const cabeceras = total !== null ? { 'Content-Range': `${desde}-${desde + r.rows.length - 1}/${total}` } : {};
  return { estado: req.method === 'POST' ? 201 : 200, datos: r.rows, cabeceras };
}

// ---------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------
createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
  const url = new URL(req.url, 'http://localhost');

  // Utilidades exclusivas de las pruebas automatizadas.
  if (url.pathname === '/__pruebas/token-vencido') {
    const u = { ...USUARIOS['admin@konys.test'], email: 'admin@konys.test' };
    const id = randomUUID();
    sesiones.set(id, { usuario: u, activa: true });
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ access_token: emitirToken(u, id, -60) }));
    return;
  }
  if (url.pathname === '/__pruebas/estado') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }

  let texto = '';
  for await (const c of req) texto += c;
  let r;
  try {
    const cuerpo = texto ? JSON.parse(texto) : null;
    r = url.pathname.startsWith('/auth/v1/') ? auth(req, url, cuerpo)
      : url.pathname.startsWith('/rest/v1/') ? await rest(req, url, cuerpo)
        : { estado: 404, datos: { message: 'ruta no encontrada' } };
  } catch (e) {
    const estado = e.code === '42501' ? 403 : ['23505', '23P01', '23503'].includes(e.code) ? 409 : 400;
    r = { estado, datos: { code: e.code ?? 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null } };
  }
  if (process.env.SUPABASE_PRUEBA_LOG) console.log(req.method, url.pathname, '→', r.estado);
  res.writeHead(r.estado, { ...cors, ...(r.datos === null ? {} : { 'Content-Type': 'application/json' }), ...(r.cabeceras ?? {}) });
  res.end(r.datos === null ? '' : JSON.stringify(r.datos));
}).listen(PUERTO, () => console.log(`Supabase local de pruebas en http://localhost:${PUERTO}`));
