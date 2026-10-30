// Flujo de reserva en 3 pasos: mesa → fecha y hora → datos → confirmación.
// La disponibilidad que se muestra es orientativa; la confirmación real la
// da la base de datos (crear_reserva), que rechaza horarios ya tomados.
import * as api from './api.js';
import { errorConfiguracion } from './supabase.js';
import {
  ahoraBogota, aFechaLocal, aTextoFecha, diaIso, aMinutos, sumarDias, formatoHora, formatoFechaLarga,
  nombreMes, nombreZona, capitalizar,
} from './formato.js';
import { horariosDeMesa, horasLibres, estadoDia, DIAS_MAXIMOS } from './disponibilidad.js';
import { validarDatosReserva, tieneErrores } from './validaciones.js';
import {
  $, $$, esc, icono, alerta, estadoVacio, ilustracionMesa, imagenOIlustracion, botonCargando, mostrarErrores, marcarCampo,
} from './ui.js';

const params = new URLSearchParams(location.search);
const s = {
  ahora: ahoraBogota(),
  mesas: [],
  horarios: [],
  ocupacionPorMes: new Map(), // 'AAAA-MM' -> filas de ocupacion()
  cargandoMes: false,
  errorMes: null,
  paso: 1,
  mesaId: Number(params.get('mesa')) || null,
  fecha: params.get('fecha'),
  hora: params.get('hora'),
  personas: Number(params.get('personas')) || 2,
  minimoPersonas: 0,
  nombre: '',
  contacto: '',
  mes: null,
  aviso: null, // alerta HTML para el próximo paso (p. ej. "el horario se ocupó")
  avisoPaso: null,
};
const fechaMaxima = sumarDias(s.ahora.fecha, DIAS_MAXIMOS);
const panel = () => $('#panel');
const mesaActual = () => s.mesas.find((m) => Number(m.id) === s.mesaId) ?? null;
const ocupacion = () => [...s.ocupacionPorMes.values()].flat();

iniciar();

async function iniciar() {
  $('#volver-sitio').innerHTML = `${icono('chevronIzq')}<span>Volver al sitio</span>`;
  if (errorConfiguracion) {
    $('#aviso-config').innerHTML = `<div class="aviso-config"><div class="contenedor">${icono('aviso')}${esc(errorConfiguracion)}</div></div>`;
  }
  await cargarBase();
}

async function cargarBase() {
  panel().innerHTML = '<div class="esqueleto" aria-busy="true"><span></span><span></span><span></span></div>';
  try {
    const [mesas, horarios] = await Promise.all([api.obtenerMesasActivas(), api.obtenerHorarios()]);
    s.mesas = mesas.map((m) => ({ ...m, id: Number(m.id) }));
    s.horarios = horarios.filter((h) => h.activo);
  } catch (e) {
    panel().innerHTML = alerta('error', 'No pudimos cargar las mesas.', e.message,
      '<div class="alerta__acciones"><button type="button" class="btn btn--verde btn--pequeno" id="reintentar-base">Reintentar</button></div>');
    $('#reintentar-base').addEventListener('click', cargarBase);
    pintarResumen();
    return;
  }

  // Si se llega desde la portada con una mesa válida, se salta al paso 2.
  if (s.mesaId && !mesaActual()) {
    s.aviso = alerta('aviso', 'Esa mesa ya no está disponible.', 'Elige otra mesa para continuar.');
    s.mesaId = null;
  }
  if (s.fecha && (s.fecha < s.ahora.fecha || s.fecha > fechaMaxima || !/^\d{4}-\d{2}-\d{2}$/.test(s.fecha))) s.fecha = null;
  s.mes = (s.fecha ?? s.ahora.fecha).slice(0, 7);
  if (mesaActual()) s.personas = Math.min(s.personas, mesaActual().capacidad);
  await irAPaso(mesaActual() ? 2 : 1, false);
}

// ---------------------------------------------------------------------
// Navegación entre pasos
// ---------------------------------------------------------------------
async function irAPaso(paso, enfocar = true) {
  s.paso = paso;
  s.avisoPaso = s.aviso;
  s.aviso = null;
  pintarPasador();
  pintarResumen();
  if (paso === 1) pintarPaso1();
  if (paso === 2) {
    pintarPaso2();
    await cargarMes(s.mes);
  }
  if (paso === 3) pintarPaso3();
  if (enfocar) {
    $('#titulo-paso')?.focus({ preventScroll: true });
    $('#flujo').scrollIntoView({ block: 'start' });
  }
}

