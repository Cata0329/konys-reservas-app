// Página «Mesas»: disponibilidad por fecha/hora, plano del salón y la terraza,
// filtros por zona y personas, y enlace al flujo de reserva.
// Acepta ?fecha=AAAA-MM-DD&hora=HH:MM&personas=N (enviados desde el inicio).
import * as api from './api.js';
import { ahoraBogota, formatoHora, formatoFechaLarga, nombreZona } from './formato.js';
import { mesaLibreA, jornadasDelDia } from './disponibilidad.js';
import { $, $$, esc, icono, etiqueta, alerta, estadoVacio, ilustracionMesa, imagenOIlustracion } from './ui.js';
import { montarLayout, pintarHorariosPie } from './layout.js';
import { prepararConsulta, deshabilitarConsulta } from './consulta.js';

const params = new URLSearchParams(location.search);
const estado = {
  ahora: ahoraBogota(),
  mesas: [],
  horarios: [],
  ocupacion: [],
  fecha: null,
  hora: null,
  zona: '',
  personas: Number(params.get('personas')) || 0,
};

montarLayout('mesas');
prepararFiltros();
marcarChips('[data-personas]', String(estado.personas));
cargarMesas();

async function cargarMesas() {
  try {
    const [mesas, horarios] = await Promise.all([api.obtenerMesasActivas(), api.obtenerHorarios()]);
    estado.mesas = mesas;
    estado.horarios = horarios.filter((h) => h.activo);
    pintarHorariosPie(estado.horarios);
    const sel = prepararConsulta({
      horarios: estado.horarios,
      ahora: estado.ahora,
      inicial: { fecha: params.get('fecha'), hora: params.get('hora'), personas: params.get('personas') },
      alConsultar: async (s) => {
        Object.assign(estado, { fecha: s.fecha, hora: s.hora, personas: s.personas });
        marcarChips('[data-personas]', String(s.personas));
        history.replaceState(null, '', `?${new URLSearchParams({ fecha: s.fecha, hora: s.hora, personas: s.personas })}`);
        await actualizarDisponibilidad();
        $('#titulo-mesas').focus({ preventScroll: true });
      },
    });
    if (sel) Object.assign(estado, { fecha: sel.fecha, hora: sel.hora });
    await actualizarDisponibilidad();
  } catch (e) {
    $('#mesas-contexto').textContent = 'No pudimos cargar la disponibilidad.';
    $('#mesas-lista').innerHTML = alerta('error', 'No pudimos cargar las mesas.', e.message,
      '<div class="alerta__acciones"><button class="btn btn--verde btn--pequeno" type="button" id="reintentar-mesas">Reintentar</button></div>');
    $('#reintentar-mesas').addEventListener('click', () => {
      $('#mesas-lista').innerHTML = '<div class="esqueleto"><span></span><span></span><span></span></div>';
      cargarMesas();
    });
    deshabilitarConsulta();
  }
}

async function actualizarDisponibilidad() {
  if (!estado.fecha || !estado.hora) {
    $('#mesas-contexto').textContent = 'Por ahora no hay horarios de atención configurados.';
    pintarMesas();
    return;
  }
  $('#mesas-contexto').textContent = 'Consultando disponibilidad…';
  try {
    estado.ocupacion = await api.obtenerOcupacion(estado.fecha, estado.fecha);
    const cuando = estado.fecha === estado.ahora.fecha ? 'hoy' : `el ${formatoFechaLarga(estado.fecha)}`;
    const duracion = jornadasDelDia(estado.horarios, estado.fecha)[0]?.duracion_min ?? 60;
    $('#mesas-contexto').textContent = `Disponibilidad para ${cuando} a las ${formatoHora(estado.hora)} Cada reserva dura ${duracion} minutos.`;
  } catch (e) {
    estado.ocupacion = [];
    $('#mesas-contexto').textContent = `No pudimos consultar qué mesas están ocupadas (${e.message}). Elige una mesa para ver sus horarios.`;
  }
  pintarMesas();
}

const estaLibre = (mesa) => Boolean(estado.fecha && estado.hora) && mesaLibreA({
  horarios: estado.horarios, ocupacion: estado.ocupacion, mesaId: Number(mesa.id),
  fecha: estado.fecha, hora: estado.hora, ahora: estado.ahora,
});

const pasaFiltros = (m) => (!estado.zona || m.zona === estado.zona) && m.capacidad >= estado.personas;

function enlaceReserva(mesa, libre) {
  const p = new URLSearchParams({ mesa: mesa.id });
  if (estado.fecha) p.set('fecha', estado.fecha);
  if (libre) {
    p.set('hora', estado.hora);
    if (estado.personas) p.set('personas', Math.min(estado.personas, mesa.capacidad));
  }
  return `reservar.html?${p}`;
}

