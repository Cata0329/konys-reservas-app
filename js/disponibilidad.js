// Cálculo de horarios disponibles en el navegador.
//
// IMPORTANTE: esto solo sirve para MOSTRAR la disponibilidad. La decisión
// final la toma la base de datos en crear_reserva() con una restricción de
// exclusión, así que dos clientes nunca pueden quedarse con el mismo horario.
import { aMinutos, aHora, diaIso, sumarDias } from './formato.js';

/** Las horas de inicio se ofrecen cada 30 minutos (igual que en el SQL). */
export const PASO_MINUTOS = 30;
/** Se puede reservar hasta 60 días adelante (igual que en el SQL). */
export const DIAS_MAXIMOS = 60;

/** Jornadas activas de una fecha, ordenadas por hora. */
export function jornadasDelDia(horarios, fecha) {
  const dia = diaIso(fecha);
  return horarios
    .filter((h) => h.activo !== false && h.dia_semana === dia)
    .sort((a, b) => aMinutos(a.hora_inicio) - aMinutos(b.hora_inicio));
}

/** ¿Se cruzan [inicioA, finA) y [inicioB, finB)? (en minutos) */
export const seCruzan = (inicioA, finA, inicioB, finB) => inicioA < finB && inicioB < finA;

/**
 * Genera los horarios de una mesa en una fecha.
 * Devuelve [{ jornada, hora_inicio, hora_fin, inicio, fin, horas: [{ hora, fin, estado }] }]
 * con estado 'libre' | 'ocupado' | 'pasado'.
 */
export function horariosDeMesa({ horarios, ocupacion, mesaId, fecha, ahora }) {
  const ocupadas = ocupacion
    .filter((o) => o.mesa_id === mesaId && o.fecha === fecha)
    .map((o) => [aMinutos(o.hora_inicio), aMinutos(o.hora_fin)]);

  return jornadasDelDia(horarios, fecha).map((j) => {
    const inicio = aMinutos(j.hora_inicio);
    const fin = aMinutos(j.hora_fin);
    const horas = [];
    for (let t = inicio; t + j.duracion_min <= fin; t += PASO_MINUTOS) {
      const tFin = t + j.duracion_min;
      let estado = 'libre';
      if (fecha < ahora.fecha || (fecha === ahora.fecha && t <= ahora.minutos)) estado = 'pasado';
      else if (ocupadas.some(([a, b]) => seCruzan(t, tFin, a, b))) estado = 'ocupado';
      horas.push({ hora: aHora(t), fin: aHora(tFin), estado });
    }
    return { jornada: j.jornada, hora_inicio: aHora(inicio), hora_fin: aHora(fin), duracion_min: j.duracion_min, horas };
  });
}

/** Lista plana de horas libres de una mesa en una fecha. */
export function horasLibres(params) {
  return horariosDeMesa(params).flatMap((j) => j.horas.filter((h) => h.estado === 'libre'));
}

/**
 * Estado de un día del calendario para una mesa:
 * 'cerrado' (sin jornadas, pasado o fuera de rango), 'sin-cupo' o 'disponible'.
 */
export function estadoDia({ horarios, ocupacion, mesaId, fecha, ahora }) {
  if (fecha < ahora.fecha || fecha > sumarDias(ahora.fecha, DIAS_MAXIMOS)) return 'cerrado';
  if (jornadasDelDia(horarios, fecha).length === 0) return 'cerrado';
  return horasLibres({ horarios, ocupacion, mesaId, fecha, ahora }).length > 0 ? 'disponible' : 'sin-cupo';
}

/** ¿La mesa está libre en esa fecha y hora exacta? */
export function mesaLibreA({ horarios, ocupacion, mesaId, fecha, hora, ahora }) {
  return horasLibres({ horarios, ocupacion, mesaId, fecha, ahora }).some((h) => h.hora === hora);
}

/** Próximas fechas (desde hoy) en las que el restaurante atiende. */
export function proximasFechasAbiertas(horarios, ahora, cantidad = 14) {
  const fechas = [];
  for (let i = 0; i <= DIAS_MAXIMOS && fechas.length < cantidad; i++) {
    const f = sumarDias(ahora.fecha, i);
    if (jornadasDelDia(horarios, f).length) fechas.push(f);
  }
  return fechas;
}

/** Todas las horas de inicio posibles de una fecha (para cualquier mesa). */
export function horasDelDia(horarios, fecha, ahora) {
  return horariosDeMesa({ horarios, ocupacion: [], mesaId: null, fecha, ahora })
    .flatMap((j) => j.horas.filter((h) => h.estado === 'libre').map((h) => h.hora));
}
