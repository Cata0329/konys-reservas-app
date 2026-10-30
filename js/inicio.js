// Página de inicio: consulta rápida, mesas con disponibilidad y carta digital.
import * as api from './api.js';
import { config, errorConfiguracion } from './supabase.js';
import {
  ahoraBogota, formatoHora, formatoFechaCorta, formatoFechaLarga, formatoPrecio,
  nombreZona, nombreDiaIso, capitalizar,
} from './formato.js';
import { mesaLibreA, proximasFechasAbiertas, horasDelDia, jornadasDelDia } from './disponibilidad.js';
import {
  $, $$, esc, icono, etiqueta, etiquetaPlato, alerta, estadoVacio, pizza,
  ilustracionMesa, ilustracionPlato, imagenOIlustracion,
} from './ui.js';

const estado = {
  ahora: ahoraBogota(),
  mesas: [],
  horarios: [],
  ocupacion: [],
  categorias: [],
  platos: [],
  fecha: null,
  hora: null,
  zona: '',
  personas: 0,
  categoria: 'pizzas',
};

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
// Los scripts type="module" se ejecutan cuando el HTML ya está listo.
iniciar();

async function iniciar() {
  pintarIconos();
  prepararMenu();
  $('#portada-pizza').innerHTML = pizza('margherita', 480);
  $('#llamado-pizza').innerHTML = pizza('pepperoni', 260);
  $('#anio').textContent = estado.ahora.fecha.slice(0, 4);
  pintarContacto();
  prepararFiltros();

  if (errorConfiguracion) {
    $('#aviso-config').innerHTML = `<div class="aviso-config"><div class="contenedor">${icono('aviso')}${esc(errorConfiguracion)}</div></div>`;
  }

  // Cada bloque carga por separado: si la carta falla, las mesas siguen funcionando.
  await Promise.all([cargarMesas(), cargarCarta()]);
}

function pintarIconos(raiz = document) {
  $$('[data-icono]', raiz).forEach((n) => { n.outerHTML = icono(n.dataset.icono); });
}

function prepararMenu() {
  const cabecera = $('#cabecera');
  const boton = $('.cabecera__menu');
  boton.addEventListener('click', () => {
    const abierto = cabecera.classList.toggle('abierta');
    boton.setAttribute('aria-expanded', String(abierto));
    boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  });
  $$('#nav a').forEach((a) => a.addEventListener('click', () => {
    cabecera.classList.remove('abierta');
    boton.setAttribute('aria-expanded', 'false');
  }));
}

function pintarContacto() {
  const items = [];
  if (config.CONTACTO_WHATSAPP) {
    const numero = config.CONTACTO_WHATSAPP.replace(/[^\d]/g, '');
    items.push(`<li>${icono('telefono')}<a href="https://wa.me/${esc(numero)}" rel="noopener">${esc(config.CONTACTO_WHATSAPP)}</a></li>`);
  }
  if (config.CONTACTO_INSTAGRAM) {
    const usuario = config.CONTACTO_INSTAGRAM.replace(/^@/, '');
    items.push(`<li>${icono('instagram')}<a href="https://instagram.com/${esc(usuario)}" rel="noopener">@${esc(usuario)}</a></li>`);
  }
  if (items.length) $('#pie-contacto').innerHTML = `<h3 class="pie__subtitulo">Escríbenos</h3><ul>${items.join('')}</ul>`;
}

// ---------------------------------------------------------------------
// Mesas y consulta de disponibilidad
// ---------------------------------------------------------------------
async function cargarMesas() {
  try {
    const [mesas, horarios] = await Promise.all([api.obtenerMesasActivas(), api.obtenerHorarios()]);
    estado.mesas = mesas;
    estado.horarios = horarios.filter((h) => h.activo);
    pintarHorariosPie();
    prepararConsulta();
    await actualizarDisponibilidad();
  } catch (e) {
    $('#mesas-contexto').textContent = 'No pudimos cargar la disponibilidad.';
    $('#mesas-lista').innerHTML = alerta('error', 'No pudimos cargar las mesas.', e.message,
      '<div class="alerta__acciones"><button class="btn btn--verde btn--pequeno" type="button" id="reintentar-mesas">Reintentar</button></div>');
    $('#reintentar-mesas').addEventListener('click', () => {
      $('#mesas-lista').innerHTML = '<div class="esqueleto"><span></span><span></span><span></span></div>';
      cargarMesas();
    });
    ['#consulta-fecha', '#consulta-hora', '#btn-consulta'].forEach((s) => { $(s).disabled = true; });
  }
}

function prepararConsulta() {
  const selFecha = $('#consulta-fecha');
  const fechas = proximasFechasAbiertas(estado.horarios, estado.ahora, 21)
    .filter((f) => horasDelDia(estado.horarios, f, estado.ahora).length);
  if (!fechas.length) {
    selFecha.innerHTML = '<option>Sin fechas disponibles</option>';
    return;
  }
  selFecha.innerHTML = fechas.map((f) => `<option value="${f}">${f === estado.ahora.fecha ? 'Hoy, ' : ''}${esc(formatoFechaCorta(f))}</option>`).join('');
  estado.fecha = fechas[0];
  selFecha.disabled = false;
  pintarHorasConsulta();
  const duracion = estado.horarios[0]?.duracion_min ?? 60;
  $('#leyenda-duracion').textContent = `Cada reserva dura ${duracion} min.`;

  selFecha.addEventListener('change', () => {
    estado.fecha = selFecha.value;
    pintarHorasConsulta();
  });
  $('#consulta-hora').addEventListener('change', (e) => { estado.hora = e.target.value; });
  $('#form-consulta').addEventListener('submit', async (e) => {
    e.preventDefault();
    estado.personas = Number($('#consulta-personas').value);
    marcarChips('[data-personas]', String(estado.personas));
    await actualizarDisponibilidad();
    $('#mesas').scrollIntoView();
    $('#titulo-mesas').focus({ preventScroll: true });
  });
}

function pintarHorasConsulta() {
  const horas = horasDelDia(estado.horarios, estado.fecha, estado.ahora);
  const selHora = $('#consulta-hora');
  const preferida = horas.includes('20:00') ? '20:00' : horas[0];
  estado.hora = horas.includes(estado.hora) ? estado.hora : preferida;
  selHora.innerHTML = horas.map((h) => `<option value="${h}" ${h === estado.hora ? 'selected' : ''}>${formatoHora(h)}</option>`).join('');
  selHora.disabled = !horas.length;
  $('#btn-consulta').disabled = !horas.length;
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
    $('#mesas-contexto').textContent = `Disponibilidad para ${cuando} a las ${formatoHora(estado.hora)} Cada reserva dura ${duracionDelDia()} minutos.`;
  } catch (e) {
    estado.ocupacion = [];
    $('#mesas-contexto').textContent = `No pudimos consultar qué mesas están ocupadas (${e.message}). Elige una mesa para ver sus horarios.`;
  }
  pintarMesas();
}

