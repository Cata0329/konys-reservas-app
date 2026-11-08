// Panel de administración: acceso con Supabase Auth, navegación entre
// secciones y cierre de sesión (manual o por 5 minutos de inactividad).
//
// Seguridad: ocultar el panel en el navegador NO es la protección real.
// La protección está en la base de datos (RLS + es_admin()): aunque alguien
// abriera el panel sin permiso, Supabase no le devolvería ni le dejaría
// cambiar ningún dato. Este archivo además:
//  - valida el token con el servidor de Supabase Auth al abrir el panel;
//  - borra de la URL cualquier token o código de autenticación;
//  - limita los intentos de acceso fallidos desde el navegador;
//  - cierra la sesión de verdad tras 5 minutos sin actividad.
import * as api from '../api.js';
import { supabase, errorConfiguracion } from '../supabase.js';
import { $, $$, esc, icono, alerta, pizza, botonCargando, marcarCampo } from '../ui.js';
import { crearVigilante } from './inactividad.js';
import * as resumen from './resumen.js';
import * as mesas from './mesas.js';
import * as horarios from './horarios.js';
import * as reservas from './reservas.js';
import * as categorias from './categorias.js';
import * as carta from './carta.js';

const SECCIONES = {
  resumen: { modulo: resumen, texto: 'Resumen', icono: 'resumen' },
  mesas: { modulo: mesas, texto: 'Mesas', icono: 'mesa' },
  horarios: { modulo: horarios, texto: 'Horarios', icono: 'reloj' },
  reservas: { modulo: reservas, texto: 'Reservas', icono: 'calendario' },
  categorias: { modulo: categorias, texto: 'Categorías', icono: 'etiqueta' },
  carta: { modulo: carta, texto: 'Carta', icono: 'carta' },
};

// Intentos de acceso: tras 5 fallos seguidos se bloquea el formulario 60 s.
// (Supabase Auth además limita los intentos en el servidor.)
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 60 * 1000;
const CLAVE_INTENTOS = 'konys-admin-intentos';
// En localStorage (compartido entre pestañas) solo se guardan una marca de tiempo
// de actividad y el aviso de cierre: NUNCA tokens. La sesión vive en sessionStorage.
const CLAVE_ACTIVIDAD = 'konys-admin-ultima-actividad';
const CLAVE_CIERRE = 'konys-admin-cierre';

let dentro = false;
let temporizadorBloqueo = null;
let ultimaEscritura = 0;

const vigilante = crearVigilante({
  alExpirar: () => salir('inactividad'),
  // Se guarda la última actividad (como mucho cada 2 s) para que recargar la
  // página no reinicie el contador y las demás pestañas del panel la adopten.
  alActividad: (momento) => {
    if (momento - ultimaEscritura < 2000) return;
    ultimaEscritura = momento;
    guardarCompartido(CLAVE_ACTIVIDAD, String(momento));
  },
  alAvisar: mostrarAvisoInactividad,
  alCancelarAviso: ocultarAvisoInactividad,
});

limpiarTokensDeUrl();
iniciar();

