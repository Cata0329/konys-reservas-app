// Panel · Horarios: jornadas por día de la semana (crear, editar, activar y eliminar).
// La base de datos impide jornadas cruzadas y jornadas donde no cabe una reserva.
import * as api from '../api.js';
import { aMinutos, aHora, formatoHora, nombreDiaIso, capitalizar } from '../formato.js';
import { validarHorario, tieneErrores } from '../validaciones.js';
import { $, esc, icono, etiqueta, confirmar, notificar } from '../ui.js';
import { interruptor, alternar } from './comun.js';

const ESCALA = { inicio: 12 * 60, fin: 23 * 60 }; // 12 p. m. a 11 p. m. en la vista semanal
const DURACIONES = [30, 45, 60, 75, 90, 120];
// Opciones de hora cada 30 min de 6:00 a 23:30 (las jornadas no cruzan la medianoche).
const HORAS = Array.from({ length: 36 }, (_, i) => aHora(6 * 60 + i * 30));

export async function montar(cont) {
  let horarios = await api.obtenerHorarios();
  let editando = null; // id del horario en edición, o 'nuevo-<dia>'

  cont.innerHTML = `
    <header class="principal__cabecera">
      <div><h1>Horarios</h1><p>Define las jornadas de cada día. Los clientes solo ven horas dentro de estas franjas.</p></div>
    </header>
    <section class="caja" aria-labelledby="titulo-semana">
      <div class="caja__cabecera"><h2 id="titulo-semana">La semana de un vistazo</h2>
        <div class="leyenda-semana" aria-hidden="true"><span><i class="muestra--almuerzo"></i>Almuerzo</span><span><i class="muestra--noche"></i>Noche</span></div></div>
      <div id="semana"></div>
    </section>
    <div class="tabla-envoltura tabla-envoltura--separada" id="tabla-horarios"></div>`;

  const delDia = (d) => horarios.filter((h) => h.dia_semana === d).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const pos = (min) => ((min - ESCALA.inicio) / (ESCALA.fin - ESCALA.inicio)) * 100;

  function pintarSemana() {
    const marcas = [12, 15, 18, 21, 23].map((h) =>
      `<span style="left:${pos(h * 60)}%">${formatoHora(aHora(h * 60)).replace(':00', '')}</span>`).join('');
    const filas = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const jornadas = delDia(d);
      const pista = jornadas.length
        ? `<div class="semana__pista">${jornadas.map((j) => {
          const a = Math.max(ESCALA.inicio, aMinutos(j.hora_inicio));
          const b = Math.min(ESCALA.fin, aMinutos(j.hora_fin));
          return `<span class="semana__bloque semana__bloque--${j.jornada} ${j.activo ? '' : 'semana__bloque--inactivo'}"
              style="left:${pos(a)}%;width:${pos(b) - pos(a)}%" title="${capitalizar(j.jornada)} ${formatoHora(j.hora_inicio)}–${formatoHora(j.hora_fin)}">
              ${etiquetaBloque(j)}</span>`;
        }).join('')}</div>`
        : '<div class="semana__pista semana__pista--cerrado">Sin atención</div>';
      return `<div class="semana__fila"><span>${nombreDiaIso(d)}</span>${pista}</div>`;
    }).join('');
    $('#semana').innerHTML = `<div class="semana"><div class="semana__escala"><span></span><div class="semana__marcas">${marcas}</div></div>${filas}</div>`;
  }

  // En la vista semanal: "Noche 5:00–11:00 p. m."; las jornadas cortas solo muestran las horas.
  const sinSufijo = (h) => formatoHora(h).replace(/ [ap]\. m\./, '');
  const etiquetaBloque = (j) => (aMinutos(j.hora_fin) - aMinutos(j.hora_inicio) >= 240
    ? `${capitalizar(j.jornada)} ${sinSufijo(j.hora_inicio)}–${formatoHora(j.hora_fin)}`
    : `${sinSufijo(j.hora_inicio)}–${sinSufijo(j.hora_fin)}`);

  const opcionesHora = (sel) => HORAS.map((h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${formatoHora(h)}</option>`).join('');

  function filaEdicion(h, dia, primera) {
    const id = h?.id ?? `nuevo-${dia}`;
    const jornadasLibres = ['almuerzo', 'noche'].filter((j) => j === h?.jornada || !delDia(dia).some((x) => x.jornada === j));
    return `<tr class="fila-edicion" data-fila="${id}">
      <th scope="row">${primera ? nombreDiaIso(dia) : ''}</th>
      <td><label class="visualmente-oculto" for="j-${id}">Jornada</label>
        <select class="selector" id="j-${id}" data-campo="jornada">${jornadasLibres.map((j) =>
  `<option value="${j}" ${j === h?.jornada ? 'selected' : ''}>${capitalizar(j)}</option>`).join('')}</select></td>
      <td><label class="visualmente-oculto" for="i-${id}">Inicio</label>
        <select class="selector" id="i-${id}" data-campo="hora_inicio">${opcionesHora(h?.hora_inicio?.slice(0, 5) ?? (jornadasLibres[0] === 'almuerzo' ? '12:30' : '17:00'))}</select></td>
      <td><label class="visualmente-oculto" for="f-${id}">Fin</label>
        <select class="selector" id="f-${id}" data-campo="hora_fin">${opcionesHora(h?.hora_fin?.slice(0, 5) ?? (jornadasLibres[0] === 'almuerzo' ? '14:30' : '23:00'))}</select></td>
      <td><label class="visualmente-oculto" for="d-${id}">Duración de la reserva</label>
        <select class="selector" id="d-${id}" data-campo="duracion_min">${DURACIONES.map((d) =>
  `<option value="${d}" ${d === (h?.duracion_min ?? 60) ? 'selected' : ''}>${d} min</option>`).join('')}</select></td>
      <td>${etiqueta(h && !h.activo ? 'inactivo' : 'activo')}</td>
      <td></td>
      <td><div class="tabla__acciones">
        <button type="button" class="btn btn--secundario btn--pequeno" data-cancelar>Cancelar</button>
        <button type="button" class="btn btn--verde btn--pequeno" data-guardar="${id}" data-dia="${dia}">Guardar</button>
      </div></td>
    </tr>
    <tr class="error-fila" data-error="${id}" hidden><td colspan="8"></td></tr>`;
  }

  function filaLectura(h, dia, primera) {
    return `<tr>
      <th scope="row">${primera ? nombreDiaIso(dia) : ''}</th>
      <td><span class="tarjeta-mesa__meta">${icono(h.jornada === 'almuerzo' ? 'sol' : 'luna')}${capitalizar(h.jornada)}</span></td>
      <td>${formatoHora(h.hora_inicio)}</td>
      <td>${formatoHora(h.hora_fin)}</td>
      <td>${h.duracion_min} min</td>
      <td>${etiqueta(h.activo ? 'activo' : 'inactivo')}</td>
      <td>${interruptor({ nombre: 'activo', id: `activo-${h.id}`, marcado: h.activo, texto: `<span class="visualmente-oculto">${nombreDiaIso(dia)} ${h.jornada} activo</span>` })}</td>
      <td><div class="tabla__acciones">
        <button type="button" class="btn btn--secundario btn--pequeno" data-editar="${h.id}">${icono('lapiz')}Editar</button>
        <button type="button" class="btn btn--secundario btn--pequeno" data-eliminar="${h.id}" aria-label="Eliminar ${h.jornada} del ${nombreDiaIso(dia)}">${icono('papelera')}</button>
      </div></td>
    </tr>`;
  }

  function pintarTabla() {
    const filas = [1, 2, 3, 4, 5, 6, 7].map((dia) => {
      const jornadas = delDia(dia);
      const html = jornadas.map((h, i) => (editando === h.id ? filaEdicion(h, dia, i === 0) : filaLectura(h, dia, i === 0)));
      if (editando === `nuevo-${dia}`) html.push(filaEdicion(null, dia, jornadas.length === 0));
      else if (jornadas.length < 2) {
        html.push(`<tr><th scope="row">${jornadas.length ? '' : nombreDiaIso(dia)}</th>
          <td colspan="4" class="texto-tenue">${jornadas.length ? '' : '—'}</td>
          <td>${jornadas.length ? '' : etiqueta('sin-atencion')}</td><td></td>
          <td><div class="tabla__acciones"><button type="button" class="btn btn--secundario btn--pequeno" data-nuevo="${dia}">${icono('mas')}Añadir jornada</button></div></td></tr>`);
      }
      return `<tbody>${html.join('')}</tbody>`;
    }).join('');
    $('#tabla-horarios').innerHTML = `<table class="tabla">
      <caption class="visualmente-oculto">Jornadas de atención por día</caption>
      <thead><tr><th scope="col">Día</th><th scope="col">Jornada</th><th scope="col">Inicio</th><th scope="col">Fin</th>
        <th scope="col">Duración de reserva</th><th scope="col">Estado</th><th scope="col">Activo</th><th scope="col"><span class="visualmente-oculto">Acciones</span></th></tr></thead>
      ${filas}</table>`;
    conectar();
  }

  function pintar() {
    pintarSemana();
    pintarTabla();
  }

  function conectar() {
    const t = $('#tabla-horarios');
    t.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => { editando = Number(b.dataset.editar); pintarTabla(); }));
    t.querySelectorAll('[data-nuevo]').forEach((b) => b.addEventListener('click', () => { editando = `nuevo-${b.dataset.nuevo}`; pintarTabla(); }));
    t.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', () => { editando = null; pintarTabla(); }));
    t.querySelectorAll('[data-guardar]').forEach((b) => b.addEventListener('click', () => guardar(b)));
    t.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () => eliminar(Number(b.dataset.eliminar))));
    t.querySelectorAll('input[id^="activo-"]').forEach((input) => input.addEventListener('change', async () => {
      const h = horarios.find((x) => `activo-${x.id}` === input.id);
      const ok = await alternar(input, (activo) => api.cambiarEstadoHorario(h.id, activo),
        (activo) => `${capitalizar(h.jornada)} del ${nombreDiaIso(h.dia_semana).toLowerCase()} ${activo ? 'activada' : 'desactivada'}.`);
      if (ok) { h.activo = input.checked; pintar(); }
    }));
    t.querySelector('.fila-edicion select')?.focus();
  }

  async function guardar(boton) {
    const id = boton.dataset.guardar;
    const fila = $(`[data-fila="${id}"]`);
    const valor = (c) => fila.querySelector(`[data-campo="${c}"]`).value;
    const existente = horarios.find((h) => String(h.id) === id);
    const datos = {
      id: existente?.id, dia_semana: Number(boton.dataset.dia), jornada: valor('jornada'),
      hora_inicio: valor('hora_inicio'), hora_fin: valor('hora_fin'), duracion_min: Number(valor('duracion_min')),
      activo: existente?.activo ?? true,
    };
    const errores = validarHorario(datos);
    const filaError = $(`[data-error="${id}"]`);
    if (tieneErrores(errores)) {
      filaError.hidden = false;
      filaError.firstElementChild.innerHTML = `<span class="campo__error">${icono('aviso')}${esc(Object.values(errores)[0])}</span>`;
      return;
    }
    boton.disabled = true;
    try {
      const guardado = await api.guardarHorario(datos);
      horarios = existente ? horarios.map((h) => (h.id === guardado.id ? guardado : h)) : [...horarios, guardado];
      editando = null;
      pintar();
      notificar('Horario guardado. El sitio público ya muestra las nuevas horas.');
    } catch (e) {
      boton.disabled = false;
      filaError.hidden = false;
      filaError.firstElementChild.innerHTML = `<span class="campo__error">${icono('aviso')}${esc(e.message)}</span>`;
    }
  }

  async function eliminar(id) {
    const h = horarios.find((x) => x.id === id);
    const r = await confirmar({
      titulo: `¿Eliminar la jornada de ${h.jornada} del ${nombreDiaIso(h.dia_semana).toLowerCase()}?`,
      texto: 'Los clientes dejarán de ver esas horas. Las reservas ya registradas se conservan. Si solo es temporal, desactívala.',
      botones: [{ valor: '', texto: 'Cancelar', clase: 'btn--secundario' }, { valor: 'si', texto: 'Sí, eliminar', clase: 'btn--destructivo' }],
    });
    if (r !== 'si') return;
    try {
      await api.eliminarHorario(id);
      horarios = horarios.filter((x) => x.id !== id);
      pintar();
      notificar('Jornada eliminada.');
    } catch (e) {
      notificar(e.message, 'error');
    }
  }

  pintar();
}