function pintarPasador() {
  $('#paso-texto').textContent = `Paso ${s.paso} de 3 · Sin cuenta ni pagos`;
  $$('#pasador li').forEach((li) => {
    const n = Number(li.dataset.paso);
    li.classList.toggle('hecho', n < s.paso);
    if (n === s.paso) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
    li.querySelector('.pasador__num').innerHTML = n < s.paso ? icono('check') : String(n);
  });
}

/** Aviso del paso actual: se mantiene mientras el usuario siga en ese paso. */
const avisoDelPaso = () => s.avisoPaso ?? '';

// ---------------------------------------------------------------------
// Paso 1 · Mesa
// ---------------------------------------------------------------------
function pintarPaso1() {
  const mesas = s.mesas.filter((m) => m.capacidad >= s.minimoPersonas);
  const filtro = s.minimoPersonas
    ? `<p class="nota">${icono('info')}<span>Mostrando mesas para ${s.minimoPersonas} o más personas. <button type="button" class="btn btn--terciario" id="ver-todas">Ver todas</button></span></p>`
    : '';
  panel().innerHTML = `
    <h2 id="titulo-paso" tabindex="-1">¿Dónde te sientas?</h2>
    <p class="entradilla-panel">Elige una mesa del salón o de la terraza. Después verás sus horarios libres.</p>
    ${avisoDelPaso()}
    ${filtro}
    ${mesas.length ? `<div class="opciones-mesa" role="group" aria-label="Mesas disponibles">${mesas.map((m) => `
      <button type="button" class="opcion-mesa" data-mesa="${m.id}" aria-pressed="${m.id === s.mesaId}">
        <span class="opcion-mesa__arte">${imagenOIlustracion(m.foto_url, ilustracionMesa(m), '')}</span>
        <span class="opcion-mesa__cuerpo"><strong>${esc(m.nombre)}</strong><span>${nombreZona(m.zona)} · hasta ${m.capacidad} personas</span></span>
      </button>`).join('')}</div>`
    : estadoVacio({ titulo: 'No hay mesas para ese grupo', texto: 'Por ahora no tenemos mesas activas con esa capacidad. Escríbenos para grupos grandes.', icono: 'mesa' })}
    <div class="panel__acciones">
      <a class="btn btn--secundario" href="index.html">${icono('flechaIzquierda')}Volver al inicio</a>
      <button type="button" class="btn btn--primario" id="continuar-1" ${mesaActual() ? '' : 'disabled'}>Continuar a fecha y hora ${icono('flechaDerecha')}</button>
    </div>`;

  panel().querySelectorAll('[data-mesa]').forEach((b) => b.addEventListener('click', () => {
    const anterior = s.mesaId;
    s.mesaId = Number(b.dataset.mesa);
    if (anterior !== s.mesaId) s.hora = null;
    panel().querySelectorAll('[data-mesa]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#continuar-1').disabled = false;
    pintarResumen();
  }));
  $('#ver-todas')?.addEventListener('click', () => { s.minimoPersonas = 0; pintarPaso1(); });
  $('#continuar-1').addEventListener('click', () => {
    if (s.personas > mesaActual().capacidad) s.personas = mesaActual().capacidad;
    irAPaso(2);
  });
}

// ---------------------------------------------------------------------
// Paso 2 · Fecha y hora
// ---------------------------------------------------------------------
async function cargarMes(mes) {
  s.mes = mes;
  if (s.ocupacionPorMes.has(mes)) { elegirFechaInicial(); pintarPaso2(); return; }
  const primero = `${mes}-01`;
  const ultimo = aTextoFecha(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0));
  const desde = primero < s.ahora.fecha ? s.ahora.fecha : primero;
  const hasta = ultimo > fechaMaxima ? fechaMaxima : ultimo;
  s.cargandoMes = true;
  s.errorMes = null;
  pintarPaso2();
  try {
    s.ocupacionPorMes.set(mes, desde <= hasta ? await api.obtenerOcupacion(desde, hasta) : []);
  } catch (e) {
    s.errorMes = e.message;
  }
  s.cargandoMes = false;
  elegirFechaInicial();
  pintarPaso2();
}

