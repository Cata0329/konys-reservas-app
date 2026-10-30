// Pruebas del esquema SQL sobre un PostgreSQL real embebido (PGlite).
// Simula lo mínimo de Supabase (roles anon/authenticated, auth.uid()
// y storage) para ejecutar la migración y el seed tal como están.
//
// Ejecutar: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const raiz = new URL('../../supabase/', import.meta.url);
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const OTRO_ID = '22222222-2222-2222-2222-222222222222';

let db;
let miercoles; // próximo miércoles (día con almuerzo y noche)
let lunes;     // próximo lunes (sin atención)
let mesas;     // nombre -> id

const STUB_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id serial primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
`;

// Ejecuta una consulta como un rol concreto (anon / authenticated)
// y deja la sesión limpia al terminar.
async function como(rol, usuario, sql, params = []) {
  await db.exec(`set role ${rol}; select set_config('request.jwt.claim.sub', '${usuario ?? ''}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function esperaError(promesa, codigo) {
  await assert.rejects(promesa, (e) => {
    assert.match(e.message, new RegExp(codigo));
    return true;
  });
}

const reservar = (mesa, fecha, hora, nombre = 'Laura Gómez', personas = 2) =>
  como('anon', null,
    'select * from public.crear_reserva($1, $2, $3, $4, $5, $6)',
    [mesa, fecha, hora, nombre, personas, '3001234567']);

before(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(STUB_SUPABASE);
  await db.exec(await readFile(new URL('migrations/001_esquema_inicial.sql', raiz), 'utf8'));
  await db.exec(await readFile(new URL('seed.sql', raiz), 'utf8'));
  await db.exec(`
    insert into auth.users values ('${ADMIN_ID}', 'admin@konys.test'), ('${OTRO_ID}', 'otro@konys.test');
    insert into public.administradores (user_id, nombre) values ('${ADMIN_ID}', 'Admin');
  `);
  const fechas = await db.query(`
    with hoy as (select (now() at time zone 'America/Bogota')::date d)
    select
      (select d + i from hoy, generate_series(1, 7) i where extract(isodow from d + i) = 3 limit 1)::text as miercoles,
      (select d + i from hoy, generate_series(1, 7) i where extract(isodow from d + i) = 1 limit 1)::text as lunes`);
  ({ miercoles, lunes } = fechas.rows[0]);
  const filas = (await db.query('select id, nombre from public.mesas')).rows;
  mesas = Object.fromEntries(filas.map((f) => [f.nombre, Number(f.id)]));
});

test('el seed carga 9 mesas, 11 jornadas y 8 platos', async () => {
  const r = await db.query(`select
    (select count(*) from public.mesas)::int m,
    (select count(*) from public.horarios)::int h,
    (select count(*) from public.platos)::int p`);
  assert.deepEqual(r.rows[0], { m: 9, h: 11, p: 8 });
});

test('el seed es idempotente (ejecutarlo dos veces no duplica)', async () => {
  await db.exec(await readFile(new URL('seed.sql', raiz), 'utf8'));
  const r = await db.query('select count(*)::int n from public.mesas');
  assert.equal(r.rows[0].n, 9);
});

test('un cliente anónimo puede reservar mediante crear_reserva', async () => {
  const r = await reservar(mesas['Mesa 6'], miercoles, '20:00');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].mesa_nombre, 'Mesa 6');
  assert.equal(r.rows[0].hora_fin, '21:00:00');
});

test('no permite reservar la misma mesa en un horario que se cruza', async () => {
  await esperaError(reservar(mesas['Mesa 6'], miercoles, '20:00', 'Otra Persona'), 'HORARIO_OCUPADO');
  await esperaError(reservar(mesas['Mesa 6'], miercoles, '19:30', 'Otra Persona'), 'HORARIO_OCUPADO');
  await esperaError(reservar(mesas['Mesa 6'], miercoles, '20:30', 'Otra Persona'), 'HORARIO_OCUPADO');
});

test('sí permite horarios contiguos y otra mesa a la misma hora', async () => {
  await reservar(mesas['Mesa 6'], miercoles, '21:00', 'Andrés Pinto');
  await reservar(mesas['Mesa 6'], miercoles, '19:00', 'Camila Rueda');
  await reservar(mesas['Mesa 7'], miercoles, '20:00', 'Julián Ortiz');
});

