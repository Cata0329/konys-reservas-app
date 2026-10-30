// Genera js/config.js a partir de variables de entorno.
//
//  - En local: lee el archivo .env de la raíz del proyecto.
//  - En Vercel: usa las variables definidas en Project Settings → Environment Variables.
//
// Solo escribe valores PÚBLICOS (URL y clave publishable/anon). Si detecta
// una clave secreta (service_role / sb_secret_), se detiene sin escribir nada.
import { readFile, writeFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);

async function leerEnv() {
  try {
    const texto = await readFile(new URL('.env', raiz), 'utf8');
    return Object.fromEntries(texto.split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }));
  } catch {
    return {};
  }
}

function esClaveSecreta(clave) {
  if (clave.startsWith('sb_secret_')) return true;
  const partes = clave.split('.');
  if (partes.length !== 3) return false;
  try {
    const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return carga.role === 'service_role';
  } catch {
    return false;
  }
}

const env = { ...(await leerEnv()), ...process.env };
const valor = (nombre) => (env[nombre] ?? '').trim();

const config = {
  SUPABASE_URL: valor('SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: valor('SUPABASE_PUBLISHABLE_KEY') || valor('SUPABASE_ANON_KEY'),
  ADMIN_EMAIL: valor('ADMIN_EMAIL'),
  CONTACTO_WHATSAPP: valor('CONTACTO_WHATSAPP'),
  CONTACTO_INSTAGRAM: valor('CONTACTO_INSTAGRAM'),
};

const faltantes = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'ADMIN_EMAIL'].filter((k) => !config[k]);
if (faltantes.length) {
  console.warn(`⚠  Faltan variables: ${faltantes.join(', ')}. El sitio mostrará un aviso de configuración.`);
}
if (config.SUPABASE_PUBLISHABLE_KEY && esClaveSecreta(config.SUPABASE_PUBLISHABLE_KEY)) {
  console.error('✖  SUPABASE_PUBLISHABLE_KEY contiene una clave SECRETA (service_role). Usa la clave publishable/anon.');
  process.exit(1);
}
if (config.SUPABASE_URL && !/^https:\/\/.+/.test(config.SUPABASE_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(config.SUPABASE_URL)) {
  console.error('✖  SUPABASE_URL debe empezar por https://');
  process.exit(1);
}

const contenido = `// Archivo generado por scripts/generar-config.mjs — NO editar ni subir a GitHub.
// Solo contiene valores públicos (la clave publishable está protegida por RLS).
export default ${JSON.stringify(config, null, 2)};
`;
await writeFile(new URL('js/config.js', raiz), contenido, 'utf8');
console.log('✔  js/config.js generado.');
