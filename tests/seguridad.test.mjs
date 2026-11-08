// Pruebas de seguridad que no requieren navegador:
// tiempo de inactividad, cabeceras HTTP y validaciones nuevas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TIEMPO_INACTIVIDAD_MS, tiempoInactividad, crearVigilante } from '../js/admin/inactividad.js';
import { construirCsp } from '../scripts/seguridad-http.mjs';
import { validarPlato, validarCategoria } from '../js/validaciones.js';
import { formatoPrecio } from '../js/formato.js';

const ubicacion = (url) => new URL(url);

test('inactividad: el valor de producción es exactamente 5 minutos', () => {
  assert.equal(TIEMPO_INACTIVIDAD_MS, 300000);
  assert.equal(tiempoInactividad(ubicacion('https://konys.vercel.app/admin')), 300000);
});

test('inactividad: el valor corto de pruebas solo se acepta en localhost y nunca alarga', () => {
  assert.equal(tiempoInactividad(ubicacion('http://localhost:5173/admin?inactividad=10')), 10000);
  assert.equal(tiempoInactividad(ubicacion('http://127.0.0.1:5173/admin?inactividad=15')), 15000);
  assert.equal(tiempoInactividad(ubicacion('https://konys.vercel.app/admin?inactividad=10')), 300000, 'en producción se ignora');
  assert.equal(tiempoInactividad(ubicacion('http://localhost:5173/admin?inactividad=99999')), 300000, 'no puede superar 5 min');
  assert.equal(tiempoInactividad(ubicacion('http://localhost:5173/admin?inactividad=abc')), 300000);
});

function ventanaFalsa() {
  const oyentes = {};
  const doc = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  return {
    document: doc,
    addEventListener: (t, f) => { (oyentes[t] ??= new Set()).add(f); },
    removeEventListener: (t, f) => oyentes[t]?.delete(f),
    emitir: (t) => oyentes[t]?.forEach((f) => f()),
    oyentes,
  };
}

test('inactividad: la actividad reinicia el contador y la inactividad expira la sesión', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const ventana = ventanaFalsa();
  let expiraciones = 0;
  const v = crearVigilante({ limiteMs: 10000, alExpirar: () => { expiraciones++; }, ventana, reloj: () => Date.now() });
  v.iniciar();
  t.mock.timers.tick(9000);
  ventana.emitir('mousemove'); // actividad a los 9 s → reinicia
  t.mock.timers.tick(9000);
  assert.equal(expiraciones, 0, 'no debe expirar: hubo actividad hace 9 s');
  ventana.emitir('keydown');
  t.mock.timers.tick(10000);
  assert.equal(expiraciones, 1, 'debe expirar tras 10 s sin actividad');
  assert.equal(v.activo, false);
  assert.equal(v.vencido(), true);
  assert.equal(ventana.oyentes.mousemove.size, 0, 'deja de escuchar eventos al expirar');
  t.mock.timers.tick(60000);
  assert.equal(expiraciones, 1, 'expira una sola vez');
});

test('inactividad: actividad después de vencer no revive la sesión', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const ventana = ventanaFalsa();
  let ahora = 0;
  let expiro = false;
  const v = crearVigilante({ limiteMs: 5000, alExpirar: () => { expiro = true; }, ventana, reloj: () => ahora });
  v.iniciar();
  ahora = 6000; // el equipo estuvo suspendido: el temporizador no corrió
  ventana.emitir('click');
  assert.equal(v.vencido(), true, 'el panel debe bloquear este clic');
  t.mock.timers.tick(1);
  assert.equal(expiro, true);
});

test('inactividad: al volver a iniciar sesión el control empieza de nuevo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const ventana = ventanaFalsa();
  let expiraciones = 0;
  const v = crearVigilante({ limiteMs: 3000, alExpirar: () => { expiraciones++; }, ventana, reloj: () => Date.now() });
  v.iniciar();
  t.mock.timers.tick(3000);
  assert.equal(expiraciones, 1);
  v.iniciar();
  assert.equal(v.vencido(), false);
  t.mock.timers.tick(2000);
  assert.equal(expiraciones, 1);
  t.mock.timers.tick(1000);
  assert.equal(expiraciones, 2);
});

test('CSP: vercel.json usa la misma política que el servidor local', async () => {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const csp = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.equal(csp, construirCsp());
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, 'no se permiten scripts en línea');
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/);
});

test('validación de platos: el precio es opcional pero si se escribe debe ser válido', () => {
  assert.deepEqual(validarPlato({ nombre: 'HAWAIANA', categoria_id: 'pizzas', precio: '' }), {});
  assert.ok(validarPlato({ nombre: 'HAWAIANA', categoria_id: 'pizzas', precio: '27.900' }).precio);
  assert.ok(validarPlato({ nombre: 'HAWAIANA', categoria_id: 'pizzas', precio: '-1' }).precio);
  assert.ok(validarPlato({ nombre: 'X', categoria_id: 'pizzas', precio: '1', descripcion: 'a'.repeat(601) }).descripcion);
  assert.equal(formatoPrecio(null), 'Precio por confirmar');
  assert.equal(formatoPrecio(27900), '$27.900');
});

test('validación de categorías', () => {
  assert.deepEqual(validarCategoria({ id: 'menu_infantil', nombre: 'Menú Infantil', orden: '2' }, true), {});
  assert.ok(validarCategoria({ id: 'Menú Infantil', nombre: 'Menú', orden: '2' }, true).id);
  assert.ok(validarCategoria({ id: 'x', nombre: '', orden: '' }, false).nombre);
  assert.ok(validarCategoria({ nombre: 'A', disponible_desde: '12:00', disponible_hasta: '' }, false).disponible_hasta);
  assert.ok(validarCategoria({ nombre: 'A', disponible_desde: '14:30', disponible_hasta: '12:00' }, false).disponible_hasta);
  assert.deepEqual(validarCategoria({ nombre: 'A', disponible_desde: '12:00', disponible_hasta: '14:30' }, false), {});
});