function duracionDelDia() {
  return jornadasDelDia(estado.horarios, estado.fecha)[0]?.duracion_min ?? 60;
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
    return `<article class="tarjeta-mesa">
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

  pintarTarjetaPortada();
}

const abreviar = (nombre) => nombre.replace(/^mesa\s*/i, 'M');

function pintarTarjetaPortada() {
  const mesa = estado.mesas.find(estaLibre);
  const tarjeta = $('#portada-tarjeta');
  if (!mesa) { tarjeta.hidden = true; return; }
  const cuando = estado.fecha === estado.ahora.fecha ? 'Hoy' : formatoFechaCorta(estado.fecha);
  tarjeta.innerHTML = `${etiqueta('libre')}<div><strong>${esc(mesa.nombre)} · ${nombreZona(mesa.zona)}</strong>${cuando}, ${formatoHora(estado.hora)} · ${mesa.capacidad} personas</div>`;
  tarjeta.hidden = false;
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
  $$(selector).forEach((b) => {
    const clave = b.dataset.zona ?? b.dataset.personas;
    b.setAttribute('aria-pressed', String(clave === valor));
  });
}

function pintarHorariosPie() {
  if (!estado.horarios.length) return;
  const grupos = new Map();
  for (const h of estado.horarios) {
    const clave = `${h.jornada}|${h.hora_inicio}|${h.hora_fin}`;
    if (!grupos.has(clave)) grupos.set(clave, { ...h, dias: [] });
    grupos.get(clave).dias.push(h.dia_semana);
  }
  const lineas = [...grupos.values()]
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    .map((g) => {
      const dias = g.dias.length === 7 ? 'todos los días'
        : g.dias.map((d) => nombreDiaIso(d).slice(0, 3).toLowerCase()).join(', ');
      return `<li>${capitalizar(g.jornada)}: ${formatoHora(g.hora_inicio)} – ${formatoHora(g.hora_fin)} (${dias})</li>`;
    });
  $('#pie-horarios').innerHTML = lineas.join('');
}

// ---------------------------------------------------------------------
// Carta digital
// ---------------------------------------------------------------------
async function cargarCarta() {
  try {
    const [categorias, platos] = await Promise.all([api.obtenerCategorias(), api.obtenerCartaPublica()]);
    estado.categorias = categorias;
    estado.platos = platos;
    estado.categoria = categorias[0]?.id ?? 'pizzas';
    pintarPestanas();
    pintarCarta();
  } catch (e) {
    $('#carta-lista').innerHTML = alerta('error', 'No pudimos cargar la carta.', e.message,
      '<div class="alerta__acciones"><button class="btn btn--verde btn--pequeno" type="button" id="reintentar-carta">Reintentar</button></div>');
    $('#reintentar-carta').addEventListener('click', cargarCarta);
  }
}

function pintarPestanas() {
  const cont = $('#pestanas');
  cont.innerHTML = estado.categorias.map((c) =>
    `<button class="pestana" role="tab" id="tab-${esc(c.id)}" aria-controls="carta-lista" data-categoria="${esc(c.id)}"
      aria-selected="${c.id === estado.categoria}" tabindex="${c.id === estado.categoria ? 0 : -1}">${esc(c.nombre)}</button>`).join('');
  cont.addEventListener('click', (e) => {
    const b = e.target.closest('[data-categoria]');
    if (b) seleccionarCategoria(b.dataset.categoria);
  });
  // Flechas izquierda/derecha para moverse entre pestañas (patrón ARIA tabs).
  cont.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const ids = estado.categorias.map((c) => c.id);
    let i = ids.indexOf(estado.categoria);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    if (e.key === 'Home') i = 0;
    if (e.key === 'End') i = ids.length - 1;
    e.preventDefault();
    seleccionarCategoria(ids[i]);
    $(`#tab-${ids[i]}`).focus();
  });
}

function seleccionarCategoria(id) {
  estado.categoria = id;
  $$('.pestana').forEach((b) => {
    const activa = b.dataset.categoria === id;
    b.setAttribute('aria-selected', String(activa));
    b.tabIndex = activa ? 0 : -1;
  });
  pintarCarta();
}

function pintarCarta() {
  const panel = $('#carta-lista');
  panel.setAttribute('aria-labelledby', `tab-${estado.categoria}`);
  const platos = estado.platos.filter((p) => p.categoria_id === estado.categoria);
  if (!platos.length) {
    panel.innerHTML = estadoVacio({ titulo: 'Pronto habrá platos aquí', texto: 'Estamos preparando esta sección de la carta.', icono: 'carta' });
    return;
  }
  panel.innerHTML = `<div class="rejilla-platos">${platos.map((p, i) => `
    <article class="tarjeta-plato">
      <div class="tarjeta-plato__arte">${imagenOIlustracion(p.imagen_url, ilustracionPlato(p, i), p.nombre)}${etiquetaPlato(p.etiqueta)}</div>
      <div class="tarjeta-plato__cuerpo">
        <div class="tarjeta-plato__titulo"><h3>${esc(p.nombre)}</h3><span class="tarjeta-plato__precio">${formatoPrecio(p.precio)}</span></div>
        ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
      </div>
    </article>`).join('')}</div>`;
}