/** Quita de la URL tokens o códigos de autenticación (no deben quedar en historial ni capturas). */
function limpiarTokensDeUrl() {
  const patron = /(access_token|refresh_token|provider_token|token_hash|token|code|error_description|type)=/i;
  const busqueda = new URLSearchParams(location.search);
  let cambio = false;
  [...busqueda.keys()].forEach((k) => {
    if (patron.test(`${k}=`)) { busqueda.delete(k); cambio = true; }
  });
  const hash = patron.test(location.hash) ? '' : location.hash;
  if (cambio || hash !== location.hash) {
    const q = busqueda.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${hash}`);
  }
}

async function iniciar() {
  prepararInterfaz();
  if (errorConfiguracion) {
    mostrarAcceso(alerta('error', 'Falta configurar Supabase.', errorConfiguracion));
    $('#btn-ingresar').disabled = true;
    return;
  }
  supabase.auth.onAuthStateChange((evento) => {
    // Token de actualización revocado o vencido: Supabase cierra la sesión.
    if (evento === 'SIGNED_OUT' && dentro) salir('expirada');
  });
  window.addEventListener('konys:sesion-invalida', () => { if (dentro) salir('expirada'); });
  // Varias pestañas: la actividad en una mantiene vivas las demás, y cerrar
  // sesión (o expirar) en una cierra todas.
  window.addEventListener('storage', (e) => {
    if (e.key === CLAVE_ACTIVIDAD && e.newValue) vigilante.sincronizar(Number(e.newValue));
    if (e.key === CLAVE_CIERRE && e.newValue && dentro) {
      const { motivo } = JSON.parse(e.newValue);
      salir(motivo, { propagar: false });
    }
  });
  // Si el navegador restaura la página desde su caché al pulsar «Atrás», se vuelve a verificar todo.
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

  try {
    const usuario = await api.usuarioVerificado();
    if (!usuario) { mostrarAcceso(); return; }
    const ultima = Number(leerCompartido(CLAVE_ACTIVIDAD));
    if (ultima && Date.now() - ultima >= vigilante.limiteMs) { await salir('inactividad'); return; }
    if (await api.esAdministrador()) entrar();
    else { await api.cerrarSesion(); mostrarAcceso(alerta('error', 'Esta cuenta no tiene permisos de administración.')); }
  } catch (e) {
    mostrarAcceso(alerta('error', 'No pudimos verificar tu sesión.', e.message));
  }
}

function prepararInterfaz() {
  $('#acceso-pizza').innerHTML = pizza('pepperoni', 420);
  $('#acceso-volver').innerHTML = `${icono('chevronIzq')}<span>Volver al sitio público</span>`;
  $('#ver-clave').innerHTML = icono('ojo');
  $$('#nav-admin a').forEach((a) => {
    const s = SECCIONES[a.dataset.seccion];
    a.innerHTML = `${icono(s.icono)}<span>${s.texto}</span>`;
  });
  $('#ver-sitio').innerHTML = `${icono('externo')}<span class="lateral__texto-largo">Ver sitio público</span>`;
  $('#cerrar-sesion').innerHTML = `${icono('salir')}<span class="lateral__texto-largo">Cerrar sesión</span>`;
  $('#cerrar-sesion').setAttribute('aria-label', 'Cerrar sesión');

  $('#ver-clave').addEventListener('click', () => {
    const campo = $('#clave');
    const visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    $('#ver-clave').innerHTML = icono(visible ? 'ojo' : 'ojoTachado');
    $('#ver-clave').setAttribute('aria-pressed', String(!visible));
    $('#ver-clave').setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
  $('#form-acceso').addEventListener('submit', (e) => { e.preventDefault(); ingresar(); });
  $('#cerrar-sesion').addEventListener('click', () => salir('manual'));
  window.addEventListener('hashchange', () => { if (dentro) mostrarSeccion(); });

  // Antes de cualquier acción en el panel se comprueba que la sesión no haya
  // vencido (p. ej. si el equipo estuvo suspendido y el temporizador no corrió).
  ['click', 'submit', 'change'].forEach((tipo) => $('#panel-admin').addEventListener(tipo, (e) => {
    if (dentro && vigilante.vencido()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      salir('inactividad');
    }
  }, true));
}

function mostrarAcceso(mensaje = '') {
  dentro = false;
  vigilante.detener();
  document.title = 'Acceso · Panel Konys Pizza';
  $('#panel-admin').hidden = true;
  $('#principal').innerHTML = '';
  document.querySelectorAll('dialog').forEach((d) => d.remove());
  $('#acceso').hidden = false;
  $('#acceso-alerta').innerHTML = mensaje;
  $('#clave').value = '';
  ocultarAvisoInactividad();
  actualizarBloqueo();
  $($('#correo').value ? '#clave' : '#correo').focus();
}

/**
 * Cierra la sesión en Supabase, borra la sesión guardada y vuelve a la pantalla
 * de acceso. Con propagar=true avisa a las demás pestañas del panel.
 */
async function salir(motivo, { propagar = true } = {}) {
  const estabaDentro = dentro;
  dentro = false;
  vigilante.detener();
  borrarCompartido(CLAVE_ACTIVIDAD);
  if (propagar) guardarCompartido(CLAVE_CIERRE, JSON.stringify({ motivo, momento: Date.now() }));
  // Se quita la sección de la URL: una dirección antigua no reabre el panel.
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  const mensajes = {
    manual: alerta('exito', 'Cerraste sesión.', 'Hasta pronto.'),
    inactividad: alerta('aviso', 'Tu sesión se cerró por inactividad.',
      `Pasaron ${describirTiempo(vigilante.limiteMs)} sin actividad. Ingresa de nuevo para continuar.`),
    expirada: alerta('info', 'Tu sesión ya no es válida.', 'Ingresa de nuevo para continuar.'),
  };
  mostrarAcceso(mensajes[motivo] ?? '');
  if (estabaDentro || motivo !== 'manual') {
    try { await api.cerrarSesion(); } catch { /* la sesión local ya se borró en cerrarSesion */ }
  }
}

function describirTiempo(ms) {
  return ms % 60000 === 0 ? `${ms / 60000} minutos` : `${Math.round(ms / 1000)} segundos`;
}

async function ingresar() {
  const form = $('#form-acceso');
  const correo = $('#correo').value.trim();
  const clave = $('#clave').value;
  $('#acceso-alerta').innerHTML = '';
  if (actualizarBloqueo()) return;
  // El correo se pide en el formulario: no viaja en la configuración pública del sitio.
  const errores = {
    correo: !correo ? 'Escribe tu correo.' : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? '' : 'Escribe un correo válido.'),
    clave: clave ? '' : 'Escribe la contraseña para ingresar.',
  };
  marcarCampo(form, 'correo', errores.correo);
  marcarCampo(form, 'clave', errores.clave);
  if (errores.correo || errores.clave) {
    $(errores.correo ? '#correo' : '#clave').focus();
    return;
  }
  const restaurar = botonCargando($('#btn-ingresar'), 'Verificando…');
  try {
    await api.iniciarSesion(correo, clave);
    if (!(await api.esAdministrador())) {
      await api.cerrarSesion();
      throw new api.ErrorApi('Esta cuenta no tiene permisos de administración.', 'SIN_PERMISO');
    }
    borrar(CLAVE_INTENTOS);
    restaurar();
    entrar();
  } catch (e) {
    restaurar();
    const incorrecta = e.codigo === 'CREDENCIALES';
    if (incorrecta) registrarFallo();
    $('#acceso-alerta').innerHTML = alerta('error', incorrecta ? 'Correo o contraseña incorrectos.' : 'No pudimos ingresar.',
      incorrecta ? 'Revísalos e inténtalo de nuevo.' : e.message);
    $('#clave').setAttribute('aria-invalid', 'true');
    $('#clave').select();
    actualizarBloqueo();
  }
}

function registrarFallo() {
  const datos = JSON.parse(leer(CLAVE_INTENTOS) ?? '{"fallos":0,"hasta":0}');
  datos.fallos += 1;
  if (datos.fallos >= MAX_INTENTOS) {
    datos.hasta = Date.now() + BLOQUEO_MS;
    datos.fallos = 0;
  }
  guardar(CLAVE_INTENTOS, JSON.stringify(datos));
}

/** Devuelve true si el acceso está bloqueado y muestra la cuenta regresiva. */
function actualizarBloqueo() {
  clearTimeout(temporizadorBloqueo);
  const datos = JSON.parse(leer(CLAVE_INTENTOS) ?? '{"fallos":0,"hasta":0}');
  const restante = datos.hasta - Date.now();
  const boton = $('#btn-ingresar');
  if (restante > 0) {
    boton.disabled = true;
    $('#acceso-alerta').innerHTML = alerta('error', 'Demasiados intentos fallidos.',
      `Por seguridad, espera ${Math.ceil(restante / 1000)} segundos antes de intentarlo de nuevo.`);
    temporizadorBloqueo = setTimeout(actualizarBloqueo, 1000);
    return true;
  }
  if (!errorConfiguracion) boton.disabled = false;
  if (datos.hasta) {
    guardar(CLAVE_INTENTOS, JSON.stringify({ fallos: 0, hasta: 0 }));
    $('#acceso-alerta').innerHTML = '';
  }
  return false;
}

function entrar() {
  dentro = true;
  $('#acceso').hidden = true;
  $('#panel-admin').hidden = false;
  $('#clave').value = '';
  $('#clave').removeAttribute('aria-invalid');
  guardarCompartido(CLAVE_ACTIVIDAD, String(Date.now()));
  vigilante.iniciar();
  mostrarSeccion();
}

async function mostrarSeccion() {
  const id = location.hash.slice(1);
  const clave = SECCIONES[id] ? id : 'resumen';
  $$('#nav-admin a').forEach((a) => {
    if (a.dataset.seccion === clave) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${SECCIONES[clave].texto} · Panel Konys Pizza`;
  const principal = $('#principal');
  principal.innerHTML = '<div class="esqueleto" aria-busy="true"><span></span><span></span><span></span></div>';
  principal.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  try {
    await SECCIONES[clave].modulo.montar(principal, { ir: (s) => { location.hash = s; } });
  } catch (e) {
    if (!dentro) return; // la sesión se cerró mientras cargaba
    principal.innerHTML = alerta('error', 'No pudimos cargar esta sección.', e.message ?? String(e),
      '<div class="alerta__acciones"><button type="button" class="btn btn--verde btn--pequeno" id="reintentar-seccion">Reintentar</button></div>');
    $('#reintentar-seccion').addEventListener('click', mostrarSeccion);
    if (e.codigo === 'SIN_PERMISO') {
      principal.insertAdjacentHTML('beforeend', `<p class="texto-tenue">${esc('Si tu sesión expiró, cierra sesión e ingresa de nuevo.')}</p>`);
    }
  }
}

/** Aviso un minuto antes del cierre por inactividad, con opción de seguir conectado. */
function mostrarAvisoInactividad(restanteMs) {
  let aviso = $('#aviso-inactividad');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'aviso-inactividad';
    aviso.className = 'aviso-inactividad';
    aviso.setAttribute('role', 'alertdialog');
    aviso.setAttribute('aria-live', 'assertive');
    aviso.setAttribute('aria-labelledby', 'aviso-inactividad-titulo');
    $('#panel-admin').append(aviso);
  }
  const segundos = Math.ceil(restanteMs / 1000);
  aviso.innerHTML = `${icono('reloj')}<div><strong id="aviso-inactividad-titulo">¿Sigues ahí?</strong>
    <p>Por seguridad, tu sesión se cerrará en ${segundos} segundos si no hay actividad.</p></div>
    <button type="button" class="btn btn--primario btn--pequeno" id="seguir-conectado">Seguir conectado</button>`;
  aviso.hidden = false;
  // Cualquier clic ya cuenta como actividad; el botón solo devuelve el foco al panel.
  $('#seguir-conectado').addEventListener('click', () => $('#principal').focus({ preventScroll: true }));
}

function ocultarAvisoInactividad() {
  const aviso = $('#aviso-inactividad');
  if (aviso) aviso.hidden = true;
}

// sessionStorage/localStorage pueden no estar disponibles (modo privado estricto): se ignora con seguridad.
function leer(clave) { try { return sessionStorage.getItem(clave); } catch { return null; } }
function guardar(clave, valor) { try { sessionStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } }
function borrar(clave) { try { sessionStorage.removeItem(clave); } catch { /* sin almacenamiento */ } }
function leerCompartido(clave) { try { return localStorage.getItem(clave); } catch { return null; } }
function guardarCompartido(clave, valor) { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } }
function borrarCompartido(clave) { try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ } }
