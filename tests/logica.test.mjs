// Pruebas de la lógica del frontend que no depende del navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatoHora, formatoPrecio, diaIso, sumarDias, aMinutos, aHora, ahoraBogota, formatoFechaLarga,
} from '../js/formato.js';
import { horariosDeMesa, horasLibres, estadoDia, mesaLibreA, proximasFechasAbiertas } from '../js/disponibilidad.js';
import { validarDatosReserva, validarMesa, validarHorario, validarPlato, tieneErrores } from '../js/validaciones.js';

// Horarios del seed: martes solo noche; miércoles a domingo dos jornadas; lunes cerrado.
const HORARIOS = [
  { dia_semana: 2, jornada: 'noche', hora_inicio: '17:00:00', hora_fin: '23:00:00', duracion_min: 60, activo: true },
  ...[3, 4, 5, 6, 7].flatMap((d) => [
    { dia_semana: d, jornada: 'almuerzo', hora_inicio: '12:30:00', hora_fin: '14:30:00', duracion_min: 60, activo: true },
    { dia_semana: d, jornada: 'noche', hora_inicio: '17:00:00', hora_fin: '23:00:00', duracion_min: 60, activo: true },
  ]),
];
const SABADO = '2026-11-07';
const LUNES = '2026-11-02';
const ANTES = { fecha: '2026-11-01', minutos: 10 * 60 }; // "ahora" = domingo 1 nov, 10:00 a. m.

test('formato de horas, precios y fechas como en el diseño', () => {
  assert.equal(formatoHora('20:00:00'), '8:00 p. m.');
  assert.equal(formatoHora('12:30'), '12:30 p. m.');
  assert.equal(formatoHora('09:05'), '9:05 a. m.');
  assert.equal(formatoPrecio(39900), '$39.900');
  assert.equal(formatoPrecio(1250000), '$1.250.000');
  assert.equal(formatoFechaLarga(SABADO), 'sábado 7 de noviembre');
  assert.equal(diaIso(SABADO), 6);
  assert.equal(diaIso('2026-11-08'), 7);
  assert.equal(sumarDias('2026-11-30', 1), '2026-12-01');
  assert.equal(aHora(aMinutos('13:30')), '13:30');
});

test('ahoraBogota usa la hora de Colombia sin importar la zona del equipo', () => {
  // 2026-11-01 03:00 UTC = 2026-10-31 22:00 en Bogotá (UTC-5)
  assert.deepEqual(ahoraBogota(new Date('2026-11-01T03:00:00Z')), { fecha: '2026-10-31', minutos: 22 * 60 });
});

test('genera horas cada 30 min sin pasarse del cierre de la jornada', () => {
  const j = horariosDeMesa({ horarios: HORARIOS, ocupacion: [], mesaId: 6, fecha: SABADO, ahora: ANTES });
  assert.deepEqual(j.map((x) => x.jornada), ['almuerzo', 'noche']);
  assert.deepEqual(j[0].horas.map((h) => h.hora), ['12:30', '13:00', '13:30']); // 13:30 + 60 = 14:30
  assert.equal(j[1].horas.at(-1).hora, '22:00'); // 22:00 + 60 = 23:00
  assert.equal(j[1].horas.length, 11);
});

test('una reserva de 60 min tacha las horas que se cruzan con ella', () => {
  const ocupacion = [{ mesa_id: 6, fecha: SABADO, hora_inicio: '19:00:00', hora_fin: '20:00:00' }];
  const horas = horariosDeMesa({ horarios: HORARIOS, ocupacion, mesaId: 6, fecha: SABADO, ahora: ANTES })[1].horas;
  const estado = Object.fromEntries(horas.map((h) => [h.hora, h.estado]));
  assert.equal(estado['18:00'], 'libre');   // 18:00–19:00 es contigua
  assert.equal(estado['18:30'], 'ocupado'); // 18:30–19:30 se cruza
  assert.equal(estado['19:00'], 'ocupado');
  assert.equal(estado['19:30'], 'ocupado');
  assert.equal(estado['20:00'], 'libre');
  // Otra mesa no se ve afectada
  assert.ok(mesaLibreA({ horarios: HORARIOS, ocupacion, mesaId: 7, fecha: SABADO, hora: '19:00', ahora: ANTES }));
});

