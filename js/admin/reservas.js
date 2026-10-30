// Panel · Reservas: métricas del día, filtros, tabla paginada y cambio de estado.
import * as api from '../api.js';
import { ahoraBogota, aMinutos, formatoHora, formatoFechaLarga, formatoFechaTabla, capitalizar } from '../formato.js';
import { $, esc, icono, etiqueta, estadoVacio, alerta, notificar } from '../ui.js';

const POR_PAGINA = 10;
const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`;
const ESTADOS = [['confirmada', 'Confirmada'], ['completada', 'Completada'], ['cancelada', 'Cancelada']];

export async function montar(cont) {
  const ahora = ahoraBogota();
  const f = { fecha: ahora.fecha, mesaId: '', estado: '', pagina: 1 };
  const mesas = await api.obtenerTodasLasMesas();

  cont.innerHTML = `
    <header class="principal__cabecera">
      <div><h1>Reservas</h1><p>Agenda del restaurante · ${capitalizar(formatoFechaLarga(ahora.fecha))}</p></div>
    </header>
    <div class="metricas" id="metricas"><div class="esqueleto"><span></span></div></div>
    <form class="caja filtros" id="filtros" aria-label="Filtrar reservas">
      <div class="campo"><label for="f-fecha">Fecha</label><input class="entrada" type="date" id="f-fecha" value="${f.fecha}"></div>
      <div class="campo"><label for="f-mesa">Mesa</label>
        <select class="selector" id="f-mesa"><option value="">Todas las mesas</option>
          ${mesas.map((m) => `<option value="${m.id}">${esc(m.nombre)}${m.activa ? '' : ' (inactiva)'}</option>`).join('')}</select></div>
      <div class="campo"><label for="f-estado">Estado</label>
        <select class="selector" id="f-estado"><option value="">Todos los estados</option>
          ${ESTADOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
      <button type="submit" class="btn btn--verde">${icono('filtro')}Aplicar filtros</button>
      <button type="button" class="btn btn--secundario" id="limpiar">Limpiar</button>
    </form>
    <div id="tabla-reservas"></div>`;

  const leerFiltros = () => {
    f.fecha = $('#f-fecha').value;
    f.mesaId = $('#f-mesa').value;
    f.estado = $('#f-estado').value;
    f.pagina = 1;
  };
  const limpiar = () => {
    $('#f-fecha').value = '';
    $('#f-mesa').value = '';
    $('#f-estado').value = '';
    leerFiltros();
    cargar();
  };
  $('#filtros').addEventListener('submit', (e) => { e.preventDefault(); leerFiltros(); cargar(); });
  $('#limpiar').addEventListener('click', limpiar);

  async function cargarMetricas() {
    const dia = f.fecha || ahora.fecha;
    try {
      const filas = await api.obtenerReservasDelDia(dia);
      const cuenta = (e) => filas.filter((r) => r.estado === e).length;
      const proxima = filas.find((r) => r.estado === 'confirmada'
        && (dia > ahora.fecha || (dia === ahora.fecha && aMinutos(r.hora_inicio) >= ahora.minutos)));
      const activas = mesas.filter((m) => m.activa);
      const conReserva = new Set(filas.filter((r) => r.estado !== 'cancelada').map((r) => r.mesa_id)).size;
      const inactivas = mesas.filter((m) => !m.activa).map((m) => m.nombre);
      $('#metricas').innerHTML = `
        <div class="metrica"><span>Reservas del ${dia === ahora.fecha ? 'día' : formatoFechaTabla(dia)}</span><strong>${filas.length}</strong>
          <small>${plural(cuenta('confirmada'), 'confirmada')} · ${plural(cuenta('completada'), 'completada')} · ${plural(cuenta('cancelada'), 'cancelada')}</small></div>
        <div class="metrica"><span>Próxima reserva</span><strong>${proxima ? formatoHora(proxima.hora_inicio) : '—'}</strong>
          <small>${proxima ? `${esc(proxima.cliente_nombre)} · ${esc(proxima.mesas?.nombre)} · ${proxima.num_personas} personas` : 'No hay más reservas confirmadas'}</small></div>
        <div class="metrica"><span>Mesas con reserva</span><strong>${conReserva} de ${activas.length}</strong>
          <small>${inactivas.length ? `${esc(inactivas.join(', '))} ${inactivas.length > 1 ? 'están inactivas' : 'está inactiva'}` : 'Todas las mesas están activas'}</small></div>`;
    } catch (e) {
      $('#metricas').innerHTML = alerta('error', 'No pudimos calcular las métricas.', e.message);
    }
  }

  async function cargar() {
    const zona = $('#tabla-reservas');
    zona.innerHTML = '<div class="caja"><div class="esqueleto"><span></span><span></span><span></span></div></div>';
    cargarMetricas();
    let resultado;
    try {
      resultado = await api.obtenerReservas({ ...f, porPagina: POR_PAGINA });
    } catch (e) {
      zona.innerHTML = alerta('error', 'No pudimos cargar las reservas.', e.message);
      return;
    }
    const { filas, total } = resultado;
    if (!filas.length) {
      const hayFiltros = f.fecha || f.mesaId || f.estado;
      zona.innerHTML = estadoVacio({
        titulo: hayFiltros ? 'No hay reservas para este filtro' : 'Aún no hay reservas',
        texto: hayFiltros ? 'Prueba con otra fecha o quita el filtro de mesa para ver toda la agenda.' : 'Cuando lleguen, las verás aquí.',
        accion: hayFiltros ? '<button type="button" class="btn btn--primario" id="vacio-limpiar">Limpiar filtros</button>' : '',
      });
      $('#vacio-limpiar')?.addEventListener('click', limpiar);
      return;
    }
    const paginas = Math.ceil(total / POR_PAGINA);
    const desde = (f.pagina - 1) * POR_PAGINA + 1;
    zona.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla">
          <caption class="visualmente-oculto">Reservas registradas</caption>
          <thead><tr><th scope="col">Cliente</th><th scope="col">Mesa</th><th scope="col">Fecha</th><th scope="col">Hora</th>
            <th scope="col">Personas</th><th scope="col">Contacto</th><th scope="col">Estado</th><th scope="col"><span class="visualmente-oculto">Cambiar estado</span></th></tr></thead>
          <tbody>${filas.map((r) => `
            <tr>
              <td class="fuerte">${esc(r.cliente_nombre)}</td>
              <td>${esc(r.mesas?.nombre ?? '—')}</td>
              <td>${formatoFechaTabla(r.fecha)}</td>
              <td>${formatoHora(r.hora_inicio)}</td>
              <td>${r.num_personas}</td>
              <td class="texto-tenue">${esc(r.cliente_contacto ?? '—')}</td>
              <td>${etiqueta(r.estado)}</td>
              <td><label class="visualmente-oculto" for="estado-${r.id}">Estado de la reserva de ${esc(r.cliente_nombre)}</label>
                <select class="selector selector-estado" id="estado-${r.id}" data-reserva="${r.id}" data-actual="${r.estado}">
                  ${ESTADOS.map(([v, t]) => `<option value="${v}" ${v === r.estado ? 'selected' : ''}>${t}</option>`).join('')}
                </select></td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="tabla__pie">
          <span>Mostrando ${desde}–${desde + filas.length - 1} de ${total} reservas</span>
          ${paginas > 1 ? `<nav class="paginacion" aria-label="Páginas">
            <button type="button" data-pagina="${f.pagina - 1}" ${f.pagina === 1 ? 'disabled' : ''} aria-label="Página anterior">${icono('chevronIzq')}</button>
            ${Array.from({ length: paginas }, (_, i) => i + 1).filter((p) => Math.abs(p - f.pagina) <= 2 || p === 1 || p === paginas)
    .map((p) => `<button type="button" data-pagina="${p}" ${p === f.pagina ? 'aria-current="page"' : ''}>${p}</button>`).join('')}
            <button type="button" data-pagina="${f.pagina + 1}" ${f.pagina === paginas ? 'disabled' : ''} aria-label="Página siguiente">${icono('chevronDer')}</button>
          </nav>` : ''}
        </div>
      </div>`;

    zona.querySelectorAll('[data-pagina]').forEach((b) => b.addEventListener('click', () => {
      f.pagina = Number(b.dataset.pagina);
      cargar();
    }));
    zona.querySelectorAll('[data-reserva]').forEach((sel) => sel.addEventListener('change', async () => {
      const anterior = sel.dataset.actual;
      sel.disabled = true;
      try {
        await api.cambiarEstadoReserva(sel.dataset.reserva, sel.value);
        sel.dataset.actual = sel.value;
        sel.closest('tr').children[6].innerHTML = etiqueta(sel.value);
        notificar(`Reserva marcada como ${sel.value}.`);
        cargarMetricas();
      } catch (e) {
        sel.value = anterior;
        notificar(e.message, 'error');
      } finally {
        sel.disabled = false;
      }
    }));
  }

  await cargar();
}
