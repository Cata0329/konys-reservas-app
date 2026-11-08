// Cierre de sesión por inactividad del panel de administración.
//
//  - Producción: exactamente 5 minutos (TIEMPO_INACTIVIDAD_MS).
//  - Pruebas: en localhost se puede acortar con ?inactividad=<segundos>
//    (solo valores menores que 5 minutos; en cualquier otro dominio se ignora).
//  - Ratón, teclado, clic, rueda, desplazamiento y toque reinician el contador.
//  - Al vencer se llama a alExpirar(), que cierra la sesión de verdad en Supabase.

export const TIEMPO_INACTIVIDAD_MS = 5 * 60 * 1000;

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart', 'click'];
const HOSTS_DE_PRUEBA = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Tiempo de espera que se aplicará. El valor corto solo se acepta en un
 * servidor local y nunca puede ser mayor que el de producción.
 */
export function tiempoInactividad(ubicacion = globalThis.location) {
  if (!ubicacion || !HOSTS_DE_PRUEBA.has(ubicacion.hostname)) return TIEMPO_INACTIVIDAD_MS;
  const segundos = Number(new URLSearchParams(ubicacion.search).get('inactividad'));
  if (!Number.isFinite(segundos) || segundos <= 0) return TIEMPO_INACTIVIDAD_MS;
  return Math.min(segundos * 1000, TIEMPO_INACTIVIDAD_MS);
}

/**
 * Crea un vigilante de inactividad.
 *  - iniciar(): empieza a contar (al iniciar sesión).
 *  - detener(): deja de contar (al cerrar sesión).
 *  - restante(): milisegundos que faltan.
 *  - vencido(): true si ya pasó el tiempo (se usa antes de operaciones protegidas).
 */
export function crearVigilante({
  limiteMs = tiempoInactividad(), alExpirar, alActividad, reloj = () => Date.now(), ventana = globalThis.window,
} = {}) {
  let ultimaActividad = reloj();
  let temporizador = null;
  let activo = false;

  const registrar = () => {
    if (!activo) return;
    // Si el tiempo ya venció (p. ej. el equipo estaba suspendido) la actividad NO revive
    // la sesión: el panel bloquea ese mismo evento (ver app.js) y luego se expira.
    if (reloj() - ultimaActividad >= limiteMs) { setTimeout(revisar, 0); return; }
    ultimaActividad = reloj();
    alActividad?.(ultimaActividad);
    programar();
  };

  function programar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(revisar, Math.max(0, limiteMs - (reloj() - ultimaActividad)));
  }

  function revisar() {
    if (!activo) return;
    if (reloj() - ultimaActividad >= limiteMs) expirar();
    else programar();
  }

  // Los temporizadores se ralentizan en pestañas ocultas: al volver se revisa en seguida.
  const alCambiarVisibilidad = () => { if (ventana?.document?.visibilityState === 'visible') revisar(); };

  function expirar() {
    if (!activo) return;
    detener();
    alExpirar?.();
  }

  function iniciar() {
    if (activo) detener();
    activo = true;
    ultimaActividad = reloj();
    EVENTOS.forEach((e) => ventana?.addEventListener(e, registrar, { passive: true, capture: true }));
    ventana?.document?.addEventListener('visibilitychange', alCambiarVisibilidad);
    programar();
  }

  function detener() {
    activo = false;
    clearTimeout(temporizador);
    EVENTOS.forEach((e) => ventana?.removeEventListener(e, registrar, { capture: true }));
    ventana?.document?.removeEventListener('visibilitychange', alCambiarVisibilidad);
  }

  return {
    iniciar,
    detener,
    registrar,
    get activo() { return activo; },
    restante: () => Math.max(0, limiteMs - (reloj() - ultimaActividad)),
    vencido: () => !activo || reloj() - ultimaActividad >= limiteMs,
    limiteMs,
  };
}
