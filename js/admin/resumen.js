// Panel · Resumen: lo que pasa hoy en el restaurante.
import * as api from '../api.js';
import { ahoraBogota, aMinutos, formatoHora, formatoFechaLarga, capitalizar, nombreZona } from '../formato.js';
import { esc, icono, etiqueta, estadoVacio } from '../ui.js';

export async function montar(cont, { ir }) {
  const ahora = ahoraBogota();
  const [reservas, mesas] = await Promise.all([api.obtenerReservasDelDia(ahora.fecha), api.obtenerTodasLasMesas()]);
  const vigentes = reservas.filter((r) => r.estado !== 'cancelada');
  const proximas = vigentes.filter((r) => r.estado === 'confirmada' && aMinutos(r.hora_inicio) >= ahora.minutos);
  const activas = mesas.filter((m) => m.activa);
  const inactivas = mesas.filter((m) => !m.activa).map((m) => m.nombre);
  const saludo = ahora.minutos < 12 * 60 ? 'Buenos días' : ahora.minutos < 19 * 60 ? 'Buenas tardes' : 'Buenas noches';

  cont.innerHTML = `
    <header class="principal__cabecera">
      <div><h1>${saludo}</h1><p>${capitalizar(formatoFechaLarga(ahora.fecha))} · lo que pasa hoy en el restaurante</p></div>
    </header>
    <div class="metricas">
      <div class="metrica"><span>Reservas del día</span><strong>${vigentes.length}</strong>
        <small>${vigentes.length - proximas.length} ya pasaron o se completaron · ${proximas.length} por llegar</small></div>
      <div class="metrica"><span>Próximas reservas</span><strong>${proximas.length}</strong>
        <small>${proximas[0] ? `La siguiente es a las ${formatoHora(proximas[0].hora_inicio)}` : 'No hay más reservas hoy'}</small></div>
      <div class="metrica"><span>Mesas activas</span><strong>${activas.length} de ${mesas.length}</strong>
        <small>${inactivas.length ? `${esc(inactivas.join(', '))} ${inactivas.length > 1 ? 'están inactivas' : 'está inactiva'}` : 'Todas las mesas están activas'}</small></div>
    </div>
    <div class="resumen-grid">
      <section class="caja" aria-labelledby="titulo-proximas">
        <div class="caja__cabecera"><h2 id="titulo-proximas">Próximas reservas de hoy</h2>
          <button type="button" class="btn btn--secundario btn--pequeno" data-ir="reservas">Ver todas ${icono('flechaDerecha')}</button></div>
        ${proximas.length ? `<ul class="lista-proximas">${proximas.slice(0, 6).map((r) => `
          <li><b>${formatoHora(r.hora_inicio)}</b>
            <div><span class="fuerte">${esc(r.cliente_nombre)}</span><small>${esc(r.mesas?.nombre ?? '')} · ${nombreZona(r.mesas?.zona)} · ${r.num_personas} personas</small></div>
            ${etiqueta(r.estado)}</li>`).join('')}</ul>`
    : estadoVacio({ titulo: 'Aún no hay reservas', texto: 'Cuando lleguen reservas para hoy, las verás aquí.' })}
      </section>
      <section class="caja" aria-labelledby="titulo-accesos">
        <div class="caja__cabecera"><h2 id="titulo-accesos">Accesos rápidos</h2></div>
        <div class="accesos">
          <button type="button" class="btn btn--secundario" data-ir="mesas">${icono('mesa')}Activar o desactivar mesas</button>
          <button type="button" class="btn btn--secundario" data-ir="horarios">${icono('reloj')}Ajustar horarios</button>
          <button type="button" class="btn btn--secundario" data-ir="carta">${icono('carta')}Editar la carta</button>
        </div>
      </section>
    </div>`;
  cont.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));
}
