// Todas las consultas a Supabase en un solo lugar.
// Las vistas (inicio.js, reserva.js, admin/*.js) nunca llaman a Supabase
// directamente: usan estas funciones, que devuelven datos o lanzan un
// ErrorApi con un mensaje listo para mostrar.
import { supabase, errorConfiguracion } from './supabase.js';

/** Mensajes para los códigos que devuelve la base de datos. */
const MENSAJES = {
  HORARIO_OCUPADO: 'Alguien acaba de reservar ese horario. Elige otra hora.',
  CAPACIDAD_EXCEDIDA: 'El número de personas supera la capacidad de la mesa.',
  MESA_NO_DISPONIBLE: 'Esta mesa ya no está disponible para reservas. Elige otra.',
  FUERA_DE_HORARIO: 'Ese horario está fuera de nuestras jornadas de atención.',
  HORARIO_PASADO: 'Ese horario ya pasó. Elige una hora posterior.',
  FECHA_FUERA_DE_RANGO: 'Solo recibimos reservas desde hoy y hasta 60 días adelante.',
  NOMBRE_INVALIDO: 'Escribe tu nombre completo (mínimo 3 letras).',
  CONTACTO_INVALIDO: 'El contacto no puede superar 40 caracteres.',
  PERSONAS_INVALIDAS: 'Indica cuántas personas vienen.',
};

export class ErrorApi extends Error {
  constructor(mensaje, codigo = 'DESCONOCIDO', original = null) {
    super(mensaje);
    this.codigo = codigo;
    this.original = original;
  }
}

function traducirError(error) {
  const texto = `${error?.message ?? ''}`;
  const codigo = Object.keys(MENSAJES).find((c) => texto.includes(c));
  if (codigo) return new ErrorApi(MENSAJES[codigo], codigo, error);
  if (error?.code === '23503') {
    return new ErrorApi('No se puede eliminar porque tiene registros asociados (por ejemplo, reservas históricas).', 'EN_USO', error);
  }
  if (error?.code === '23505') return new ErrorApi('Ya existe un registro con ese nombre.', 'DUPLICADO', error);
  if (error?.code === '23P01' && texto.includes('horarios_sin_cruce')) {
    return new ErrorApi('Esa jornada se cruza con otra del mismo día.', 'CRUCE', error);
  }
  if (error?.code === '23P01') return new ErrorApi('Ese cambio choca con otra reserva de la misma mesa.', 'HORARIO_OCUPADO', error);
  if (error?.code === '23514') return new ErrorApi('Algún dato no cumple las reglas (revisa horas, duración o capacidad).', 'INVALIDO', error);
  if (error?.code === '42501' || /row-level security|permission denied/i.test(texto)) {
    return new ErrorApi('Tu cuenta no tiene permisos para esta acción.', 'SIN_PERMISO', error);
  }
  if (error?.name === 'AbortError' || /abort|timeout/i.test(texto)) {
    return new ErrorApi('Supabase no respondió a tiempo. Revisa tu conexión e inténtalo de nuevo.', 'SIN_CONEXION', error);
  }
  if (/fetch|network|Failed/i.test(texto)) {
    return new ErrorApi('No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.', 'SIN_CONEXION', error);
  }
  return new ErrorApi('Ocurrió un error inesperado. Inténtalo de nuevo.', 'DESCONOCIDO', error);
}

/** Ejecuta una consulta de Supabase y traduce sus errores (el tiempo límite está en supabase.js). */
async function ejecutar(construir) {
  if (!supabase) throw new ErrorApi(errorConfiguracion, 'SIN_CONFIGURACION');
  let respuesta;
  try {
    respuesta = await construir(supabase);
  } catch (e) {
    throw traducirError(e);
  }
  if (respuesta.error) throw traducirError(respuesta.error);
  return respuesta;
}

const datos = async (construir) => (await ejecutar(construir)).data;

// ---------------------------------------------------------------------
// Sitio público
// ---------------------------------------------------------------------
export const obtenerMesasActivas = () => datos((db) =>
  db.from('mesas').select('id, nombre, zona, capacidad, foto_url, activa').eq('activa', true).order('id'));