const abreviar = (nombre) => nombre.replace(/^mesa\s*/i, 'M');

function pintarMesas() {
  const lista = $('#mesas-lista');
  if (!estado.mesas.length) {
    $('#planos').innerHTML = '';
    lista.innerHTML = estadoVacio({ titulo: 'Aún no hay mesas disponibles', texto: 'Vuelve pronto: estamos preparando el salón.', icono: 'mesa' });
    return;
  }
  const visibles = estado.mesas.filter(pasaFiltros);

  $('#planos').innerHTML = ['salon', 'terraza'].map((zona) => {
    const mesasZona = estado.mesas.filter((m) => m.zona === zona);
    if (!mesasZona.length) return '';
    return `<div class="plano plano--${zona}">
      <div class="plano__cabecera"><h3>Plano ${zona === 'salon' ? 'del salón' : 'de la terraza'}</h3><span>Esquema ilustrativo</span></div>
      <div class="plano__mesas">${mesasZona.map((m) => {
    const libre = estaLibre(m);
    return `<a class="plano__mesa plano__mesa--${libre ? 'libre' : 'ocupada'}" href="${enlaceReserva(m, libre)}" ${pasaFiltros(m) ? '' : 'hidden'}
          aria-label="${esc(m.nombre)}, ${libre ? 'libre' : 'ocupada'}, ${m.capacidad} personas">
          <span class="plano__forma ${m.capacidad > 4 ? 'plano__forma--grande' : ''}">${esc(abreviar(m.nombre))}</span>
          <span>${libre ? '✓ Libre' : '✕ Ocupada'} · ${m.capacidad} pers.</span>
        </a>`;
  }).join('')}</div></div>`;
  }).join('');

  if (!visibles.length) {
    lista.innerHTML = estadoVacio({
      titulo: 'No hay mesas con esos filtros',
      texto: 'Prueba con otra zona o con un número de personas diferente.',
      accion: '<button type="button" class="btn btn--secundario" id="limpiar-filtros">Limpiar filtros</button>',
      icono: 'mesa',
    });
    $('#limpiar-filtros').addEventListener('click', () => {
      estado.zona = '';
      estado.personas = 0;
      marcarChips('[data-zona]', '');
      marcarChips('[data-personas]', '0');
      pintarMesas();
    });
    return;
  }

  lista.innerHTML = `<div class="rejilla-mesas">${visibles.map((m) => {
    const libre = estaLibre(m);
    return `<article class="tarjeta-mesa" data-testid="mesa" data-mesa-id="${esc(m.id)}" data-estado="${libre ? 'libre' : 'ocupada'}">
      <div class="tarjeta-mesa__arte">${imagenOIlustracion(m.foto_url, ilustracionMesa(m), `Foto de ${m.nombre}`)}</div>
      <div class="tarjeta-mesa__cuerpo">
        <div class="tarjeta-mesa__titulo"><h3>${esc(m.nombre)}</h3>${etiqueta(libre ? 'disponible' : 'ocupada')}</div>
        <p class="tarjeta-mesa__meta">${icono('personas')}${nombreZona(m.zona)} · hasta ${m.capacidad} personas</p>
        ${libre
    ? `<a class="btn btn--verde btn--bloque" href="${enlaceReserva(m, true)}" aria-label="Reservar ${esc(m.nombre)}">Reservar</a>`
    : `<a class="btn btn--secundario btn--bloque" href="${enlaceReserva(m, false)}" aria-label="Ver horarios de ${esc(m.nombre)}">Ver horarios</a>`}
      </div>
    </article>`;
  }).join('')}</div>`;
}

function prepararFiltros() {
  $$('[data-zona]').forEach((b) => b.addEventListener('click', () => {
    estado.zona = b.dataset.zona;
    marcarChips('[data-zona]', estado.zona);
    pintarMesas();
  }));
  $$('[data-personas]').forEach((b) => b.addEventListener('click', () => {
    estado.personas = Number(b.dataset.personas);
    marcarChips('[data-personas]', b.dataset.personas);
    pintarMesas();
  }));
}

function marcarChips(selector, valor) {
  const botones = $$(selector);
  const hay = botones.some((b) => (b.dataset.zona ?? b.dataset.personas) === valor);
  botones.forEach((b) => {
    const clave = b.dataset.zona ?? b.dataset.personas;
    // Si el valor no tiene chip propio (p. ej. 5 personas), ninguno queda marcado.
    b.setAttribute('aria-pressed', String(hay && clave === valor));
  });
}
