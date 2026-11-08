// Validaciones de formularios (sin dependencias del DOM, probadas en tests/).
// Cada función devuelve un objeto { campo: 'mensaje' } con los errores;
// si está vacío, los datos son válidos. El servidor vuelve a validar todo.
import { aMinutos } from './formato.js';

const limpiar = (v) => String(v ?? '').trim();

export function validarDatosReserva({ nombre, personas, contacto }, mesa) {
  const errores = {};
  const n = limpiar(nombre);
  if (!n) errores.nombre = 'Escribe tu nombre completo para guardar la reserva.';
  else if (n.length < 3) errores.nombre = 'El nombre debe tener al menos 3 letras.';
  else if (n.length > 80) errores.nombre = 'El nombre no puede superar 80 caracteres.';

  const p = Number(personas);
  if (!Number.isInteger(p) || p < 1) errores.personas = 'Indica cuántas personas vienen.';
  else if (mesa && p > mesa.capacidad) {
    errores.personas = `La ${mesa.nombre} recibe hasta ${mesa.capacidad} personas. Reduce el grupo o elige una mesa más grande.`;
  }

  const c = limpiar(contacto);
  if (c.length > 40) errores.contacto = 'El contacto no puede superar 40 caracteres.';
  else if (c && !/^[+\d\s()-]{7,20}$/.test(c)) errores.contacto = 'Escribe un teléfono válido (solo números, espacios o +).';
  return errores;
}

export function validarMesa({ nombre, zona, capacidad }) {
  const errores = {};
  if (!limpiar(nombre)) errores.nombre = 'Escribe el nombre o número de la mesa.';
  else if (limpiar(nombre).length > 40) errores.nombre = 'Máximo 40 caracteres.';
  if (!['salon', 'terraza'].includes(zona)) errores.zona = 'Elige una zona.';
  const c = Number(capacidad);
  if (!Number.isInteger(c) || c < 1 || c > 12) errores.capacidad = 'La capacidad debe estar entre 1 y 12 personas.';
  return errores;
}

export function validarHorario({ hora_inicio, hora_fin, duracion_min }) {
  const errores = {};
  const d = Number(duracion_min);
  if (!hora_inicio) errores.hora_inicio = 'Indica la hora de inicio.';
  if (!hora_fin) errores.hora_fin = 'Indica la hora de cierre.';
  if (!Number.isInteger(d) || d < 15 || d > 240) errores.duracion_min = 'La duración debe estar entre 15 y 240 minutos.';
  if (hora_inicio && hora_fin && !errores.duracion_min) {
    const total = aMinutos(hora_fin) - aMinutos(hora_inicio);
    if (total <= 0) errores.hora_fin = 'El cierre debe ser posterior al inicio.';
    else if (total < d) errores.hora_fin = 'En la jornada debe caber al menos una reserva completa.';
  }
  return errores;
}

export function validarPlato({ nombre, categoria_id, precio, descripcion, subcategoria }) {
  const errores = {};
  if (!limpiar(nombre)) errores.nombre = 'Escribe el nombre del plato.';
  else if (limpiar(nombre).length > 80) errores.nombre = 'Máximo 80 caracteres.';
  if (!categoria_id) errores.categoria_id = 'Elige una categoría.';
  // El precio es opcional (vacío = "precio por confirmar"), pero si se escribe debe ser válido.
  const p = Number(precio);
  if (limpiar(precio) !== '' && (!Number.isInteger(p) || p < 0)) errores.precio = 'Escribe un precio válido en pesos, sin puntos ni decimales.';
  if (limpiar(descripcion).length > 600) errores.descripcion = 'Máximo 600 caracteres.';
  if (limpiar(subcategoria).length > 60) errores.subcategoria = 'Máximo 60 caracteres.';
  return errores;
}

export function validarCategoria({ id, nombre, orden, disponible_desde, disponible_hasta }, esNueva) {
  const errores = {};
  if (esNueva && !/^[a-z_]{2,40}$/.test(limpiar(id))) errores.id = 'Usa solo minúsculas sin tildes y guion bajo (ej.: menu_infantil).';
  if (!limpiar(nombre)) errores.nombre = 'Escribe el nombre de la categoría.';
  else if (limpiar(nombre).length > 60) errores.nombre = 'Máximo 60 caracteres.';
  if (limpiar(orden) !== '' && !Number.isInteger(Number(orden))) errores.orden = 'El orden debe ser un número entero.';
  if (Boolean(disponible_desde) !== Boolean(disponible_hasta)) errores.disponible_hasta = 'Indica las dos horas de la franja o ninguna.';
  else if (disponible_desde && aMinutos(disponible_hasta) <= aMinutos(disponible_desde)) errores.disponible_hasta = 'La hora final debe ser posterior a la inicial.';
  return errores;
}

export const tieneErrores = (errores) => Object.keys(errores).length > 0;
