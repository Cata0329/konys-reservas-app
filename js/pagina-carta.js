// Página «Carta»: carta oficial de Konys leída desde Supabase, por categorías,
// con buscador y foto de respaldo si una imagen no carga.
import * as api from './api.js';
import { ahoraBogota, aMinutos, formatoHora, formatoPrecio } from './formato.js';
import { $, $$, esc, alerta, estadoVacio, etiquetaPlato, ilustracionPlato } from './ui.js';
import { montarLayout } from './layout.js';

const RECOMENDADOS = { id: 'recomendados', nombre: 'Recomendados', subtitulo: 'Lo más pedido por nuestros clientes.' };
const estado = { categorias: [], platos: [], categoria: null, busqueda: '' };

montarLayout('carta');
prepararFlechas();
prepararBuscador();
prepararFotosDeRespaldo();
cargarCarta();

async function cargarCarta() {
  try {
    const [categorias, platos] = await Promise.all([api.obtenerCategorias(), api.obtenerCartaPublica()]);
    estado.platos = platos;
    // Solo se muestran pestañas con platos visibles; "Recomendados" agrupa los marcados por Konys.
    const conPlatos = categorias.filter((c) => platos.some((p) => p.categoria_id === c.id));
    estado.categorias = platos.some((p) => p.recomendado) ? [RECOMENDADOS, ...conPlatos] : conPlatos;
    estado.categoria = estado.categorias.find((c) => c.id === new URLSearchParams(location.search).get('categoria'))?.id
      ?? estado.categorias[0]?.id ?? null;
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
    `<button class="pestana" type="button" role="tab" id="tab-${esc(c.id)}" aria-controls="carta-lista" data-categoria="${esc(c.id)}"
      aria-selected="${c.id === estado.categoria}" tabindex="${c.id === estado.categoria ? 0 : -1}">${esc(c.nombre)}</button>`).join('');
  if (cont.dataset.listo) return; // al reintentar no se duplican los oyentes
  cont.dataset.listo = '1';
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
  if (estado.busqueda) {
    estado.busqueda = '';
    $('#buscar-carta').value = '';
  }
  $$('.pestana').forEach((b) => {
    const activa = b.dataset.categoria === id;
    b.setAttribute('aria-selected', String(activa));
    b.tabIndex = activa ? 0 : -1;
    if (activa) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  pintarCarta();
}

/** Flechas de la barra de categorías y desvanecido de los bordes según el desplazamiento. */
function prepararFlechas() {
  const barra = $('#pestanas');
  const nav = $('#carta-nav');
  const actualizar = () => {
    const inicio = barra.scrollLeft <= 2;
    const fin = barra.scrollLeft + barra.clientWidth >= barra.scrollWidth - 2;
    nav.toggleAttribute('data-inicio', inicio);
    nav.toggleAttribute('data-fin', fin);
    $('#pestanas-anterior').disabled = inicio;
    $('#pestanas-siguiente').disabled = fin;
  };
  const mover = (sentido) => barra.scrollBy({ left: sentido * barra.clientWidth * 0.7 });
  $('#pestanas-anterior').addEventListener('click', () => mover(-1));
  $('#pestanas-siguiente').addEventListener('click', () => mover(1));
  barra.addEventListener('scroll', actualizar, { passive: true });
  window.addEventListener('resize', actualizar);
  new MutationObserver(actualizar).observe(barra, { childList: true });
  actualizar();
}

function prepararBuscador() {
  const campo = $('#buscar-carta');
  campo.addEventListener('input', () => {
    estado.busqueda = campo.value.trim().toLocaleLowerCase('es');
    pintarCarta();
  });
}

/** Si una foto no carga, se cambia por la ilustración (el error de red no se repite). */
function prepararFotosDeRespaldo() {
  $('#carta-lista').addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.dataset.respaldo) return;
    const plato = estado.platos.find((p) => String(p.id) === img.dataset.plato);
    const arte = img.closest('.tarjeta-plato__arte');
    img.dataset.respaldo = '1';
    img.remove();
    arte.classList.remove('tarjeta-plato__arte--foto');
    arte.insertAdjacentHTML('afterbegin', `${ilustracionPlato(plato ?? {})}<span class="tarjeta-plato__sin-foto">Foto no disponible</span>`);
  }, true);
}