export const obtenerHorarios = () => datos((db) =>
  db.from('horarios').select('id, dia_semana, jornada, hora_inicio, hora_fin, duracion_min, activo')
    .order('dia_semana').order('hora_inicio'));

export const obtenerCategorias = () => datos((db) =>
  db.from('categorias').select('id, nombre, orden').order('orden'));

/** Para el público, RLS ya filtra los platos no disponibles; se filtra también aquí por claridad. */
export const obtenerCartaPublica = () => datos((db) =>
  db.from('platos').select('id, nombre, categoria_id, descripcion, precio, imagen_url, etiqueta')
    .eq('disponible', true).order('orden').order('id'));

/** Franjas ocupadas (sin datos personales) entre dos fechas. */
export async function obtenerOcupacion(desde, hasta) {
  const filas = await datos((db) => db.rpc('ocupacion', { p_desde: desde, p_hasta: hasta }));
  return filas.map((f) => ({ ...f, mesa_id: Number(f.mesa_id), fecha: String(f.fecha).slice(0, 10) }));
}

/** Crea la reserva; la base de datos valida disponibilidad, capacidad y horario. */
export async function crearReserva({ mesaId, fecha, hora, nombre, personas, contacto }) {
  const filas = await datos((db) => db.rpc('crear_reserva', {
    p_mesa_id: mesaId,
    p_fecha: fecha,
    p_hora_inicio: hora,
    p_cliente_nombre: nombre.trim(),
    p_num_personas: Number(personas),
    p_cliente_contacto: contacto?.trim() || null,
  }));
  if (!filas?.length) throw new ErrorApi('No recibimos la confirmación de la reserva. Inténtalo de nuevo.');
  return { ...filas[0], fecha: String(filas[0].fecha).slice(0, 10) };
}

// ---------------------------------------------------------------------
// Autenticación del panel
// ---------------------------------------------------------------------
export async function iniciarSesion(email, password) {
  if (!supabase) throw new ErrorApi(errorConfiguracion, 'SIN_CONFIGURACION');
  let respuesta;
  try {
    respuesta = await supabase.auth.signInWithPassword({ email, password });
  } catch (e) {
    throw traducirError(e);
  }
  if (respuesta.error) {
    if (respuesta.error.status === 400 || /invalid/i.test(respuesta.error.message)) {
      throw new ErrorApi('Contraseña incorrecta. Revísala e inténtalo de nuevo.', 'CREDENCIALES');
    }
    throw traducirError(respuesta.error);
  }
  return respuesta.data.session;
}

export async function cerrarSesion() {
  if (supabase) await supabase.auth.signOut();
}

export async function sesionActual() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** true si el usuario autenticado figura en la tabla administradores. */
export async function esAdministrador() {
  const filas = await datos((db) => db.from('administradores').select('user_id').limit(1));
  return filas.length > 0;
}

// ---------------------------------------------------------------------
// Panel: reservas
// ---------------------------------------------------------------------
export async function obtenerReservas({ fecha, mesaId, estado, pagina = 1, porPagina = 10 }) {
  const desde = (pagina - 1) * porPagina;
  const r = await ejecutar((db) => {
    let q = db.from('reservas')
      .select('id, cliente_nombre, cliente_contacto, num_personas, fecha, hora_inicio, hora_fin, estado, mesa_id, mesas(nombre, zona)', { count: 'exact' })
      .order('fecha', { ascending: true }).order('hora_inicio', { ascending: true })
      .range(desde, desde + porPagina - 1);
    if (fecha) q = q.eq('fecha', fecha);
    if (mesaId) q = q.eq('mesa_id', mesaId);
    if (estado) q = q.eq('estado', estado);
    return q;
  });
  return { filas: r.data, total: r.count ?? 0 };
}

export const obtenerReservasDelDia = (fecha) => datos((db) =>
  db.from('reservas').select('id, cliente_nombre, num_personas, hora_inicio, hora_fin, estado, mesa_id, mesas(nombre, zona)')
    .eq('fecha', fecha).order('hora_inicio'));

