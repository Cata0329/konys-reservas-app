// Panel de administración: acceso con Supabase Auth y navegación entre secciones.
//
// Seguridad: ocultar el panel en el navegador NO es la protección real.
// La protección está en la base de datos (RLS + es_admin()): aunque alguien
// abriera el panel sin permiso, Supabase no le devolvería ni le dejaría
// cambiar ningún dato.
import * as api from '../api.js';
import { supabase, config, errorConfiguracion } from '../supabase.js';
import { $, $$, esc, icono, alerta, pizza, botonCargando, marcarCampo } from '../ui.js';
import * as resumen from './resumen.js';
import * as mesas from './mesas.js';
import * as horarios from './horarios.js';
import * as reservas from './reservas.js';
import * as carta from './carta.js';

const SECCIONES = {
  resumen: { modulo: resumen, texto: 'Resumen', icono: 'resumen' },
  mesas: { modulo: mesas, texto: 'Mesas', icono: 'mesa' },
  horarios: { modulo: horarios, texto: 'Horarios', icono: 'reloj' },
  reservas: { modulo: reservas, texto: 'Reservas', icono: 'calendario' },
  carta: { modulo: carta, texto: 'Carta', icono: 'carta' },
};

let dentro = false;

iniciar();

async function iniciar() {
  prepararInterfaz();
  if (errorConfiguracion) {
    mostrarAcceso(alerta('error', 'Falta configurar Supabase.', errorConfiguracion));
    $('#btn-ingresar').disabled = true;
    return;
  }
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && dentro) mostrarAcceso(alerta('info', 'Tu sesión se cerró.', 'Ingresa de nuevo para continuar.'));
  });
  try {
    const sesion = await api.sesionActual();
    if (sesion && await api.esAdministrador()) entrar();
    else mostrarAcceso();
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
  $('#cerrar-sesion').addEventListener('click', async () => {
    dentro = false;
    await api.cerrarSesion();
    mostrarAcceso(alerta('exito', 'Cerraste sesión.', 'Hasta pronto.'));
  });
  window.addEventListener('hashchange', () => { if (dentro) mostrarSeccion(); });
}

function mostrarAcceso(mensaje = '') {
  dentro = false;
  document.title = 'Acceso · Panel Konys Pizza';
  $('#panel-admin').hidden = true;
  $('#principal').innerHTML = '';
  $('#acceso').hidden = false;
  $('#acceso-alerta').innerHTML = mensaje;
  $('#clave').value = '';
  $('#clave').focus();
}

async function ingresar() {
  const form = $('#form-acceso');
  const clave = $('#clave').value;
  $('#acceso-alerta').innerHTML = '';
  if (!clave) {
    marcarCampo(form, 'clave', 'Escribe la contraseña para ingresar.');
    $('#clave').focus();
    return;
  }
  marcarCampo(form, 'clave', '');
  if (!config.ADMIN_EMAIL) {
    $('#acceso-alerta').innerHTML = alerta('error', 'Falta ADMIN_EMAIL en la configuración.', 'Revisa el archivo .env y ejecuta "npm run config".');
    return;
  }
  const restaurar = botonCargando($('#btn-ingresar'), 'Verificando…');
  try {
    await api.iniciarSesion(config.ADMIN_EMAIL, clave);
    if (!(await api.esAdministrador())) {
      await api.cerrarSesion();
      throw new api.ErrorApi('Esta cuenta no tiene permisos de administración.', 'SIN_PERMISO');
    }
    restaurar();
    entrar();
  } catch (e) {
    restaurar();
    const incorrecta = e.codigo === 'CREDENCIALES';
    $('#acceso-alerta').innerHTML = alerta('error', incorrecta ? 'Contraseña incorrecta.' : 'No pudimos ingresar.',
      incorrecta ? 'Revísala e inténtalo de nuevo.' : e.message);
    $('#clave').setAttribute('aria-invalid', 'true');
    $('#clave').select();
  }
}

function entrar() {
  dentro = true;
  $('#acceso').hidden = true;
  $('#panel-admin').hidden = false;
  $('#clave').value = '';
  $('#clave').removeAttribute('aria-invalid');
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
    principal.innerHTML = alerta('error', 'No pudimos cargar esta sección.', e.message ?? String(e),
      '<div class="alerta__acciones"><button type="button" class="btn btn--verde btn--pequeno" id="reintentar-seccion">Reintentar</button></div>');
    $('#reintentar-seccion').addEventListener('click', mostrarSeccion);
    if (e.codigo === 'SIN_PERMISO') {
      principal.insertAdjacentHTML('beforeend', `<p class="texto-tenue">${esc('Si tu sesión expiró, cierra sesión e ingresa de nuevo.')}</p>`);
    }
  }
}