/** Aviso de franja horaria (p. ej. Menú Almuerzos: de 12:00 a 2:30 p. m.). */
function avisoFranja(c) {
  if (!c.disponible_desde) return '';
  const ahora = ahoraBogota().minutos;
  const [desde, hasta] = [c.disponible_desde, c.disponible_hasta].map(aMinutos);
  const abierto = ahora >= desde && ahora < hasta;
  const rango = `${formatoHora(c.disponible_desde)} a ${formatoHora(c.disponible_hasta)}`;
  return alerta(abierto ? 'exito' : 'info', abierto ? 'Disponible ahora.' : 'Fuera de horario.',
    `Esta sección se sirve solo de ${rango}.`);
}

function tarjetaPlato(p) {
  const etiquetas = (p.etiquetas ?? []).map((t) => `<span class="sello sello--rosa">${esc(t)}</span>`).join('') || etiquetaPlato(p.etiqueta);
  const opciones = Array.isArray(p.variantes) && p.variantes.length
    ? `<p class="tarjeta-plato__opciones">Opciones: ${p.variantes.map((v) => esc(v.nombre)).join(', ')}</p>` : '';
  // Foto oficial si existe; si no, una ilustración rotulada como tal (no se hace pasar por foto).
  const arte = p.imagen_url
    ? `<img src="${esc(p.imagen_url)}" alt="Foto de ${esc(p.nombre)}" loading="lazy" decoding="async" width="640" height="400" data-plato="${esc(p.id)}">`
    : `${ilustracionPlato(p)}<span class="tarjeta-plato__sin-foto">Ilustración · sin foto oficial</span>`;
  return `
    <article class="tarjeta-plato" data-testid="plato">
      <div class="tarjeta-plato__arte ${p.imagen_url ? 'tarjeta-plato__arte--foto' : ''}">${arte}
        ${etiquetas ? `<div class="tarjeta-plato__sellos">${etiquetas}</div>` : ''}</div>
      <div class="tarjeta-plato__cuerpo">
        <div class="tarjeta-plato__titulo"><h3>${esc(p.nombre)}</h3><span class="tarjeta-plato__precio">${formatoPrecio(p.precio)}</span></div>
        ${p.descripcion ? `<p class="tarjeta-plato__descripcion">${esc(p.descripcion)}</p>` : ''}
        ${opciones}
      </div>
    </article>`;
}

const rejilla = (platos) => `<div class="rejilla-platos">${platos.map(tarjetaPlato).join('')}</div>`;

function pintarCarta() {
  const panel = $('#carta-lista');
  if (estado.busqueda) {
    const encontrados = estado.platos.filter((p) =>
      `${p.nombre} ${p.descripcion ?? ''}`.toLocaleLowerCase('es').includes(estado.busqueda));
    $('#resultado-busqueda').textContent = `${encontrados.length} ${encontrados.length === 1 ? 'plato encontrado' : 'platos encontrados'}.`;
    panel.removeAttribute('aria-labelledby');
    panel.innerHTML = encontrados.length
      ? rejilla(encontrados)
      : estadoVacio({ titulo: 'No encontramos ese plato', texto: 'Prueba con otra palabra, por ejemplo «hawaiana» o «limonada».', icono: 'buscar' });
    return;
  }
  $('#resultado-busqueda').textContent = '';
  const categoria = estado.categorias.find((c) => c.id === estado.categoria);
  if (!categoria) {
    panel.innerHTML = estadoVacio({ titulo: 'La carta se está actualizando', texto: 'Vuelve pronto para ver nuestros platos.', icono: 'carta' });
    return;
  }
  panel.setAttribute('aria-labelledby', `tab-${categoria.id}`);
  const platos = categoria.id === RECOMENDADOS.id
    ? estado.platos.filter((p) => p.recomendado)
    : estado.platos.filter((p) => p.categoria_id === categoria.id);
  // Agrupar por subcategoría (p. ej. Pizzas › Konys clásicas) en el orden en que aparecen.
  const grupos = [];
  platos.forEach((p) => {
    const nombre = categoria.id === RECOMENDADOS.id ? null : (p.subcategoria ?? null);
    let g = grupos.find((x) => x.nombre === nombre);
    if (!g) grupos.push(g = { nombre, platos: [] });
    g.platos.push(p);
  });
  panel.innerHTML = `
    ${categoria.subtitulo ? `<p class="carta__subtitulo">${esc(categoria.subtitulo)}</p>` : ''}
    ${avisoFranja(categoria)}
    ${grupos.map((g) => `
      ${g.nombre ? `<h3 class="carta__grupo">${esc(g.nombre)}</h3>` : ''}
      ${rejilla(g.platos)}`).join('')}`;
}