test('la restricción también protege inserciones directas (no solo la función)', async () => {
  await esperaError(db.query(
    `insert into public.reservas (mesa_id, cliente_nombre, num_personas, fecha, hora_inicio, hora_fin)
     values ($1, 'Inserción directa', 2, $2, '20:15', '21:15')`, [mesas['Mesa 6'], miercoles]),
  'reservas_sin_solapamiento');
});

test('una reserva cancelada libera el horario', async () => {
  const r = await reservar(mesas['Mesa 3'], miercoles, '18:00', 'Daniela Cárdenas');
  await db.query(`update public.reservas set estado = 'cancelada' where id = $1`, [r.rows[0].id]);
  const nueva = await reservar(mesas['Mesa 3'], miercoles, '18:00', 'Sebastián Mora');
  assert.equal(nueva.rows.length, 1);
  // Y reactivar la cancelada ya no es posible: chocaría con la nueva.
  await esperaError(db.query(`update public.reservas set estado = 'confirmada' where id = $1`, [r.rows[0].id]),
    'reservas_sin_solapamiento');
});

test('no permite superar la capacidad de la mesa', async () => {
  await esperaError(reservar(mesas['Mesa 1'], miercoles, '17:00', 'Grupo Grande', 3), 'CAPACIDAD_EXCEDIDA');
  // El trigger también lo impide al editar una reserva existente.
  const r = await reservar(mesas['Mesa 1'], miercoles, '18:00', 'Pareja Feliz', 2);
  await esperaError(db.query('update public.reservas set num_personas = 5 where id = $1', [r.rows[0].id]),
    'CAPACIDAD_EXCEDIDA');
});

test('no permite reservar una mesa inactiva', async () => {
  await esperaError(reservar(mesas['Mesa 9'], miercoles, '20:00'), 'MESA_NO_DISPONIBLE');
});

test('no permite reservar fuera de los turnos configurados', async () => {
  await esperaError(reservar(mesas['Mesa 4'], lunes, '20:00'), 'FUERA_DE_HORARIO');      // lunes cerrado
  await esperaError(reservar(mesas['Mesa 4'], miercoles, '14:00'), 'FUERA_DE_HORARIO');  // 14:00 + 60 > 14:30
  await esperaError(reservar(mesas['Mesa 4'], miercoles, '22:30'), 'FUERA_DE_HORARIO');  // 22:30 + 60 > 23:00
  await esperaError(reservar(mesas['Mesa 4'], miercoles, '15:00'), 'FUERA_DE_HORARIO');  // entre jornadas
  await esperaError(reservar(mesas['Mesa 4'], miercoles, '12:45'), 'FUERA_DE_HORARIO');  // fuera de la cuadrícula
  const ultima = await reservar(mesas['Mesa 4'], miercoles, '13:30', 'Valentina Reyes'); // 13:30–14:30 cabe
  assert.equal(ultima.rows[0].hora_fin, '14:30:00');
});

test('no permite fechas pasadas ni demasiado lejanas', async () => {
  await esperaError(reservar(mesas['Mesa 4'], '2020-01-01', '20:00'), 'FECHA_FUERA_DE_RANGO');
  await esperaError(reservar(mesas['Mesa 4'], '2099-01-07', '20:00'), 'FECHA_FUERA_DE_RANGO');
});

test('valida nombre y número de personas', async () => {
  await esperaError(reservar(mesas['Mesa 4'], miercoles, '17:00', '  ', 2), 'NOMBRE_INVALIDO');
  await esperaError(reservar(mesas['Mesa 4'], miercoles, '17:00', 'Laura', 0), 'PERSONAS_INVALIDAS');
});

test('el público no puede leer, insertar ni modificar reservas directamente', async () => {
  const leer = await como('anon', null, 'select * from public.reservas').catch((e) => e);
  assert.ok(leer instanceof Error, 'anon no debe poder hacer select sobre reservas');
  await assert.rejects(como('anon', null,
    `insert into public.reservas (mesa_id, cliente_nombre, num_personas, fecha, hora_inicio, hora_fin)
     values (1, 'Intruso', 2, '${miercoles}', '12:30', '13:30')`));
  await assert.rejects(como('anon', null, `update public.reservas set estado = 'cancelada'`));
});

