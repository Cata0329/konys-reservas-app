// Panel · Categorías de la carta: crear, editar, ordenar y eliminar.
// Una categoría con platos no se puede eliminar (la base de datos lo impide).
import * as api from '../api.js';
import { formatoHora } from '../formato.js';
import { validarCategoria, tieneErrores } from '../validaciones.js';
import { $, esc, icono, estadoVacio, confirmar, notificar, mostrarErrores } from '../ui.js';
import { abrirCajon, valorDe } from './comun.js';

export async function montar(cont, { ir }) {
  const [inicial, platos] = await Promise.all([api.obtenerCategorias(), api.obtenerTodosLosPlatos()]);
  let categorias = inicial;
  const cuantos = (id) => platos.filter((p) => p.categoria_id === id).length;
  const visibles = (id) => platos.filter((p) => p.categoria_id === id && p.disponible).length;

  cont.innerHTML = `
    <header class="principal__cabecera">
      <div><h1>Categorías</h1><p>Organizan la carta pública. El orden define el orden de las pestañas.</p></div>
      <button type="button" class="btn btn--verde" id="agregar-categoria">${icono('mas')}Agregar categoría</button>
    </header>
    <div id="lista-categorias"></div>`;
  $('#agregar-categoria').addEventListener('click', () => editar(null));

  function pintar() {
    const zona = $('#lista-categorias');
    if (!categorias.length) {
      zona.innerHTML = estadoVacio({ titulo: 'No hay categorías', texto: 'Crea la primera para organizar la carta.', icono: 'etiqueta' });
      return;
    }
    zona.innerHTML = `
      <div class="tabla-envoltura"><table class="tabla">
        <caption class="visualmente-oculto">Categorías de la carta</caption>
        <thead><tr><th scope="col">Orden</th><th scope="col">Categoría</th><th scope="col">Identificador</th>
          <th scope="col">Subtítulo</th><th scope="col">Franja horaria</th><th scope="col">Platos</th>
          <th scope="col"><span class="visualmente-oculto">Acciones</span></th></tr></thead>
        <tbody>${categorias.map((c) => `
          <tr>
            <td>${c.orden}</td>
            <td class="fuerte">${esc(c.nombre)}</td>
            <td class="texto-tenue"><code>${esc(c.id)}</code></td>
            <td class="texto-tenue">${esc(c.subtitulo ?? '—')}</td>
            <td>${c.disponible_desde ? `${formatoHora(c.disponible_desde)} – ${formatoHora(c.disponible_hasta)}` : 'Todo el horario'}</td>
            <td>${visibles(c.id)} visibles de ${cuantos(c.id)}</td>
            <td><div class="tabla__acciones">
              <button type="button" class="btn btn--secundario btn--pequeno" data-editar="${esc(c.id)}">${icono('lapiz')}Editar</button>
              <button type="button" class="btn btn--secundario btn--pequeno" data-eliminar="${esc(c.id)}" aria-label="Eliminar ${esc(c.nombre)}">${icono('papelera')}</button>
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>`;
    zona.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () =>
      editar(categorias.find((c) => c.id === b.dataset.editar))));
    zona.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () =>
      eliminar(categorias.find((c) => c.id === b.dataset.eliminar))));
  }

  function editar(c) {
    const esNueva = !c;
    abrirCajon({
      titulo: esNueva ? 'Nueva categoría' : `Editar «${c.nombre}»`,
      textoGuardar: 'Guardar categoría',
      cuerpo: `
        <div class="campo"><label for="c-nombre">Nombre *</label>
          <input class="entrada" id="c-nombre" name="nombre" maxlength="60" required value="${esc(c?.nombre ?? '')}"></div>
        <div class="campo"><label for="c-id">Identificador ${esNueva ? '*' : ''}</label>
          <input class="entrada" id="c-id" name="id" maxlength="40" value="${esc(c?.id ?? '')}" ${esNueva ? 'required placeholder="ej.: menu_infantil"' : 'disabled'}>
          <p class="campo__ayuda">${esNueva ? 'Minúsculas y guion bajo. No se puede cambiar después.' : 'No se puede cambiar porque los platos lo usan.'}</p></div>
        <div class="campo"><label for="c-orden">Orden</label>
          <input class="entrada" id="c-orden" name="orden" type="number" step="1" value="${c?.orden ?? categorias.length + 1}"></div>
        <div class="campo"><label for="c-subtitulo">Subtítulo <span class="campo__opcional">(opcional)</span></label>
          <input class="entrada" id="c-subtitulo" name="subtitulo" maxlength="120" value="${esc(c?.subtitulo ?? '')}"></div>
        <fieldset class="campo campo--grupo">
          <legend class="campo__etiqueta">Franja horaria <span class="campo__opcional">(opcional)</span></legend>
          <div class="fila-campos">
            <div class="campo"><label for="c-desde">Desde</label>
              <input class="entrada" id="c-desde" name="disponible_desde" type="time" value="${esc(c?.disponible_desde?.slice(0, 5) ?? '')}"></div>
            <div class="campo"><label for="c-hasta">Hasta</label>
              <input class="entrada" id="c-hasta" name="disponible_hasta" type="time" value="${esc(c?.disponible_hasta?.slice(0, 5) ?? '')}"></div>
          </div>
          <p class="campo__ayuda">Ej.: Menú Almuerzos de 12:00 a 14:30. Fuera de la franja la carta lo indica.</p>
        </fieldset>`,
      alGuardar: async (form) => {
        const datos = {
          id: esNueva ? valorDe(form, 'id').trim() : c.id, nombre: valorDe(form, 'nombre'), orden: valorDe(form, 'orden'),
          subtitulo: valorDe(form, 'subtitulo'), disponible_desde: valorDe(form, 'disponible_desde'), disponible_hasta: valorDe(form, 'disponible_hasta'),
        };
        const errores = validarCategoria(datos, esNueva);
        mostrarErrores(form, errores, ['nombre', 'id', 'orden', 'disponible_hasta']);
        if (tieneErrores(errores)) return false;
        const guardada = await api.guardarCategoria(datos, esNueva);
        categorias = (esNueva ? [...categorias, guardada] : categorias.map((x) => (x.id === guardada.id ? guardada : x)))
          .sort((a, b) => a.orden - b.orden);
        pintar();
        notificar(esNueva ? `Categoría «${guardada.nombre}» creada.` : `Categoría «${guardada.nombre}» actualizada.`);
        return true;
      },
    });
  }

  async function eliminar(c) {
    if (cuantos(c.id) > 0) {
      const r = await confirmar({
        titulo: `«${c.nombre}» tiene ${cuantos(c.id)} platos`,
        texto: 'No se puede eliminar una categoría con platos. Muévelos a otra categoría o ocúltalos desde la sección Carta.',
        botones: [{ valor: '', texto: 'Entendido', clase: 'btn--secundario' }, { valor: 'carta', texto: 'Ir a la carta', clase: 'btn--verde' }],
      });
      if (r === 'carta') ir('carta');
      return;
    }
    const r = await confirmar({
      titulo: `¿Eliminar «${c.nombre}»?`,
      texto: 'La categoría está vacía. Esta acción no se puede deshacer.',
      botones: [{ valor: '', texto: 'Cancelar', clase: 'btn--secundario' }, { valor: 'si', texto: 'Sí, eliminar', clase: 'btn--destructivo' }],
    });
    if (r !== 'si') return;
    try {
      await api.eliminarCategoria(c.id);
      categorias = categorias.filter((x) => x.id !== c.id);
      pintar();
      notificar(`Categoría «${c.nombre}» eliminada.`);
    } catch (e) {
      notificar(e.message, 'error');
    }
  }

  pintar();
}
