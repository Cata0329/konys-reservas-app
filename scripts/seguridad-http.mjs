// Cabeceras de seguridad HTTP del sitio. La misma definición se usa en el
// servidor local (scripts/servidor-local.mjs) y debe coincidir con vercel.json
// (lo comprueba tests/seguridad.test.mjs).

/** Origen de las fotos oficiales del menú de Konys (publicadas en Clubify). */
export const ORIGEN_IMAGENES_MENU = 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev';

/**
 * Content-Security-Policy. `extras` añade orígenes de conexión (p. ej. el
 * Supabase local de pruebas en http://localhost:54321).
 */
export function construirCsp(extras = []) {
  const conexion = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', ...extras].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    // 'unsafe-inline' solo para estilos: la vista semanal de horarios posiciona bloques con style="left:…".
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src https://fonts.gstatic.com",
    `img-src 'self' data: ${ORIGEN_IMAGENES_MENU} https://*.supabase.co ${extras.join(' ')}`.trim(),
    `connect-src ${conexion}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export const CABECERAS_SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
