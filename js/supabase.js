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

export const supabase = valido
  ? createClient(configuracion.SUPABASE_URL, configuracion.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { fetch: fetchConTiempoLimite },
  })
  : null;