test('las horas que ya pasaron hoy no se ofrecen', () => {
  const ahora = { fecha: SABADO, minutos: 19 * 60 + 10 };
  const libres = horasLibres({ horarios: HORARIOS, ocupacion: [], mesaId: 1, fecha: SABADO, ahora }).map((h) => h.hora);
  assert.equal(libres[0], '19:30');
});

test('estado del día: cerrado, sin cupo o disponible', () => {
  const ctx = { horarios: HORARIOS, mesaId: 6, ahora: ANTES };
  assert.equal(estadoDia({ ...ctx, ocupacion: [], fecha: LUNES }), 'cerrado');
  assert.equal(estadoDia({ ...ctx, ocupacion: [], fecha: '2026-10-30' }), 'cerrado'); // pasado
  assert.equal(estadoDia({ ...ctx, ocupacion: [], fecha: '2027-06-01' }), 'cerrado'); // > 60 días
  const lleno = [
    { mesa_id: 6, fecha: SABADO, hora_inicio: '12:30', hora_fin: '14:30' },
    { mesa_id: 6, fecha: SABADO, hora_inicio: '17:00', hora_fin: '23:00' },
  ];
  assert.equal(estadoDia({ ...ctx, ocupacion: lleno, fecha: SABADO }), 'sin-cupo');
  assert.equal(estadoDia({ ...ctx, ocupacion: [], fecha: SABADO }), 'disponible');
});

test('próximas fechas abiertas salta los lunes', () => {
  const fechas = proximasFechasAbiertas(HORARIOS, ANTES, 7);
  assert.ok(!fechas.includes(LUNES));
  assert.equal(fechas[0], '2026-11-01');
});

test('validación de datos de la reserva', () => {
  const mesa = { nombre: 'Mesa 6', capacidad: 4 };
  assert.ok(!tieneErrores(validarDatosReserva({ nombre: 'Laura Gómez', personas: 4, contacto: '' }, mesa)));
  assert.match(validarDatosReserva({ nombre: '', personas: 2 }, mesa).nombre, /nombre completo/);
  assert.match(validarDatosReserva({ nombre: 'Lu', personas: 2 }, mesa).nombre, /3 letras/);
  assert.match(validarDatosReserva({ nombre: 'Laura', personas: 5 }, mesa).personas, /hasta 4 personas/);
  assert.ok(validarDatosReserva({ nombre: 'Laura', personas: 0 }, mesa).personas);
  assert.ok(validarDatosReserva({ nombre: 'Laura', personas: 2, contacto: 'abc' }, mesa).contacto);
  assert.ok(!validarDatosReserva({ nombre: 'Laura', personas: 2, contacto: '+57 300 123 4567' }, mesa).contacto);
});

test('validación de mesas, horarios y platos del panel', () => {
  assert.ok(!tieneErrores(validarMesa({ nombre: 'Mesa 10', zona: 'salon', capacidad: '4' })));
  assert.ok(validarMesa({ nombre: 'Mesa 10', zona: 'salon', capacidad: '13' }).capacidad);
  assert.ok(validarMesa({ nombre: ' ', zona: 'patio', capacidad: '2' }).zona);
  assert.ok(!tieneErrores(validarHorario({ hora_inicio: '12:30', hora_fin: '14:30', duracion_min: 60 })));
  assert.ok(validarHorario({ hora_inicio: '14:30', hora_fin: '12:30', duracion_min: 60 }).hora_fin);
  assert.ok(validarHorario({ hora_inicio: '12:00', hora_fin: '12:30', duracion_min: 60 }).hora_fin);
  assert.ok(!tieneErrores(validarPlato({ nombre: 'Tiramisú', categoria_id: 'postres', precio: '17900' })));
  assert.ok(validarPlato({ nombre: 'Tiramisú', categoria_id: 'postres', precio: '17.900,50' }).precio);
  assert.ok(validarPlato({ nombre: 'Tiramisú', categoria_id: 'postres', precio: '' }).precio);
});
