// Encabezado y pie de página compartidos por las páginas públicas
// (index, mesas, carta, contacto). Cada página solo trae un <header id="cabecera">
// y un <footer id="pie"> vacíos y llama a montarLayout('<página>').
import { config, errorConfiguracion } from './supabase.js';
import { ahoraBogota, formatoHora, nombreDiaIso, capitalizar } from './formato.js';
import { $, $$, esc, icono } from './ui.js';

export const PAGINAS = [
  { id: 'inicio', texto: 'Inicio', href: 'index.html' },
  { id: 'mesas', texto: 'Mesas', href: 'mesas.html' },
  { id: 'carta', texto: 'Carta', href: 'carta.html' },
  { id: 'reservar', texto: 'Reservar', href: 'reservar.html' },
  { id: 'contacto', texto: 'Contacto', href: 'contacto.html' },
];

export function montarLayout(paginaActual) {
  const cabecera = $('#cabecera');
  cabecera.className = 'cabecera';
  cabecera.innerHTML = `
    <div class="contenedor cabecera__fila">
      <a href="index.html" class="logo" aria-label="Konys Pizza, inicio"><span class="logo__marca">Konys</span><span class="logo__sello">PIZZA</span></a>
      <nav class="nav" id="nav" aria-label="Principal">
        ${PAGINAS.map((p) => `<a href="${p.href}" data-pagina="${p.id}"${p.id === paginaActual ? ' aria-current="page"' : ''}>${p.texto}</a>`).join('')}
      </nav>
      <a class="btn btn--primario cabecera__cta" href="reservar.html">Reservar una mesa ${icono('flechaDerecha')}</a>
      <button class="cabecera__menu" type="button" aria-expanded="false" aria-controls="nav" aria-label="Abrir menú">${icono('menu')}</button>
    </div>`;

  const pie = $('#pie');
  pie.className = 'pie';
  pie.innerHTML = `
    <div class="contenedor">
      <div class="pie__grid">
        <div>
          <span class="logo"><span class="logo__marca">Konys</span></span>
          <p class="pie__lema">La pizza más icónica de la ciudad.</p>
        </div>
        <div>
          <h2 class="pie__titulo">Visítanos</h2>
          <address class="pie__direccion">Carrera 36 con calle 41<br>Bucaramanga, Santander<br>Colombia</address>
        </div>
        <div>
          <h2 class="pie__titulo">Horarios</h2>
          <ul id="pie-horarios">
            <li>Almuerzo: 12:30 p. m. – 2:30 p. m.</li>
            <li>Noche: 5:00 p. m. – 11:00 p. m.</li>
          </ul>
        </div>
        <div>
          <h2 class="pie__titulo">Servicios</h2>
          <ul>
            <li>Atención en el restaurante</li>
            <li>Domicilios por nuestros canales actuales</li>
            <li>Eventos</li>
          </ul>
          ${contactoHtml()}
        </div>
      </div>
      <div class="pie__base">
        <span>© ${ahoraBogota().fecha.slice(0, 4)} Konys Pizza · Bucaramanga</span>
        <span class="pie__enlaces"><a href="mi-reserva.html">Consultar mi reserva</a><a href="admin.html">Acceso administración</a></span>
      </div>
    </div>`;

  if (errorConfiguracion) {
    $('#aviso-config').innerHTML = `<div class="aviso-config"><div class="contenedor">${icono('aviso')}${esc(errorConfiguracion)}</div></div>`;
  }
  pintarIconos();
  prepararMenu();
}

/** Reemplaza <span data-icono="nombre"> del HTML estático por el SVG correspondiente. */
export function pintarIconos(raiz = document) {
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
}

function contactoHtml() {
  const items = [];
  if (config.CONTACTO_WHATSAPP) {
    const numero = config.CONTACTO_WHATSAPP.replace(/[^\d]/g, '');
    items.push(`<li>${icono('telefono')}<a href="https://wa.me/${esc(numero)}" rel="noopener">${esc(config.CONTACTO_WHATSAPP)}</a></li>`);
  }
  if (config.CONTACTO_INSTAGRAM) {
    const usuario = config.CONTACTO_INSTAGRAM.replace(/^@/, '');
    items.push(`<li>${icono('instagram')}<a href="https://instagram.com/${esc(usuario)}" rel="noopener">@${esc(usuario)}</a></li>`);
  }
  return items.length ? `<h2 class="pie__titulo pie__subtitulo">Escríbenos</h2><ul>${items.join('')}</ul>` : '';
}

/** Resume las jornadas activas (p. ej. "Almuerzo: 12:30 p. m. – 2:30 p. m. (todos los días)"). */
export function resumenHorarios(horarios) {
  const grupos = new Map();
  for (const h of horarios.filter((x) => x.activo !== false)) {
    const clave = `${h.jornada}|${h.hora_inicio}|${h.hora_fin}`;
    if (!grupos.has(clave)) grupos.set(clave, { ...h, dias: [] });
    grupos.get(clave).dias.push(h.dia_semana);
  }
  return [...grupos.values()]
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    .map((g) => {
      const dias = g.dias.length === 7 ? 'todos los días'
        : g.dias.sort().map((d) => nombreDiaIso(d).slice(0, 3).toLowerCase()).join(', ');
      return `${capitalizar(g.jornada)}: ${formatoHora(g.hora_inicio)} – ${formatoHora(g.hora_fin)} (${dias})`;
    });
}

/** Actualiza el pie con los horarios reales de la base (si la página los cargó). */
export function pintarHorariosPie(horarios) {
  const lineas = resumenHorarios(horarios);
  if (lineas.length) $('#pie-horarios').innerHTML = lineas.map((l) => `<li>${esc(l)}</li>`).join('');
}
