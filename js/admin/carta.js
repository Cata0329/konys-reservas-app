// Panel · Carta: crear, editar, ocultar/mostrar y eliminar platos.
// Los platos oficiales vienen del menú de Konys (migración 003); los de
// origen "prueba" son datos de ejemplo que no deben mostrarse al público.
import * as api from '../api.js';
import { formatoPrecio } from '../formato.js';
import { validarPlato, tieneErrores } from '../validaciones.js';
import { $, esc, icono, etiqueta, estadoVacio, confirmar, notificar, mostrarErrores, ilustracionPlato, imagenOIlustracion } from '../ui.js';
import { abrirCajon, interruptor, campoImagen, activarCampoImagen, valorDe, alternar } from './comun.js';

export async function montar(cont) {
  const [categorias, platosIniciales] = await Promise.all([api.obtenerCategorias(), api.obtenerTodosLosPlatos()]);
  let platos = platosIniciales;
  const filtro = { categoria: '', origen: '', texto: '' };
  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.nombre ?? id;
  const ordenCategoria = (id) => categorias.find((c) => c.id === id)?.orden ?? 99;
  const hayPrueba = () => platos.some((p) => p.origen === 'prueba');

  cont.innerHTML = `
    <header class="principal__cabecera">
      <div><h1>Carta</h1><p>Los platos ocultos no aparecen en la carta pública. Catálogo verificado con el menú oficial de Konys.</p></div>
      <button type="button" class="btn btn--verde" id="agregar-plato">${icono('mas')}Agregar plato</button>
    </header>
    <div id="aviso-prueba"></div>
    <form class="caja filtros filtros--carta" id="filtros-carta" aria-label="Filtrar platos">
      <div class="campo"><label for="f-buscar">Buscar</label>
        <input class="entrada" id="f-buscar" type="search" placeholder="Nombre del plato"></div>
      <div class="campo"><label for="f-categoria">Categoría</label>
        <select class="selector" id="f-categoria"><option value="">Todas</option>
          ${categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select></div>
      <div class="campo"><label for="f-origen">Origen</label>
        <select class="selector" id="f-origen"><option value="">Todos</option>
          <option value="oficial">Oficial</option><option value="prueba">Dato de prueba</option><option value="manual">Manual</option></select></div>
    </form>
    <div id="lista-platos"></div>`;
  $('#agregar-plato').addEventListener('click', () => editar(null));
  $('#f-buscar').addEventListener('input', (e) => { filtro.texto = e.target.value.trim().toLowerCase(); pintar(); });
  $('#f-categoria').addEventListener('change', (e) => { filtro.categoria = e.target.value; pintar(); });
  $('#f-origen').addEventListener('change', (e) => { filtro.origen = e.target.value; pintar(); });
  $('#filtros-carta').addEventListener('submit', (e) => e.preventDefault());

  function pintar() {
    $('#aviso-prueba').innerHTML = hayPrueba()
      ? `<div class="alerta alerta--aviso" role="status">${icono('aviso')}<div><strong>Hay platos de prueba.</strong>
          <p>No están en el menú oficial de Konys; se mantienen ocultos al público. Puedes eliminarlos cuando quieras.</p></div></div>`
      : '';
    const zona = $('#lista-platos');
    if (!platos.length) {
      zona.innerHTML = estadoVacio({
        titulo: 'La carta está vacía', texto: 'Agrega el primer plato para mostrarlo en el sitio.', icono: 'carta',
        accion: '<button type="button" class="btn btn--primario" id="vacio-agregar">Agregar plato</button>',
      });
      $('#vacio-agregar').addEventListener('click', () => editar(null));
      return;
    }
    const lista = platos
      .filter((p) => (!filtro.categoria || p.categoria_id === filtro.categoria)
        && (!filtro.origen || p.origen === filtro.origen)
        && (!filtro.texto || p.nombre.toLowerCase().includes(filtro.texto)))
      .sort((a, b) => ordenCategoria(a.categoria_id) - ordenCategoria(b.categoria_id) || a.orden - b.orden || a.id - b.id);
    if (!lista.length) {
      zona.innerHTML = estadoVacio({ titulo: 'No hay platos con ese filtro', texto: 'Prueba con otra categoría u otro texto.', icono: 'buscar' });
      return;
    }
    zona.innerHTML = `
      <p class="texto-tenue contador-filas">${lista.length} de ${platos.length} platos</p>
      <div class="tabla-envoltura"><table class="tabla">
        <caption class="visualmente-oculto">Platos de la carta</caption>
        <thead><tr><th scope="col">Plato</th><th scope="col">Categoría</th><th scope="col">Descripción</th><th scope="col">Precio</th>
          <th scope="col">Origen</th><th scope="col">Disponibilidad</th><th scope="col">Visible</th><th scope="col"><span class="visualmente-oculto">Acciones</span></th></tr></thead>
        <tbody>${lista.map((p) => `
          <tr>
            <td><div class="celda-plato"><span class="miniatura">${imagenOIlustracion(p.imagen_url, ilustracionPlato(p), `Foto de ${p.nombre}`)}</span>
              <span><span class="fuerte">${esc(p.nombre)}</span>${p.recomendado ? '<br><span class="sello sello--limon">Recomendado</span>' : ''}</span></div></td>
            <td><span class="etiqueta etiqueta--neutra">${esc(nombreCategoria(p.categoria_id))}</span>
              ${p.subcategoria ? `<br><small class="texto-tenue">${esc(p.subcategoria)}</small>` : ''}</td>
            <td class="texto-tenue celda-descripcion">${esc(p.descripcion ?? '—')}</td>
            <td class="fuerte celda-precio">${formatoPrecio(p.precio)}</td>
            <td>${etiqueta(p.origen ?? 'manual')}</td>
            <td data-estado>${etiqueta(p.disponible ? 'disponible' : 'oculto')}</td>
            <td>${interruptor({ nombre: 'visible', id: `visible-${p.id}`, marcado: p.disponible, texto: `<span class="visualmente-oculto">${esc(p.nombre)} visible</span>` })}</td>
            <td><div class="tabla__acciones">
              <button type="button" class="btn btn--secundario btn--pequeno" data-editar="${p.id}">${icono('lapiz')}Editar</button>
              <button type="button" class="btn btn--secundario btn--pequeno" data-eliminar="${p.id}" aria-label="Eliminar ${esc(p.nombre)}">${icono('papelera')}</button>
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    zona.querySelectorAll('input[id^="visible-"]').forEach((input) => input.addEventListener('change', async () => {
      const p = platos.find((x) => `visible-${x.id}` === input.id);
      if (input.checked && p.origen === 'prueba') {
        const r = await confirmar({
          titulo: `«${p.nombre}» es un dato de prueba`,
          texto: 'No aparece en el menú oficial de Konys. Si lo muestras, los clientes lo verán como un plato real.',
          botones: [{ valor: '', texto: 'Mantener oculto', clase: 'btn--secundario' }, { valor: 'si', texto: 'Mostrar igualmente', clase: 'btn--destructivo' }],
        });
        if (r !== 'si') { input.checked = false; return; }
      }
      const ok = await alternar(input, (v) => api.cambiarDisponibilidadPlato(p.id, v),
        (v) => `«${p.nombre}» ${v ? 'ya se muestra en la carta' : 'quedó oculto de la carta pública'}.`);
      if (ok) {
        p.disponible = input.checked;
        input.closest('tr').querySelector('[data-estado]').innerHTML = etiqueta(p.disponible ? 'disponible' : 'oculto');
      }
    }));
    zona.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () =>
      editar(platos.find((p) => String(p.id) === b.dataset.editar))));
    zona.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () =>
      eliminar(platos.find((p) => String(p.id) === b.dataset.eliminar))));
  }

  function editar(p) {
    const variantes = Array.isArray(p?.variantes) && p.variantes.length
      ? `<p class="campo__ayuda">Variantes publicadas: ${p.variantes.map((v) => esc(`${v.grupo}: ${v.nombre}${v.delta ? ` (+${formatoPrecio(v.delta)})` : ''}`)).join(', ')}.</p>` : '';
    abrirCajon({
      titulo: p ? `Editar «${p.nombre}»` : 'Nuevo plato',
      textoGuardar: 'Guardar plato',
      cuerpo: `
        ${p?.origen === 'oficial' ? '<p class="campo__ayuda">Plato del menú oficial. Si la fuente cambia, vuelve a generar la migración 003 en lugar de inventar datos.</p>' : ''}
        <div class="campo"><label for="p-nombre">Nombre *</label>
          <input class="entrada" id="p-nombre" name="nombre" maxlength="80" required value="${esc(p?.nombre ?? '')}"></div>
        <div class="campo"><label for="p-categoria">Categoría *</label>
          <select class="selector" id="p-categoria" name="categoria_id">${categorias.map((c) =>
  `<option value="${esc(c.id)}" ${c.id === (p?.categoria_id ?? categorias[0]?.id) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="p-subcategoria">Subcategoría <span class="campo__opcional">(opcional)</span></label>
          <input class="entrada" id="p-subcategoria" name="subcategoria" maxlength="60" value="${esc(p?.subcategoria ?? '')}" placeholder="Ej.: Konys clásicas"></div>
        <div class="campo"><label for="p-descripcion">Descripción <span class="campo__opcional">(opcional)</span></label>
          <textarea class="area" id="p-descripcion" name="descripcion" maxlength="600">${esc(p?.descripcion ?? '')}</textarea></div>
        <div class="campo"><label for="p-precio">Precio en pesos <span class="campo__opcional">(vacío = por confirmar)</span></label>
          <input class="entrada" id="p-precio" name="precio" type="number" inputmode="numeric" min="0" step="1" value="${p?.precio ?? ''}" placeholder="Ej.: 27900">
          <p class="campo__ayuda">Sin puntos ni decimales. Se mostrará como ${formatoPrecio(p?.precio ?? 27900)}.</p>${variantes}</div>
        ${campoImagen({ url: p?.imagen_url, texto: 'Se muestra en la tarjeta del plato. Usa solo fotos reales del producto.' })}
        <div class="interruptor-caja">${interruptor({ nombre: 'recomendado', id: 'p-recomendado', marcado: p?.recomendado ?? false, texto: 'Aparece en «Recomendados»' })}</div>
        <div class="interruptor-caja">${interruptor({ nombre: 'disponible', id: 'p-disponible', marcado: p?.disponible ?? true, texto: 'Disponible y visible en la carta' })}</div>`,
      alAbrir: (form) => activarCampoImagen(form, 'platos'),
      alGuardar: async (form) => {
        const datos = {
          id: p?.id, nombre: valorDe(form, 'nombre'), categoria_id: valorDe(form, 'categoria_id'),
          subcategoria: valorDe(form, 'subcategoria'), descripcion: valorDe(form, 'descripcion'), precio: valorDe(form, 'precio'),
          etiqueta: p?.etiqueta ?? null, recomendado: form.elements.recomendado.checked,
          disponible: form.elements.disponible.checked, imagen_url: valorDe(form, 'imagen'),
        };
        const errores = validarPlato(datos);
        mostrarErrores(form, errores, ['nombre', 'categoria_id', 'subcategoria', 'descripcion', 'precio']);
        if (tieneErrores(errores)) return false;
        const guardado = await api.guardarPlato(datos);
        platos = p ? platos.map((x) => (x.id === guardado.id ? guardado : x)) : [...platos, guardado];
        pintar();
        notificar(p ? `«${guardado.nombre}» actualizado.` : `«${guardado.nombre}» agregado a la carta.`);
        return true;
      },
    });
  }

  async function eliminar(p) {
    const r = await confirmar({
      titulo: `¿Eliminar «${p.nombre}»?`,
      texto: 'Se quitará de la carta de forma definitiva y no se podrá recuperar. Si solo quieres que deje de mostrarse un tiempo, ocúltalo.',
      botones: [
        { valor: 'ocultar', texto: 'Mejor ocultar', clase: 'btn--secundario' },
        { valor: '', texto: 'Cancelar', clase: 'btn--secundario' },
        { valor: 'eliminar', texto: 'Sí, eliminar', clase: 'btn--destructivo' },
      ],
    });
    try {
      if (r === 'eliminar') {
        await api.eliminarPlato(p.id);
        platos = platos.filter((x) => x.id !== p.id);
        notificar(`«${p.nombre}» eliminado de la carta.`);
      } else if (r === 'ocultar') {
        const act = await api.cambiarDisponibilidadPlato(p.id, false);
        platos = platos.map((x) => (x.id === act.id ? { ...x, ...act } : x));
        notificar(`«${p.nombre}» quedó oculto.`);
      } else return;
      pintar();
    } catch (e) {
      notificar(e.message, 'error');
    }
  }

  pintar();
}
