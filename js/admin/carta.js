// Panel · Carta: crear, editar, ocultar/mostrar y eliminar platos.
import * as api from '../api.js';
import { formatoPrecio } from '../formato.js';
import { validarPlato, tieneErrores } from '../validaciones.js';
import { $, esc, icono, etiqueta, estadoVacio, confirmar, notificar, mostrarErrores, ilustracionPlato, imagenOIlustracion } from '../ui.js';
import { abrirCajon, interruptor, campoImagen, activarCampoImagen, valorDe, alternar } from './comun.js';

export async function montar(cont) {
  const [categorias, platosIniciales] = await Promise.all([api.obtenerCategorias(), api.obtenerTodosLosPlatos()]);
  let platos = platosIniciales;
  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.nombre ?? id;
  const ordenCategoria = (id) => categorias.find((c) => c.id === id)?.orden ?? 99;

  cont.innerHTML = `
    <header class="principal__cabecera">
      <div><h1>Carta</h1><p>Los platos ocultos o no disponibles no aparecen en la carta pública.</p></div>
      <button type="button" class="btn btn--verde" id="agregar-plato">${icono('mas')}Agregar plato</button>
    </header>
    <div id="lista-platos"></div>`;
  $('#agregar-plato').addEventListener('click', () => editar(null));

  function pintar() {
    const zona = $('#lista-platos');
    if (!platos.length) {
      zona.innerHTML = estadoVacio({
        titulo: 'La carta está vacía', texto: 'Agrega el primer plato para mostrarlo en el sitio.', icono: 'carta',
        accion: '<button type="button" class="btn btn--primario" id="vacio-agregar">Agregar plato</button>',
      });
      $('#vacio-agregar').addEventListener('click', () => editar(null));
      return;
    }
    const ordenados = [...platos].sort((a, b) => ordenCategoria(a.categoria_id) - ordenCategoria(b.categoria_id) || a.orden - b.orden || a.id - b.id);
    zona.innerHTML = `
      <div class="tabla-envoltura"><table class="tabla">
        <caption class="visualmente-oculto">Platos de la carta</caption>
        <thead><tr><th scope="col">Plato</th><th scope="col">Categoría</th><th scope="col">Descripción</th><th scope="col">Precio</th>
          <th scope="col">Disponibilidad</th><th scope="col">Visible</th><th scope="col"><span class="visualmente-oculto">Acciones</span></th></tr></thead>
        <tbody>${ordenados.map((p, i) => `
          <tr>
            <td><div class="celda-plato"><span class="miniatura">${imagenOIlustracion(p.imagen_url, ilustracionPlato(p, i), '')}</span>
              <span class="fuerte">${esc(p.nombre)}</span></div></td>
            <td><span class="etiqueta etiqueta--neutra">${esc(nombreCategoria(p.categoria_id))}</span></td>
            <td class="texto-tenue celda-descripcion">${esc(p.descripcion ?? '—')}</td>
            <td class="fuerte">${formatoPrecio(p.precio)}</td>
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
    abrirCajon({
      titulo: p ? `Editar «${p.nombre}»` : 'Nuevo plato',
      textoGuardar: 'Guardar plato',
      cuerpo: `
        <div class="campo"><label for="p-nombre">Nombre *</label>
          <input class="entrada" id="p-nombre" name="nombre" maxlength="80" required value="${esc(p?.nombre ?? '')}"></div>
        <div class="campo"><label for="p-categoria">Categoría *</label>
          <select class="selector" id="p-categoria" name="categoria_id">${categorias.map((c) =>
  `<option value="${esc(c.id)}" ${c.id === (p?.categoria_id ?? 'pizzas') ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="p-descripcion">Descripción <span class="campo__opcional">(opcional)</span></label>
          <textarea class="area" id="p-descripcion" name="descripcion" maxlength="300">${esc(p?.descripcion ?? '')}</textarea></div>
        <div class="campo"><label for="p-precio">Precio en pesos *</label>
          <input class="entrada" id="p-precio" name="precio" type="number" inputmode="numeric" min="0" step="100" required value="${p?.precio ?? ''}" placeholder="Ej.: 34900">
          <p class="campo__ayuda">Sin puntos ni decimales. Se mostrará como ${formatoPrecio(p?.precio ?? 34900)}.</p></div>
        <div class="campo"><label for="p-etiqueta">Etiqueta <span class="campo__opcional">(opcional)</span></label>
          <select class="selector" id="p-etiqueta" name="etiqueta">
            <option value="">Sin etiqueta</option>
            ${[['clasica', 'Clásica'], ['especialidad', 'Especialidad'], ['vegetariana', 'Vegetariana']].map(([v, t]) =>
    `<option value="${v}" ${v === p?.etiqueta ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
        ${campoImagen({ url: p?.imagen_url, texto: 'Se muestra en la tarjeta del plato.' })}
        <div class="interruptor-caja">${interruptor({ nombre: 'disponible', id: 'p-disponible', marcado: p?.disponible ?? true, texto: 'Disponible y visible en la carta' })}</div>`,
      alAbrir: (form) => activarCampoImagen(form, 'platos'),
      alGuardar: async (form) => {
        const datos = {
          id: p?.id, nombre: valorDe(form, 'nombre'), categoria_id: valorDe(form, 'categoria_id'),
          descripcion: valorDe(form, 'descripcion'), precio: valorDe(form, 'precio'), etiqueta: valorDe(form, 'etiqueta'),
          disponible: form.elements.disponible.checked, imagen_url: valorDe(form, 'imagen'),
        };
        const errores = validarPlato(datos);
        mostrarErrores(form, errores, ['nombre', 'categoria_id', 'descripcion', 'precio']);
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
        platos = platos.map((x) => (x.id === act.id ? act : x));
        notificar(`«${p.nombre}» quedó oculto.`);
      } else return;
      pintar();
    } catch (e) {
      notificar(e.message, 'error');
    }
  }

  pintar();
}
