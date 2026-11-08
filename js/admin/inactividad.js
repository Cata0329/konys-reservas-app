// Cierre de sesión por inactividad del panel de administración.
//
//  - Producción: exactamente 5 minutos (INACTIVIDAD_MS = 300000).
//  - Aviso previo: 1 minuto antes (a los 4 min) con opción de seguir conectado.
//  - Pruebas: SOLO en localhost/127.0.0.1 se puede acortar con ?inactividad=<segundos>
//    (nunca más de 5 minutos; en cualquier otro dominio el parámetro se ignora).
//  - Ratón, teclado, clic, rueda, desplazamiento y toque reinician el contador.
//  - Varias pestañas comparten el contador (ver sincronizar() y admin/app.js).

export const INACTIVIDAD_MS = 300000;
/** Alias conservado para el código y las pruebas existentes. */
export const TIEMPO_INACTIVIDAD_MS = INACTIVIDAD_MS;
export const AVISO_ANTES_MS = 60000;

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart', 'click'];
const HOSTS_DE_PRUEBA = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Tiempo de espera que se aplicará. El valor corto solo se acepta en un
 * servidor local y nunca puede ser mayor que el de producción.
 */
export function tiempoInactividad(ubicacion = globalThis.location) {
  if (!ubicacion || !HOSTS_DE_PRUEBA.has(ubicacion.hostname)) return INACTIVIDAD_MS;
  const segundos = Number(new URLSearchParams(ubicacion.search).get('inactividad'));
  if (!Number.isFinite(segundos) || segundos <= 0) return INACTIVIDAD_MS;
  return Math.min(segundos * 1000, INACTIVIDAD_MS);
}

/** Cuánto antes del cierre aparece el aviso: 1 min en producción, 20 % con tiempos cortos de prueba. */
export const margenAviso = (limiteMs) => (limiteMs >= 2 * AVISO_ANTES_MS ? AVISO_ANTES_MS : Math.round(limiteMs * 0.2));

/**
 * Crea un vigilante de inactividad.
 *  - iniciar(): empieza a contar (al iniciar sesión).
 *  - detener(): deja de contar (al cerrar sesión).
 *  - sincronizar(momento): adopta la actividad registrada en otra pestaña.
 *  - restante(): milisegundos que faltan.
 *  - vencido(): true si ya pasó el tiempo (se usa antes de operaciones protegidas).
 */
export function crearVigilante({
  limiteMs = tiempoInactividad(), alExpirar, alActividad, alAvisar, alCancelarAviso,
  reloj = () => Date.now(), ventana = globalThis.window,
} = {}) {
  let ultimaActividad = reloj();
  let temporizador = null;
  let temporizadorAviso = null;
  let activo = false;
  let avisando = false;
  const margen = margenAviso(limiteMs);

  const registrar = () => {
    if (!activo) return;
    // Si el tiempo ya venció (p. ej. el equipo estaba suspendido) la actividad NO revive
    // la sesión: el panel bloquea ese mismo evento (ver app.js) y luego se expira.
    if (reloj() - ultimaActividad >= limiteMs) { setTimeout(revisar, 0); return; }
    ultimaActividad = reloj();
    alActividad?.(ultimaActividad);
    cancelarAviso();
    programar();
  };

  function cancelarAviso() {
    if (!avisando) return;
    avisando = false;
    alCancelarAviso?.();
  }

  function programar() {
    clearTimeout(temporizador);
    clearTimeout(temporizadorAviso);
    const restante = Math.max(0, limiteMs - (reloj() - ultimaActividad));
    temporizador = setTimeout(revisar, restante);
    if (alAvisar && !avisando && restante > margen) {
      temporizadorAviso = setTimeout(() => {
        if (!activo || reloj() - ultimaActividad < limiteMs - margen) return;
        avisando = true;
        alAvisar(Math.max(0, limiteMs - (reloj() - ultimaActividad)));
      }, restante - margen);
    }
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
    avisando = false;
    ultimaActividad = reloj();
    EVENTOS.forEach((e) => ventana?.addEventListener(e, registrar, { passive: true, capture: true }));
    ventana?.document?.addEventListener('visibilitychange', alCambiarVisibilidad);
    programar();
  }

  function detener() {
    activo = false;
    clearTimeout(temporizador);
    clearTimeout(temporizadorAviso);
    cancelarAviso();
    EVENTOS.forEach((e) => ventana?.removeEventListener(e, registrar, { capture: true }));
    ventana?.document?.removeEventListener('visibilitychange', alCambiarVisibilidad);
  }

  /** Actividad hecha en otra pestaña: solo se acepta si es más reciente y la sesión no venció. */
  function sincronizar(momento) {
    if (!activo || !(momento > ultimaActividad) || reloj() - ultimaActividad >= limiteMs) return;
    ultimaActividad = Math.min(momento, reloj());
    cancelarAviso();
    programar();
  }

  return {
    iniciar,
    detener,
    registrar,
    sincronizar,
    get activo() { return activo; },
    get avisando() { return avisando; },
    restante: () => Math.max(0, limiteMs - (reloj() - ultimaActividad)),
    vencido: () => !activo || reloj() - ultimaActividad >= limiteMs,
    limiteMs,
  };
}