test('ocupacion() expone horarios ocupados sin datos personales', async () => {
  const r = await como('anon', null, 'select * from public.ocupacion($1, $1)', [miercoles]);
  assert.ok(r.rows.length >= 5);
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['fecha', 'hora_fin', 'hora_inicio', 'mesa_id']);
  // Las canceladas no aparecen.
  const total = await db.query(`select count(*)::int n from public.reservas where fecha = $1 and estado <> 'cancelada'`, [miercoles]);
  assert.equal(r.rows.length, total.rows[0].n);
});

test('el público solo ve mesas activas, horarios activos y platos disponibles', async () => {
  const m = await como('anon', null, 'select nombre from public.mesas');
  assert.equal(m.rows.length, 8);
  assert.ok(!m.rows.some((f) => f.nombre === 'Mesa 9'));
  const p = await como('anon', null, 'select nombre from public.platos');
  assert.ok(!p.rows.some((f) => f.nombre === 'Calzone de arequipe'));
  await db.query('update public.horarios set activo = false where dia_semana = 2');
  const h = await como('anon', null, 'select count(*)::int n from public.horarios');
  assert.equal(h.rows[0].n, 10);
  await db.query('update public.horarios set activo = true where dia_semana = 2');
});

test('un usuario autenticado que no es admin no puede gestionar nada', async () => {
  const r = await como('authenticated', OTRO_ID, `update public.mesas set capacidad = 12 returning id`);
  assert.equal(r.rows.length, 0, 'RLS debe filtrar todas las filas');
  const lect = await como('authenticated', OTRO_ID, 'select count(*)::int n from public.reservas');
  assert.equal(lect.rows[0].n, 0);
  await assert.rejects(como('authenticated', OTRO_ID,
    `insert into public.platos (nombre, categoria_id, precio) values ('Hackeada', 'pizzas', 1)`));
  const admins = await como('authenticated', OTRO_ID, 'select count(*)::int n from public.administradores');
  assert.equal(admins.rows[0].n, 0);
});

test('el administrador puede leer reservas y gestionar mesas, horarios y carta', async () => {
  const lect = await como('authenticated', ADMIN_ID, 'select count(*)::int n from public.reservas');
  assert.ok(lect.rows[0].n > 0);
  const upd = await como('authenticated', ADMIN_ID,
    `update public.mesas set activa = true where nombre = 'Mesa 9' returning activa`);
  assert.equal(upd.rows[0].activa, true);
  await como('authenticated', ADMIN_ID,
    `insert into public.horarios (dia_semana, jornada, hora_inicio, hora_fin) values (1, 'noche', '17:00', '22:00')`);
  await como('authenticated', ADMIN_ID,
    `insert into public.platos (nombre, categoria_id, precio) values ('Pizza nueva', 'pizzas', 30000)`);
  await como('authenticated', ADMIN_ID,
    `update public.reservas set estado = 'completada' where cliente_nombre = 'Laura Gómez'`);
});

test('horarios: rechaza jornadas que se cruzan o donde no cabe una reserva', async () => {
  await esperaError(db.query(
    `insert into public.horarios (dia_semana, jornada, hora_inicio, hora_fin) values (2, 'almuerzo', '16:00', '18:00')`),
  'horarios_sin_cruce');
  await esperaError(db.query(
    `insert into public.horarios (dia_semana, jornada, hora_inicio, hora_fin, duracion_min) values (1, 'almuerzo', '12:00', '12:30', 60)`),
  'horarios_cabe_una_reserva');
});

test('no se puede eliminar una mesa con reservas históricas', async () => {
  await esperaError(como('authenticated', ADMIN_ID, `delete from public.mesas where nombre = 'Mesa 6'`),
    'foreign key');
  const nueva = await como('authenticated', ADMIN_ID,
    `insert into public.mesas (nombre, zona, capacidad) values ('Mesa 10', 'salon', 2) returning id`);
  const borrada = await como('authenticated', ADMIN_ID, 'delete from public.mesas where id = $1 returning id', [nueva.rows[0].id]);
  assert.equal(borrada.rows.length, 1);
});
