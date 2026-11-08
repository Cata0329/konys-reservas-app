// Página «Contacto»: dirección, horario de atención por día (desde Supabase) y canales.
import * as api from './api.js';
import { formatoHora, nombreDiaIso, capitalizar } from './formato.js';
import { $, esc, alerta } from './ui.js';
import { montarLayout, pintarHorariosPie } from './layout.js';

montarLayout('contacto');
cargarHorarios();

async function cargarHorarios() {
  const zona = $('#horario-semana');
  try {
    const horarios = (await api.obtenerHorarios()).filter((h) => h.activo);
    pintarHorariosPie(horarios);
    zona.innerHTML = `<table class="tabla-horario">
      <caption class="visualmente-oculto">Horario de atención por día</caption>
      <tbody>${[1, 2, 3, 4, 5, 6, 7].map((d) => {
    const jornadas = horarios.filter((h) => h.dia_semana === d).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    return `<tr><th scope="row">${nombreDiaIso(d)}</th><td>${jornadas.length
      ? jornadas.map((j) => `${esc(capitalizar(j.jornada))}: ${formatoHora(j.hora_inicio)} – ${formatoHora(j.hora_fin)}`).join('<br>')
      : 'Cerrado'}</td></tr>`;
  }).join('')}</tbody></table>`;
  } catch (e) {
    zona.innerHTML = alerta('error', 'No pudimos cargar el horario.', e.message);
  }
}
