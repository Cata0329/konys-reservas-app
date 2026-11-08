// Formulario «Consulta disponibilidad» (fecha, hora y personas), usado en
// el inicio (lleva a mesas.html) y en la página de mesas (filtra en el sitio).
import { formatoHora, formatoFechaCorta } from './formato.js';
import { proximasFechasAbiertas, horasDelDia } from './disponibilidad.js';
import { $, esc } from './ui.js';

/**
 * Llena los selectores con las fechas y horas en que el restaurante atiende.
 * `inicial` permite preseleccionar {fecha, hora, personas} (p. ej. desde la URL).
 * Devuelve la selección {fecha, hora, personas} o null si no hay horarios.
 * `alConsultar(seleccion)` se llama al enviar el formulario.
 */
export function prepararConsulta({ horarios, ahora, inicial = {}, alConsultar }) {
  const selFecha = $('#consulta-fecha');
  const selHora = $('#consulta-hora');
  const selPersonas = $('#consulta-personas');
  const fechas = proximasFechasAbiertas(horarios, ahora, 21).filter((f) => horasDelDia(horarios, f, ahora).length);
  if (!fechas.length) {
    selFecha.innerHTML = '<option>Sin fechas disponibles</option>';
    selHora.innerHTML = '<option>—</option>';
    return null;
  }
  const sel = {
    fecha: fechas.includes(inicial.fecha) ? inicial.fecha : fechas[0],
    hora: inicial.hora ?? null,
    personas: Number(inicial.personas) || 2,
  };
  selFecha.innerHTML = fechas.map((f) => `<option value="${f}">${f === ahora.fecha ? 'Hoy, ' : ''}${esc(formatoFechaCorta(f))}</option>`).join('');
  selFecha.value = sel.fecha;
  selFecha.disabled = false;
  if ([...selPersonas.options].some((o) => Number(o.value) === sel.personas)) selPersonas.value = String(sel.personas);

  const pintarHoras = () => {
    const horas = horasDelDia(horarios, sel.fecha, ahora);
    const preferida = horas.includes('20:00') ? '20:00' : horas[0];
    sel.hora = horas.includes(sel.hora) ? sel.hora : preferida;
    selHora.innerHTML = horas.map((h) => `<option value="${h}" ${h === sel.hora ? 'selected' : ''}>${formatoHora(h)}</option>`).join('');
    selHora.disabled = !horas.length;
    $('#btn-consulta').disabled = !horas.length;
  };
  pintarHoras();
  const duracion = horarios[0]?.duracion_min ?? 60;
  $('#leyenda-duracion').textContent = `Cada reserva dura ${duracion} min.`;

  selFecha.addEventListener('change', () => { sel.fecha = selFecha.value; pintarHoras(); });
  selHora.addEventListener('change', () => { sel.hora = selHora.value; });
  selPersonas.addEventListener('change', () => { sel.personas = Number(selPersonas.value); });
  $('#form-consulta').addEventListener('submit', (e) => {
    e.preventDefault();
    sel.personas = Number(selPersonas.value);
    alConsultar({ ...sel });
  });
  return sel;
}

/** Deshabilita el formulario cuando no se pudieron cargar los datos. */
export function deshabilitarConsulta() {
  ['#consulta-fecha', '#consulta-hora', '#btn-consulta'].forEach((s) => { const n = $(s); if (n) n.disabled = true; });
}
