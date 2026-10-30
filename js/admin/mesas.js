// Panel · Mesas: registrar, editar, activar/desactivar y eliminar con seguridad.
import * as api from '../api.js';
import { nombreZona } from '../formato.js';
import { validarMesa, tieneErrores } from '../validaciones.js';
import { $, esc, icono, etiqueta, estadoVacio, confirmar, notificar, mostrarErrores } from '../ui.js';
import { abrirCajon, interruptor, campoImagen, activarCampoImagen, valorDe, alternar } from './comun.js';

export async function montar(cont) {
  let mesas = await api.obtenerTodasLasMesas();

  cont.innerHTML = `
    <header class="principal__cabecera">
      <div><h1>Mesas</h1><p>Una mesa inactiva deja de aparecer como reservable en el sitio público.</p></div>
      <button type="button" class="btn btn--verde" id="agregar-mesa">${icono('mas')}Agregar mesa</button>
    </header>
    <div id="lista-mesas"></div>`;
  $('#agregar-mesa').addEventListener('click', () => editar(null));

  function pintar() {
    const zona = $('#lista-mesas');
    if (!mesas.length) {
      zona.innerHTML = estadoVacio({
        titulo: 'Aún no hay mesas', texto: 'Registra la primera mesa para empezar a recibir reservas.', icono: 'mesa',
        accion: '<button type="button" class="btn btn--primario" id="vacio-agregar">Agregar mesa</button>',
      });
      $('#vacio-agregar').addEventListener('click', () => editar(null));
      return;
    }
    zona.innerHTML = `
      <div class="tabla-envoltura"><table class="tabla">
        <caption class="visualmente-oculto">Mesas registradas</caption>
        <thead><tr><th scope="col">Mesa</th><th scope="col">Zona</th><th scope="col">Capacidad</th><th scope="col">Estado</th>
          <th scope="col">Activa</th><th scope="col"><span class="visualmente-oculto">Acciones</span></th></tr></thead>
        <tbody>${mesas.map((m) => `
          <tr>
            <td class="fuerte">${esc(m.nombre)}</td>
            <td>${nombreZona(m.zona)}</td>
            <td><span class="tarjeta-mesa__meta">${icono('persona')}${m.capacidad} personas</span></td>
            <td data-estado>${etiqueta(m.activa ? 'activa' : 'inactiva')}</td>
            <td>${interruptor({ nombre: 'activa', id: `activa-${m.id}`, marcado: m.activa, texto: `<span class="visualmente-oculto">${esc(m.nombre)} activa</span>` })}</td>
            <td><div class="tabla__acciones">
              <button type="button" class="btn btn--secundario btn--pequeno" data-editar="${m.id}">${icono('lapiz')}Editar</button>
              <button type="button" class="btn btn--secundario btn--pequeno" data-eliminar="${m.id}" aria-label="Eliminar ${esc(m.nombre)}">${icono('papelera')}</button>
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    zona.querySelectorAll('input[id^="activa-"]').forEach((input) => input.addEventListener('change', async () => {
      const mesa = mesas.find((m) => `activa-${m.id}` === input.id);
      const ok = await alternar(input, (activa) => api.cambiarEstadoMesa(mesa.id, activa),
        (activa) => `${mesa.nombre} ${activa ? 'activada: ya se puede reservar' : 'desactivada: ya no aparece en el sitio'}.`);
      if (ok) {
        mesa.activa = input.checked;
        input.closest('tr').querySelector('[data-estado]').innerHTML = etiqueta(mesa.activa ? 'activa' : 'inactiva');
      }
    }));
    zona.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () =>
      editar(mesas.find((m) => String(m.id) === b.dataset.editar))));
    zona.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () =>
      eliminar(mesas.find((m) => String(m.id) === b.dataset.eliminar))));
  }

  function editar(mesa) {
    abrirCajon({
      titulo: mesa ? `Editar ${mesa.nombre}` : 'Nueva mesa',
      textoGuardar: 'Guardar mesa',
      cuerpo: `
        <div class="campo"><label for="m-nombre">Nombre o número *</label>
          <input class="entrada" id="m-nombre" name="nombre" maxlength="40" required value="${esc(mesa?.nombre ?? '')}" placeholder="Ej.: Mesa 10"></div>
        <div class="campo"><label for="m-zona">Zona *</label>
          <select class="selector" id="m-zona" name="zona">
            <option value="salon" ${mesa?.zona !== 'terraza' ? 'selected' : ''}>Salón</option>
            <option value="terraza" ${mesa?.zona === 'terraza' ? 'selected' : ''}>Terraza</option>
          </select></div>
        <div class="campo"><label for="m-capacidad">Capacidad máxima *</label>
          <input class="entrada" id="m-capacidad" name="capacidad" type="number" inputmode="numeric" min="1" max="12" step="1" required value="${mesa?.capacidad ?? 4}">
          <p class="campo__ayuda">Entre 1 y 12 personas.</p></div>
        ${campoImagen({ url: mesa?.foto_url, texto: 'Se muestra en la tarjeta pública de la mesa.' })}
        <div class="interruptor-caja">${interruptor({ nombre: 'activa', id: 'm-activa', marcado: mesa?.activa ?? true, texto: 'Mesa activa y reservable' })}</div>`,
      alAbrir: (form) => activarCampoImagen(form, 'mesas'),
      alGuardar: async (form) => {
        const datos = {
          id: mesa?.id, nombre: valorDe(form, 'nombre'), zona: valorDe(form, 'zona'),
          capacidad: valorDe(form, 'capacidad'), activa: form.elements.activa.checked, foto_url: valorDe(form, 'imagen'),
        };
        const errores = validarMesa(datos);
        mostrarErrores(form, errores, ['nombre', 'zona', 'capacidad']);
        if (tieneErrores(errores)) return false;
        const guardada = await api.guardarMesa(datos);
        mesas = mesa ? mesas.map((m) => (m.id === guardada.id ? guardada : m)) : [...mesas, guardada];
        pintar();
        notificar(mesa ? `${guardada.nombre} actualizada.` : `${guardada.nombre} registrada.`);
        return true;
      },
    });
  }

  async function eliminar(mesa) {
    const respuesta = await confirmar({
      titulo: `¿Eliminar ${mesa.nombre}?`,
      texto: 'Esta acción no se puede deshacer. Si la mesa tiene reservas registradas no se podrá eliminar; en ese caso desactívala.',
      botones: [
        { valor: 'desactivar', texto: 'Mejor desactivar', clase: 'btn--secundario' },
        { valor: '', texto: 'Cancelar', clase: 'btn--secundario' },
        { valor: 'eliminar', texto: 'Sí, eliminar', clase: 'btn--destructivo' },
      ],
    });
    try {
      if (respuesta === 'eliminar') {
        await api.eliminarMesa(mesa.id);
        mesas = mesas.filter((m) => m.id !== mesa.id);
        notificar(`${mesa.nombre} eliminada.`);
      } else if (respuesta === 'desactivar') {
        const act = await api.cambiarEstadoMesa(mesa.id, false);
        mesas = mesas.map((m) => (m.id === act.id ? act : m));
        notificar(`${mesa.nombre} desactivada.`);
      } else return;
      pintar();
    } catch (e) {
      notificar(e.codigo === 'EN_USO'
        ? `${mesa.nombre} tiene reservas registradas: desactívala en lugar de eliminarla.`
        : e.message, 'error');
    }
  }

  pintar();
}
