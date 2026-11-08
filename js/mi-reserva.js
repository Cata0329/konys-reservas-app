// Mi reserva: el cliente consulta (y si aún no ha pasado, cancela) su reserva
// con el código de 8 caracteres y su nombre. La base de datos solo devuelve
// la reserva si coinciden ambos datos y nunca expone el teléfono.
import * as api from './api.js';
import { errorConfiguracion } from './supabase.js';
import { formatoHora, formatoFechaLarga, nombreZona, capitalizar } from './formato.js';
import { $, esc, icono, alerta, etiqueta, botonCargando, mostrarErrores, marcarCampo, confirmar } from './ui.js';

const form = $('#form-consulta');
$('#volver-sitio').innerHTML = `${icono('chevronIzq')}<span>Volver al sitio</span>`;
if (errorConfiguracion) {
  $('#aviso-config').innerHTML = `<div class="aviso-config"><div class="contenedor">${icono('aviso')}${esc(errorConfiguracion)}</div></div>`;
}

// El código puede llegar en la URL desde la confirmación (?codigo=XXXXXXXX). No es un token de acceso:
// sin el nombre no permite ver nada. Se quita de la barra de direcciones tras leerlo.
const params = new URLSearchParams(location.search);
if (/^[0-9a-f]{8}$/i.test(params.get('codigo') ?? '')) {
  form.elements.codigo.value = params.get('codigo').toUpperCase();
  history.replaceState(null, '', location.pathname);
  form.elements.nombre.focus();
}

function validar() {
  const errores = {};
  const codigo = form.elements.codigo.value.trim();
  const nombre = form.elements.nombre.value.trim();
  if (!/^[0-9a-f]{8}$/i.test(codigo)) errores.codigo = 'El código tiene 8 caracteres (números y letras de la A a la F).';
  if (nombre.length < 3) errores.nombre = 'Escribe el nombre con que hiciste la reserva.';
  mostrarErrores(form, errores, ['codigo', 'nombre']);
  return Object.keys(errores).length === 0;
}

form.elements.codigo.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (e.target.getAttribute('aria-invalid')) marcarCampo(form, 'codigo', '');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#consulta-alerta').innerHTML = '';
  if (!validar()) return;
  const restaurar = botonCargando($('#btn-consultar'), 'Buscando…');
  try {
    const r = await api.consultarReserva(form.elements.codigo.value, form.elements.nombre.value);
    if (!r) {
      $('#resultado').innerHTML = '';
      $('#consulta-alerta').innerHTML = alerta('aviso', 'No encontramos esa reserva.',
        'Revisa el código y escribe el nombre exactamente como lo diste al reservar.');
    } else {
      pintar(r);
    }
  } catch (err) {
    $('#consulta-alerta').innerHTML = alerta('error', 'No pudimos consultar la reserva.', err.message);
  } finally {
    restaurar();
  }
});

function pintar(r) {
  const fila = (ico, texto, valor) => `<div><dt>${ico ? icono(ico) : ''}${texto}</dt><dd>${valor}</dd></div>`;
  $('#resultado').innerHTML = `
    <div class="resumen">
      <div class="resumen__cuerpo">
        <div class="resumen__cabecera"><p class="antetitulo">Reserva ${esc(r.codigo)}</p>${etiqueta(r.estado)}</div>
        <h2>${esc(r.mesa_nombre)}</h2>
        <p class="resumen__zona">${nombreZona(r.zona)}</p>
        <dl>
          ${fila('calendario', 'Fecha', capitalizar(formatoFechaLarga(r.fecha)))}
          ${fila('reloj', 'Hora', `${formatoHora(r.hora_inicio)} – ${formatoHora(r.hora_fin)}`)}
          ${fila('persona', 'Personas', r.num_personas)}
        </dl>
        ${r.cancelable
    ? '<div class="panel__acciones"><button type="button" class="btn btn--destructivo btn--bloque" id="cancelar">Cancelar mi reserva</button></div>'
    : `<p class="resumen__nota">${r.estado === 'cancelada' ? 'Esta reserva fue cancelada.' : 'Esta reserva ya no se puede cancelar desde aquí.'}</p>`}
      </div>
    </div>`;
  $('#cancelar')?.addEventListener('click', () => cancelar(r));
}

async function cancelar(r) {
  const respuesta = await confirmar({
    titulo: '¿Cancelar tu reserva?',
    texto: `Liberaremos la ${r.mesa_nombre} el ${formatoFechaLarga(r.fecha)} a las ${formatoHora(r.hora_inicio)}. No se puede deshacer.`,
    botones: [{ valor: '', texto: 'No, mantenerla', clase: 'btn--secundario' }, { valor: 'si', texto: 'Sí, cancelar', clase: 'btn--destructivo' }],
  });
  if (respuesta !== 'si') return;
  const boton = $('#cancelar');
  const restaurar = botonCargando(boton, 'Cancelando…');
  try {
    await api.cancelarReserva(form.elements.codigo.value, form.elements.nombre.value);
    const actualizada = await api.consultarReserva(form.elements.codigo.value, form.elements.nombre.value);
    pintar(actualizada);
    $('#consulta-alerta').innerHTML = alerta('exito', 'Reserva cancelada.', 'La mesa quedó libre para otros clientes.');
  } catch (err) {
    restaurar();
    $('#consulta-alerta').innerHTML = alerta('error', 'No pudimos cancelar la reserva.', err.message);
  }
}