/** Si no hay fecha elegida, propone el primer día con cupo del mes visible. */
function elegirFechaInicial() {
  if (s.errorMes || !s.ocupacionPorMes.has(s.mes)) return;
  if (s.fecha && s.fecha.startsWith(s.mes)) {
    if (s.hora && !horasLibres(contexto(s.fecha)).some((h) => h.hora === s.hora)) s.hora = null;
    return;
  }
  if (s.fecha) return;
  for (const f of diasDelMes(s.mes)) {
    if (estadoDia(contexto(f)) === 'disponible') { s.fecha = f; return; }
  }
}

const contexto = (fecha, mesaId = s.mesaId) => ({
  horarios: s.horarios, ocupacion: ocupacion(), mesaId, fecha, ahora: s.ahora,
});

function diasDelMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const total = new Date(a, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
}

function pintarPaso2() {
  if (s.paso !== 2) return;
  const mesa = mesaActual();
  const duracion = s.horarios[0]?.duracion_min ?? 60;
  panel().innerHTML = `
    <h2 id="titulo-paso" tabindex="-1">¿Cuándo vienes?</h2>
    <p class="entradilla-panel">Elige un día y una hora de inicio. Cada reserva dura ${duracion} minutos.</p>
    ${avisoDelPaso()}
    ${calendarioHTML()}
    <div id="zona-horas">${horasHTML(mesa)}</div>
    <p class="nota">${icono('reloj')}<span>Duración estimada: ${duracion} minutos. Los horarios tachados ya están ocupados.</span></p>
    <div class="panel__acciones">
      <button type="button" class="btn btn--secundario" id="cambiar-mesa">${icono('flechaIzquierda')}Cambiar mesa</button>
      <button type="button" class="btn btn--primario" id="continuar-2" ${s.fecha && s.hora ? '' : 'disabled'}>Continuar a tus datos ${icono('flechaDerecha')}</button>
    </div>`;

  $('#mes-anterior')?.addEventListener('click', () => cambiarMes(-1));
  $('#mes-siguiente')?.addEventListener('click', () => cambiarMes(1));
  panel().querySelectorAll('[data-fecha]').forEach((b) => b.addEventListener('click', () => {
    s.fecha = b.dataset.fecha;
    s.hora = null;
    pintarPaso2();
    pintarResumen();
    $(`[data-fecha="${s.fecha}"]`)?.focus();
  }));
  panel().querySelectorAll('[data-hora]').forEach((b) => b.addEventListener('click', () => {
    s.hora = b.dataset.hora;
    pintarPaso2();
    pintarResumen();
    $(`[data-hora="${s.hora}"]`)?.focus();
  }));
  panel().querySelectorAll('[data-sugerencia]').forEach((b) => b.addEventListener('click', () => {
    const [mesaId, hora] = b.dataset.sugerencia.split('|');
    s.mesaId = Number(mesaId);
    s.hora = hora;
    s.personas = Math.min(s.personas, mesaActual().capacidad);
    pintarPaso2();
    pintarResumen();
  }));
  $('#reintentar-mes')?.addEventListener('click', () => cargarMes(s.mes));
  $('#cambiar-mesa').addEventListener('click', () => irAPaso(1));
  $('#continuar-2').addEventListener('click', () => irAPaso(3));
}

function cambiarMes(delta) {
  const [a, m] = s.mes.split('-').map(Number);
  const nuevo = aTextoFecha(new Date(a, m - 1 + delta, 1)).slice(0, 7);
  cargarMes(nuevo);
}