export const cambiarEstadoReserva = (id, estado) => datos((db) =>
  db.from('reservas').update({ estado }).eq('id', id).select('id, estado').single());

// ---------------------------------------------------------------------
// Panel: mesas
// ---------------------------------------------------------------------
export const obtenerTodasLasMesas = () => datos((db) =>
  db.from('mesas').select('id, nombre, zona, capacidad, activa, foto_url').order('id'));

export const guardarMesa = (mesa) => datos((db) => {
  const valores = {
    nombre: mesa.nombre.trim(), zona: mesa.zona, capacidad: Number(mesa.capacidad),
    activa: mesa.activa, foto_url: mesa.foto_url || null,
  };
  return mesa.id
    ? db.from('mesas').update(valores).eq('id', mesa.id).select().single()
    : db.from('mesas').insert(valores).select().single();
});

export const cambiarEstadoMesa = (id, activa) => datos((db) =>
  db.from('mesas').update({ activa }).eq('id', id).select().single());

export const eliminarMesa = (id) => datos((db) => db.from('mesas').delete().eq('id', id).select('id'));

// ---------------------------------------------------------------------
// Panel: horarios
// ---------------------------------------------------------------------
export const guardarHorario = (h) => datos((db) => {
  const valores = {
    dia_semana: h.dia_semana, jornada: h.jornada, hora_inicio: h.hora_inicio,
    hora_fin: h.hora_fin, duracion_min: Number(h.duracion_min), activo: h.activo ?? true,
  };
  return h.id
    ? db.from('horarios').update(valores).eq('id', h.id).select().single()
    : db.from('horarios').insert(valores).select().single();
});

export const cambiarEstadoHorario = (id, activo) => datos((db) =>
  db.from('horarios').update({ activo }).eq('id', id).select().single());

export const eliminarHorario = (id) => datos((db) => db.from('horarios').delete().eq('id', id).select('id'));

// ---------------------------------------------------------------------
// Panel: carta
// ---------------------------------------------------------------------
export const obtenerTodosLosPlatos = () => datos((db) =>
  db.from('platos').select('id, nombre, categoria_id, descripcion, precio, imagen_url, etiqueta, disponible, orden')
    .order('categoria_id').order('orden').order('id'));

export const guardarPlato = (p) => datos((db) => {
  const valores = {
    nombre: p.nombre.trim(), categoria_id: p.categoria_id, descripcion: p.descripcion?.trim() || null,
    precio: Number(p.precio), etiqueta: p.etiqueta || null, disponible: p.disponible,
    imagen_url: p.imagen_url || null,
  };
  return p.id
    ? db.from('platos').update(valores).eq('id', p.id).select().single()
    : db.from('platos').insert(valores).select().single();
});

export const cambiarDisponibilidadPlato = (id, disponible) => datos((db) =>
  db.from('platos').update({ disponible }).eq('id', id).select().single());

export const eliminarPlato = (id) => datos((db) => db.from('platos').delete().eq('id', id).select('id'));

// ---------------------------------------------------------------------
// Panel: imágenes (bucket público 'imagenes'; solo el admin puede subir)
// ---------------------------------------------------------------------
export async function subirImagen(archivo, carpeta) {
  if (!supabase) throw new ErrorApi(errorConfiguracion, 'SIN_CONFIGURACION');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    throw new ErrorApi('La imagen debe ser JPG, PNG o WebP.', 'INVALIDO');
  }
  if (archivo.size > 2 * 1024 * 1024) throw new ErrorApi('La imagen no puede pesar más de 2 MB.', 'INVALIDO');
  const extension = archivo.name.split('.').pop().toLowerCase();
  const ruta = `${carpeta}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('imagenes').upload(ruta, archivo, { contentType: archivo.type });
  if (error) throw traducirError(error);
  return supabase.storage.from('imagenes').getPublicUrl(ruta).data.publicUrl;
}
