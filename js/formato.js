// Utilidades de formato y fechas (sin dependencias, probadas en tests/).
// Las fechas se manejan como texto 'AAAA-MM-DD' y las horas como 'HH:MM'
// para evitar errores de zona horaria del navegador.

export const ZONA_HORARIA = 'America/Bogota';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_ISO = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const nombreDiaIso = (iso) => DIAS_ISO[iso];
export const nombreMes = (mes) => MESES[mes - 1];

/** Convierte 'HH:MM' o 'HH:MM:SS' a minutos desde medianoche. */
export function aMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + m;
}

/** Convierte minutos desde medianoche a 'HH:MM'. */
export function aHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** '20:00' -> '8:00 p. m.' (formato usado en todo el diseño). */
export function formatoHora(hora) {
  const total = aMinutos(hora);
  const h = Math.floor(total / 60);
  const m = String(total % 60).padStart(2, '0');
  const sufijo = h >= 12 ? 'p. m.' : 'a. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${sufijo}`;
}

/** 'AAAA-MM-DD' -> Date local (solo para calcular día de la semana). */
export function aFechaLocal(texto) {
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function aTextoFecha(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function sumarDias(texto, dias) {
  const f = aFechaLocal(texto);
  f.setDate(f.getDate() + dias);
  return aTextoFecha(f);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function diaIso(texto) {
  const d = aFechaLocal(texto).getDay();
  return d === 0 ? 7 : d;
}

/** 'AAAA-MM-DD' -> 'sábado 7 de noviembre'. */
export function formatoFechaLarga(texto) {
  const f = aFechaLocal(texto);
  return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
}

/** 'AAAA-MM-DD' -> 'Sáb 7 nov'. */
export function formatoFechaCorta(texto) {
  const f = aFechaLocal(texto);
  const dia = DIAS[f.getDay()].slice(0, 3);
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)}`;
}

/** 'AAAA-MM-DD' -> '29 oct 2026' (tablas del panel). */
export function formatoFechaTabla(texto) {
  const f = aFechaLocal(texto);
  return `${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)} ${f.getFullYear()}`;
}

export const capitalizar = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** 39900 -> '$39.900' */
export function formatoPrecio(valor) {
  return '$' + Math.round(Number(valor)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Fecha y hora actuales en Bucaramanga, sin importar la zona
 * horaria del dispositivo. Devuelve { fecha: 'AAAA-MM-DD', minutos }.
 */
export function ahoraBogota(referencia = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(referencia);
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return { fecha: `${v.year}-${v.month}-${v.day}`, minutos: Number(v.hour) * 60 + Number(v.minute) };
}

export const nombreZona = (zona) => (zona === 'terraza' ? 'Terraza' : 'Salón');
