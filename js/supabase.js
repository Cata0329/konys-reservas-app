// Cliente único de Supabase para todo el sitio.
//
// Las credenciales NO están en el código: vienen de js/config.js, que se
// genera desde el archivo .env con `npm run config` (y en Vercel durante
// el build). Ese archivo está en .gitignore.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let configuracion = null;
try {
  configuracion = (await import('./config.js')).default;
} catch {
  configuracion = null;
}

const valido = Boolean(configuracion?.SUPABASE_URL && configuracion?.SUPABASE_PUBLISHABLE_KEY);

/** Mensaje para mostrar si falta configurar Supabase (o null si todo está bien). */
export const errorConfiguracion = valido
  ? null
  : 'Falta configurar la conexión con Supabase. Copia .env.example como .env, completa los valores y ejecuta "npm run config".';

export const config = configuracion ?? {};

/** Si Supabase no responde en este tiempo, la petición se cancela y se muestra un error. */
const TIEMPO_MAXIMO_MS = 12000;
const fetchConTiempoLimite = (recurso, opciones = {}) =>
  fetch(recurso, { ...opciones, signal: opciones.signal ?? AbortSignal.timeout(TIEMPO_MAXIMO_MS) });

/** Nombre con que se guarda la sesión del panel (en sessionStorage). */
export const CLAVE_SESION = 'konys-admin-sesion';

// Manejo de tokens (ver README › Seguridad):
//  - flowType 'pkce': si en el futuro se usan enlaces de correo u OAuth, Supabase
//    devuelve un código de un solo uso en vez de tokens en la URL.
//  - detectSessionInUrl false: nunca se acepta un token que venga en la URL.
//  - sessionStorage: la sesión vive solo en la pestaña y desaparece al cerrarla
//    (no son cookies HttpOnly: JavaScript de esta misma página puede leerla,
//    por eso la página no carga scripts de terceros salvo supabase-js y la CSP lo limita).
/**
 * Una sesión guardada cuyo token de acceso ya venció pertenece a una pestaña
 * que estuvo inactiva mucho más de los 5 minutos permitidos: no se intenta
 * renovarla en silencio, se descarta y el administrador vuelve a iniciar sesión.
 */
function descartarSesionVencida() {
  try {
    const guardada = JSON.parse(window.sessionStorage.getItem(CLAVE_SESION) ?? 'null');
    if (guardada && (!guardada.expires_at || guardada.expires_at * 1000 <= Date.now())) {
      window.sessionStorage.removeItem(CLAVE_SESION);
    }
  } catch {
    window.sessionStorage?.removeItem(CLAVE_SESION);
  }
}
if (valido) descartarSesionVencida();

export const supabase = valido
  ? createClient(configuracion.SUPABASE_URL, configuracion.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage: window.sessionStorage,
      storageKey: CLAVE_SESION,
    },
    global: { fetch: fetchConTiempoLimite },
  })
  : null;