function calendarioHTML() {
  const [a, m] = s.mes.split('-').map(Number);
  const desfase = (aFechaLocal(`${s.mes}-01`).getDay() + 6) % 7; // lunes = 0
  const listo = s.ocupacionPorMes.has(s.mes) && !s.cargandoMes;
  const dias = diasDelMes(s.mes).map((f) => {
    const n = Number(f.slice(8));
    const estado = listo ? estadoDia(contexto(f)) : 'cerrado';
    const elegido = f === s.fecha;
    const nombre = capitalizar(formatoFechaLarga(f));
    if (estado === 'cerrado' && listo) {
      return `<button type="button" class="dia dia--cerrado" disabled aria-label="${nombre}, cerrado o no disponible">${n}</button>`;
    }
    if (estado === 'sin-cupo') {
      return `<button type="button" class="dia dia--sin-cupo" disabled aria-label="${nombre}, sin cupo para esta mesa">${n}${icono('x')}</button>`;
    }
    if (!listo) return `<button type="button" class="dia" disabled>${n}</button>`;
    return `<button type="button" class="dia ${f === s.ahora.fecha ? 'dia--hoy' : ''}" data-fecha="${f}" aria-pressed="${elegido}"
      aria-label="${nombre}${elegido ? ', seleccionado' : ''}">${n}${elegido ? icono('check') : ''}</button>`;
  });
  const hayAnterior = s.mes > s.ahora.fecha.slice(0, 7);
  const haySiguiente = s.mes < fechaMaxima.slice(0, 7);
  return `
    <div class="calendario">
      <div class="calendario__cabecera">
        <button type="button" class="btn-circulo" id="mes-anterior" aria-label="Mes anterior" ${hayAnterior ? '' : 'disabled'}>${icono('chevronIzq')}</button>
        <h3 aria-live="polite">${capitalizar(nombreMes(m))} ${a}</h3>
        <button type="button" class="btn-circulo" id="mes-siguiente" aria-label="Mes siguiente" ${haySiguiente ? '' : 'disabled'}>${icono('chevronDer')}</button>
      </div>
      <div class="calendario__rejilla">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="calendario__dia-semana" aria-hidden="true">${d}</span>`).join('')}
        ${'<span></span>'.repeat(desfase)}${dias.join('')}
      </div>
      <div class="leyenda">
        <span class="etiqueta etiqueta--exito">${icono('check')}Seleccionado</span>
        <span class="etiqueta etiqueta--neutra">${icono('x')}Sin cupo</span>
        <span class="etiqueta etiqueta--neutra">${icono('menos')}Cerrado (rayado)</span>
      </div>
    </div>`;
}

function horasHTML(mesa) {
  if (s.cargandoMes) return '<div class="esqueleto" aria-busy="true" aria-label="Cargando horarios"><span></span><span></span></div>';
  if (s.errorMes) {
    return alerta('error', 'No pudimos consultar los horarios.', s.errorMes,
      '<div class="alerta__acciones"><button type="button" class="btn btn--verde btn--pequeno" id="reintentar-mes">Reintentar</button></div>');
  }
  if (!s.fecha) {
    return `<div class="jornada">${alerta('info', 'Elige un día del calendario.', 'Los días rayados están cerrados y los marcados con × no tienen cupo para esta mesa.')}</div>`;
  }
  const jornadas = horariosDeMesa(contexto(s.fecha));
  const libres = jornadas.flatMap((j) => j.horas).filter((h) => h.estado === 'libre');
  const bloques = jornadas.map((j) => `
    <div class="jornada">
      <div class="jornada__titulo">${icono(j.jornada === 'almuerzo' ? 'sol' : 'luna')}<h4>${capitalizar(j.jornada)}</h4>
        <span>${formatoHora(j.hora_inicio)} – ${formatoHora(j.hora_fin)}</span></div>
      <div class="horas" role="group" aria-label="Horas de ${j.jornada}">
        ${j.horas.map((h) => {
    if (h.estado !== 'libre') {
      return `<button type="button" class="hora" disabled aria-label="${formatoHora(h.hora)}, ${h.estado === 'pasado' ? 'ya pasó' : 'ocupado'}">${formatoHora(h.hora)}</button>`;
    }
    const elegida = h.hora === s.hora;
    return `<button type="button" class="hora" data-hora="${h.hora}" aria-pressed="${elegida}">${elegida ? icono('check') : ''}${formatoHora(h.hora)}</button>`;
  }).join('')}
      </div>
    </div>`).join('');
  return `${libres.length ? '' : sugerenciasHTML(mesa)}${bloques}`;
}

/** Cuando la mesa no tiene horas libres ese día, sugiere otras mesas con cupo. */
function sugerenciasHTML(mesa) {
  const otras = s.mesas
    .filter((m) => m.id !== mesa.id && m.capacidad >= Math.min(s.personas, mesa.capacidad))
    .map((m) => ({ m, libre: horasLibres(contexto(s.fecha, m.id))[0] }))
    .filter((x) => x.libre)
    .slice(0, 3);
  const botones = otras.map(({ m, libre }) =>
    `<button type="button" class="btn btn--secundario btn--pequeno" data-sugerencia="${m.id}|${libre.hora}">${esc(m.nombre)} · desde ${formatoHora(libre.hora)}</button>`).join('');
  return `<div class="jornada">${alerta('info', `La ${mesa.nombre} no tiene horarios libres ese día.`,
    otras.length ? 'Prueba con otra mesa o cambia de fecha.' : 'Todas nuestras mesas están completas ese día. Elige otra fecha.',
    botones ? `<div class="alerta__acciones">${botones}</div>` : '')}</div>`;
}

// ---------------------------------------------------------------------
// Paso 3 · Tus datos
// ---------------------------------------------------------------------
function pintarPaso3() {
  const mesa = mesaActual();
  panel().innerHTML = `
    <h2 id="titulo-paso" tabindex="-1">Tus datos</h2>
    <p class="entradilla-panel">Solo necesitamos tu nombre y cuántos vienen. Nada de cuentas ni contraseñas.</p>
    <div id="alerta-datos">${avisoDelPaso()}</div>
    <form class="formulario" id="form-datos" novalidate>
      <div class="campo">
        <label for="nombre">Nombre completo *</label>
        <input class="entrada" id="nombre" name="nombre" autocomplete="name" maxlength="80" required placeholder="Ej.: Laura Gómez" value="${esc(s.nombre)}">
      </div>
      <div class="campo">
        <span class="campo__etiqueta" id="etiqueta-personas">Número de personas *</span>
        <div class="contador" role="group" aria-labelledby="etiqueta-personas">
          <button type="button" class="contador__btn" id="menos" aria-label="Una persona menos">${icono('menos')}</button>
          <output class="contador__valor" id="valor-personas" aria-live="polite">${s.personas}</output>
          <button type="button" class="contador__btn" id="mas" aria-label="Una persona más">${icono('mas')}</button>
        </div>
        <input type="hidden" name="personas" value="${s.personas}">
        <p class="campo__ayuda">La ${esc(mesa.nombre)} recibe hasta ${mesa.capacidad} personas.</p>
        <div id="acciones-capacidad" class="sugerencias" hidden></div>
      </div>
      <div class="campo">
        <label for="contacto">Teléfono o WhatsApp <span class="campo__opcional">(opcional)</span></label>
        <input class="entrada" id="contacto" name="contacto" type="tel" autocomplete="tel" maxlength="40" placeholder="Para avisarte si algo cambia" value="${esc(s.contacto)}">
      </div>
      <div class="panel__acciones">
        <button type="button" class="btn btn--secundario" id="cambiar-hora">${icono('flechaIzquierda')}Cambiar fecha u hora</button>
        <button type="submit" class="btn btn--primario" id="confirmar">Confirmar reserva</button>
      </div>
      <p class="nota" id="nota-guardando" hidden>${icono('info')}<span>No cierres esta página: tarda solo unos segundos.</span></p>
    </form>`;

  const form = $('#form-datos');
  form.elements.nombre.addEventListener('input', (e) => {
    s.nombre = e.target.value;
    if (e.target.getAttribute('aria-invalid')) marcarCampo(form, 'nombre', validarDatosReserva(datos(), mesa).nombre);
  });
  form.elements.contacto.addEventListener('input', (e) => {
    s.contacto = e.target.value;
    if (e.target.getAttribute('aria-invalid')) marcarCampo(form, 'contacto', validarDatosReserva(datos(), mesa).contacto);
  });
  $('#menos').addEventListener('click', () => cambiarPersonas(s.personas - 1));
  $('#mas').addEventListener('click', () => cambiarPersonas(s.personas + 1));
  $('#cambiar-hora').addEventListener('click', () => irAPaso(2));
  form.addEventListener('submit', (e) => { e.preventDefault(); confirmarReserva(); });
  actualizarPersonas();
}

const datos = () => ({ nombre: s.nombre, personas: s.personas, contacto: s.contacto });

function cambiarPersonas(valor) {
  s.personas = Math.max(1, Math.min(12, valor));
  actualizarPersonas();
  pintarResumen();
}

/** Actualiza el contador sin repintar el formulario (para no perder el foco). */
function actualizarPersonas() {
  const mesa = mesaActual();
  const form = $('#form-datos');
  const excede = s.personas > mesa.capacidad;
  $('#valor-personas').textContent = s.personas;
  $('#valor-personas').classList.toggle('es-error', excede);
  form.elements.personas.value = s.personas;
  $('#menos').disabled = s.personas <= 1;
  $('#mas').disabled = s.personas >= 12;
  $('#confirmar').disabled = excede;

  const campo = $('#valor-personas').closest('.campo');
  campo.querySelector('.campo__error')?.remove();
  const acciones = $('#acciones-capacidad');
  if (excede) {
    const error = document.createElement('p');
    error.className = 'campo__error';
    error.setAttribute('role', 'alert');
    error.innerHTML = `${icono('aviso')}${esc(validarDatosReserva(datos(), mesa).personas)}`;
    campo.insertBefore(error, acciones);
    acciones.innerHTML = `
      <button type="button" class="btn btn--secundario btn--pequeno" id="ver-mas-grandes">Ver mesas para ${s.personas} o más</button>
      <button type="button" class="btn btn--secundario btn--pequeno" id="bajar-personas">Bajar a ${mesa.capacidad} personas</button>`;
    acciones.hidden = false;
    $('#ver-mas-grandes').addEventListener('click', () => {
      s.minimoPersonas = s.personas;
      s.mesaId = null;
      s.hora = null;
      irAPaso(1);
    });
    $('#bajar-personas').addEventListener('click', () => cambiarPersonas(mesa.capacidad));
  } else {
    acciones.hidden = true;
    acciones.innerHTML = '';
  }
}

async function confirmarReserva() {
  const form = $('#form-datos');
  const mesa = mesaActual();
  const errores = validarDatosReserva(datos(), mesa);
  mostrarErrores(form, errores, ['nombre', 'contacto']);
  if (tieneErrores(errores)) {
    const n = Object.keys(errores).length;
    $('#alerta-datos').innerHTML = alerta('error', `Falta${n > 1 ? 'n' : ''} ${n} dato${n > 1 ? 's' : ''} para guardar tu reserva.`,
      'Revisa el campo marcado con el icono de advertencia.');
    return;
  }

  $('#alerta-datos').innerHTML = '';
  const restaurar = botonCargando($('#confirmar'), 'Guardando tu reserva…');
  $('#cambiar-hora').disabled = true;
  $('#nota-guardando').hidden = false;
  try {
    const reserva = await api.crearReserva({
      mesaId: mesa.id, fecha: s.fecha, hora: s.hora, nombre: s.nombre, personas: s.personas, contacto: s.contacto,
    });
    mostrarConfirmacion(reserva);
  } catch (e) {
    restaurar();
    $('#cambiar-hora').disabled = false;
    $('#nota-guardando').hidden = true;
    await manejarErrorReserva(e);
  }
}

async function manejarErrorReserva(e) {
  switch (e.codigo) {
    case 'HORARIO_OCUPADO': {
      const hora = s.hora;
      s.ocupacionPorMes.delete(s.mes); // datos viejos: se vuelven a pedir
      s.hora = null;
      s.aviso = alerta('aviso', `Alguien acaba de reservar las ${formatoHora(hora)}`,
        'Tu nombre y el número de personas siguen guardados. Elige otra hora y continúa.');
      await irAPaso(2);
      return;
    }
    case 'MESA_NO_DISPONIBLE':
    case 'CAPACIDAD_EXCEDIDA':
      try {
        s.mesas = (await api.obtenerMesasActivas()).map((m) => ({ ...m, id: Number(m.id) }));
      } catch { /* se mantiene la lista anterior */ }
      if (!mesaActual()) s.mesaId = null;
      s.aviso = alerta('aviso', 'No pudimos reservar esa mesa.', e.message);
      await irAPaso(1);
      return;
    case 'FUERA_DE_HORARIO':
    case 'HORARIO_PASADO':
    case 'FECHA_FUERA_DE_RANGO':
      s.ahora = ahoraBogota();
      s.hora = null;
      s.aviso = alerta('aviso', 'Ese horario ya no se puede reservar.', e.message);
      await irAPaso(2);
      return;
    default:
      // Error de conexión o desconocido: la reserva NO está confirmada.
      $('#alerta-datos').innerHTML = alerta('error', 'No pudimos guardar tu reserva.',
        `Tu mesa todavía no está confirmada. ${e.message} Tus datos siguen aquí.`,
        `<div class="alerta__acciones">
          <button type="button" class="btn btn--verde btn--pequeno" id="reintentar-guardar">${icono('reintentar')}Reintentar</button>
          <button type="button" class="btn btn--secundario btn--pequeno" id="volver-datos">Volver a mis datos</button>
        </div>`);
      $('#reintentar-guardar').addEventListener('click', confirmarReserva);
      $('#volver-datos').addEventListener('click', () => $('#nombre').focus());
      $('#alerta-datos').scrollIntoView({ block: 'center' });
  }
}

// ---------------------------------------------------------------------
// Resumen lateral y confirmación
// ---------------------------------------------------------------------
function resumenHTML({ mesa, fecha, hora, personas, duracion, cambiar = true, extra = '' }) {
  const fila = (ico, texto, valor) => `<div><dt>${ico ? icono(ico) : ''}${texto}</dt><dd>${valor}</dd></div>`;
  return `
    <div class="resumen">
      <div class="resumen__arte">${mesa ? imagenOIlustracion(mesa.foto_url, ilustracionMesa(mesa), `Foto de ${mesa.nombre}`) : ilustracionMesa({ id: 0, zona: 'salon', capacidad: 4 })}</div>
      <div class="resumen__cuerpo">
        <div class="resumen__cabecera"><p class="antetitulo">Tu reserva</p>
          ${cambiar && mesa ? '<button type="button" class="btn btn--terciario" id="resumen-cambiar">Cambiar</button>' : ''}</div>
        <h2>${mesa ? esc(mesa.nombre) : 'Elige una mesa'}</h2>
        <p class="resumen__zona">${mesa ? `${nombreZona(mesa.zona)} · hasta ${mesa.capacidad} personas` : 'Salón o terraza'}</p>
        <dl>
          ${extra}
          ${fila('calendario', 'Fecha', fecha ? capitalizar(formatoFechaLarga(fecha)) : '—')}
          ${fila('reloj', 'Hora', hora ? formatoHora(hora) : '—')}
          ${fila('persona', 'Personas', personas ?? '—')}
          ${fila('', 'Duración', `${duracion} minutos`)}
        </dl>
        <p class="resumen__nota">Carrera 36 con calle 41, Bucaramanga. Te recomendamos llegar 10 minutos antes.</p>
      </div>
    </div>`;
}

function pintarResumen() {
  const duracion = (s.fecha && s.horarios.find((h) => h.dia_semana === diaIso(s.fecha))?.duracion_min)
    ?? s.horarios[0]?.duracion_min ?? 60;
  $('#resumen').innerHTML = resumenHTML({
    mesa: mesaActual(), fecha: s.paso >= 2 ? s.fecha : null, hora: s.paso >= 2 ? s.hora : null,
    personas: s.personas, duracion,
  });
  $('#resumen-cambiar')?.addEventListener('click', () => irAPaso(1));
}

function mostrarConfirmacion(r) {
  const mesa = { ...mesaActual(), nombre: r.mesa_nombre, zona: r.zona };
  const duracion = aMinutos(r.hora_fin) - aMinutos(r.hora_inicio);
  $('#flujo').hidden = true;
  const cont = $('#confirmacion');
  cont.innerHTML = `
    <div class="confirmacion__sello">${icono('check')}</div>
    <h1 id="titulo-confirmacion">¡Listo, ${esc(r.cliente_nombre.split(' ')[0])}! Tu mesa te espera</h1>
    <p>Guardamos tu reserva. Si necesitas cambiarla, comunícate con el restaurante.</p>
    ${alerta('exito', 'Reserva guardada.', 'Tu mesa quedó confirmada.')}
    ${resumenHTML({
    mesa, fecha: r.fecha, hora: r.hora_inicio.slice(0, 5), personas: r.num_personas, duracion, cambiar: false,
    extra: `<div><dt>${icono('persona')}A nombre de</dt><dd>${esc(r.cliente_nombre)}</dd></div>`,
  })}
    <p class="codigo">Código de reserva: ${esc(String(r.id).slice(0, 8).toUpperCase())}</p>
    <div class="confirmacion__acciones">
      <a class="btn btn--primario" href="index.html">Volver al inicio</a>
      <a class="btn btn--secundario" href="reservar.html">Hacer otra reserva</a>
    </div>`;
  cont.hidden = false;
  cont.focus();
  window.scrollTo({ top: 0 });
}
