// Página de inicio: portada y consulta rápida de disponibilidad.
// La consulta lleva a mesas.html con la fecha, hora y personas elegidas.
import * as api from './api.js';
import { ahoraBogota, formatoHora, formatoFechaCorta, nombreZona } from './formato.js';
import { mesaLibreA } from './disponibilidad.js';
import { $, esc, etiqueta, pizza } from './ui.js';
import { montarLayout, pintarHorariosPie } from './layout.js';
import { prepararConsulta, deshabilitarConsulta } from './consulta.js';

const ahora = ahoraBogota();

montarLayout('inicio');
$('#portada-pizza').innerHTML = pizza('margherita', 480);
$('#llamado-pizza').innerHTML = pizza('pepperoni', 260);
cargar();

async function cargar() {
  try {
    const [mesas, horarios] = await Promise.all([api.obtenerMesasActivas(), api.obtenerHorarios()]);
    const activos = horarios.filter((h) => h.activo);
    pintarHorariosPie(activos);
    const sel = prepararConsulta({
      horarios: activos,
      ahora,
      alConsultar: (s) => { location.href = `mesas.html?${new URLSearchParams({ fecha: s.fecha, hora: s.hora, personas: s.personas })}`; },
    });
    if (sel) await pintarTarjetaPortada(mesas, activos, sel);
  } catch {
    // Sin conexión: la portada sigue siendo útil y el formulario se desactiva.
    deshabilitarConsulta();
    $('#leyenda-duracion').textContent = 'No pudimos consultar la disponibilidad en este momento.';
  }
}

/** Tarjeta flotante con una mesa libre para la primera hora disponible. */
async function pintarTarjetaPortada(mesas, horarios, sel) {
  const ocupacion = await api.obtenerOcupacion(sel.fecha, sel.fecha);
  const mesa = mesas.find((m) => mesaLibreA({ horarios, ocupacion, mesaId: Number(m.id), fecha: sel.fecha, hora: sel.hora, ahora }));
  const tarjeta = $('#portada-tarjeta');
  if (!mesa) { tarjeta.hidden = true; return; }
  const cuando = sel.fecha === ahora.fecha ? 'Hoy' : formatoFechaCorta(sel.fecha);
  tarjeta.innerHTML = `${etiqueta('libre')}<div><strong>${esc(mesa.nombre)} · ${nombreZona(mesa.zona)}</strong>${cuando}, ${formatoHora(sel.hora)} · ${mesa.capacidad} personas</div>`;
  tarjeta.hidden = false;
}
