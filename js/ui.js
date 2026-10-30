// Piezas de interfaz compartidas: iconos, ilustraciones, alertas,
// etiquetas de estado y utilidades del DOM. Sin lógica de negocio.

/** Escapa texto antes de insertarlo como HTML (evita inyección de código). */
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

// ---------------------------------------------------------------------
// Iconos lineales (trazo 1.8, como en el sistema visual)
// ---------------------------------------------------------------------
const TRAZOS = {
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  persona: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/>',
  personas: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><path d="M15.5 6a3 3 0 0 1 0 5.6M17.5 14.6c1.7.6 2.7 2 3 4.4"/>',
  ubicacion: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkDoble: '<path d="M2.5 12.5l4.5 4.5 9.5-9.5M11.5 16.5l.5.5 9.5-9.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menos: '<path d="M6 12h12"/>',
  mas: '<path d="M12 6v12M6 12h12"/>',
  lapiz: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/>',
  papelera: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  flechaDerecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  flechaIzquierda: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevronIzq: '<path d="M14.5 6l-6 6 6 6"/>',
  chevronDer: '<path d="M9.5 6l6 6-6 6"/>',
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  ojoTachado: '<path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.6 6.7C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1M9.9 10a2.8 2.8 0 0 0 4 4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  aviso: '<path d="M12 4l9 15.5H3L12 4z"/><path d="M12 10v4.5M12 17h.01"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16h.01"/>',
  sol: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  luna: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  filtro: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z"/>',
  resumen: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  mesa: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  carta: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  salir: '<path d="M10 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h4M14.5 8l4 4-4 4M18.5 12H9"/>',
  externo: '<path d="M7 17L17 7M9 7h8v8"/>',
  telefono: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.8 7.2h.01"/>',
  imagen: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8"/>',
  reintentar: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15"/>',
  menu: '<path d="M5 8h14M5 12h14M5 16h14"/>',
};

export function icono(nombre, clase = '') {
  return `<svg class="icono ${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TRAZOS[nombre] ?? ''}</svg>`;
}

// ---------------------------------------------------------------------
// Etiquetas de estado (siempre icono + texto, nunca solo color)
// ---------------------------------------------------------------------
const ETIQUETAS = {
  disponible: ['exito', 'check', 'Disponible'],
  libre: ['exito', 'check', 'Libre'],
  ocupada: ['neutra', 'x', 'Ocupada'],
  confirmada: ['exito', 'check', 'Confirmada'],
  cancelada: ['error', 'x', 'Cancelada'],
  completada: ['info', 'checkDoble', 'Completada'],
  activa: ['exito', 'check', 'Activa'],
  activo: ['exito', 'check', 'Activo'],
  inactiva: ['neutra', 'menos', 'Inactiva'],
  inactivo: ['neutra', 'menos', 'Inactivo'],
  oculto: ['neutra', 'ojoTachado', 'Oculto'],
  'sin-atencion': ['neutra', 'menos', 'Sin atención'],
};

export function etiqueta(clave, texto) {
  const [tono, ico, defecto] = ETIQUETAS[clave] ?? ['neutra', 'info', clave];
  return `<span class="etiqueta etiqueta--${tono}">${icono(ico)}${esc(texto ?? defecto)}</span>`;
}

const ETIQUETAS_PLATO = {
  clasica: ['limon', 'Clásica'],
  especialidad: ['rosa', 'Especialidad'],
  vegetariana: ['limon', 'Vegetariana'],
};
export function etiquetaPlato(clave) {
  const e = ETIQUETAS_PLATO[clave];
  return e ? `<span class="sello sello--${e[0]}">${e[1]}</span>` : '';
}

// ---------------------------------------------------------------------
// Alertas (éxito, error, aviso, información)
// ---------------------------------------------------------------------
const ICONO_ALERTA = { exito: 'check', error: 'error', aviso: 'aviso', info: 'info' };

export function alerta(tipo, titulo, texto = '', extra = '') {
  const rol = tipo === 'error' || tipo === 'aviso' ? 'alert' : 'status';
  return `<div class="alerta alerta--${tipo}" role="${rol}">
    ${icono(ICONO_ALERTA[tipo])}
    <div><strong>${esc(titulo)}</strong>${texto ? `<p>${esc(texto)}</p>` : ''}${extra}</div>
  </div>`;
}

export function estadoVacio({ titulo, texto, accion = '', icono: ico = 'calendario' }) {
  return `<div class="vacio">
    <div class="vacio__icono">${icono(ico)}</div>
    <h3>${esc(titulo)}</h3>
    ${texto ? `<p>${esc(texto)}</p>` : ''}
    ${accion}
  </div>`;
}

export function esqueleto(lineas = 3) {
  return `<div class="esqueleto" aria-busy="true" aria-label="Cargando">${'<span></span>'.repeat(lineas)}</div>`;
}

/** Aviso flotante breve para confirmar acciones del panel. */
export function notificar(texto, tipo = 'exito') {
  let zona = $('#notificaciones');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'notificaciones';
    zona.className = 'notificaciones';
    zona.setAttribute('aria-live', 'polite');
    document.body.append(zona);
  }
  const nodo = document.createElement('div');
  nodo.className = `notificacion notificacion--${tipo}`;
  nodo.innerHTML = `${icono(ICONO_ALERTA[tipo])}<span>${esc(texto)}</span>`;
  zona.append(nodo);
  setTimeout(() => nodo.remove(), 4000);
}

/** Pone un botón en estado "cargando" y devuelve una función para restaurarlo. */
export function botonCargando(boton, texto) {
  const original = boton.innerHTML;
  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  boton.innerHTML = `<span class="giro" aria-hidden="true"></span>${esc(texto)}`;
  return () => {
    boton.disabled = false;
    boton.removeAttribute('aria-busy');
    boton.innerHTML = original;
  };
}

/** Diálogo de confirmación accesible. Resuelve con el valor del botón pulsado. */
export function confirmar({ titulo, texto, botones }) {
  return new Promise((resolver) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo';
    dialogo.innerHTML = `
      <div class="dialogo__cabecera">
        <span class="dialogo__icono">${icono('aviso')}</span>
        <h2>${esc(titulo)}</h2>
      </div>
      <p>${esc(texto)}</p>
      <div class="dialogo__acciones">
        ${botones.map((b) => `<button type="button" class="btn ${b.clase}" value="${esc(b.valor)}">${esc(b.texto)}</button>`).join('')}
      </div>`;
    document.body.append(dialogo);
    dialogo.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) dialogo.close(b.value);
      else if (e.target === dialogo) dialogo.close('');
    });
    dialogo.addEventListener('close', () => {
      resolver(dialogo.returnValue);
      dialogo.remove();
    });
    dialogo.showModal();
    dialogo.querySelector('.btn--secundario, .btn')?.focus();
  });
}

/** Muestra u oculta el mensaje de error de un campo de formulario. */
export function marcarCampo(formulario, nombre, mensaje) {
  const campo = formulario.elements[nombre];
  if (!campo) return;
  const contenedor = campo.closest('.campo');
  let nodo = contenedor?.querySelector('.campo__error');
  if (mensaje) {
    campo.setAttribute('aria-invalid', 'true');
    if (!nodo && contenedor) {
      nodo = document.createElement('p');
      nodo.className = 'campo__error';
      nodo.id = `${campo.id || nombre}-error`;
      contenedor.append(nodo);
    }
    if (nodo) {
      nodo.innerHTML = `${icono('aviso')}${esc(mensaje)}`;
      campo.setAttribute('aria-describedby', nodo.id);
    }
  } else {
    campo.removeAttribute('aria-invalid');
    nodo?.remove();
  }
}

export function mostrarErrores(formulario, errores, campos) {
  campos.forEach((c) => marcarCampo(formulario, c, errores[c]));
  const primero = campos.find((c) => errores[c]);
  if (primero) formulario.elements[primero]?.focus();
}

// ---------------------------------------------------------------------
// Ilustraciones (SVG en línea, inspiradas en el diseño de Figma)
// ---------------------------------------------------------------------
const COLORES = { masa: '#E9B96E', borde: '#D08A3A', salsa: '#C9452F', queso: '#F2DCA6', verde: '#2F6B3F' };

/** Pizza vista desde arriba. variante: margherita | pepperoni | vegetal | bbq */
export function pizza(variante = 'margherita', tamano = 160) {
  const toppings = {
    margherita: '<circle cx="42" cy="44" r="11" fill="#FFF5E6"/><circle cx="62" cy="40" r="9" fill="#FFF5E6"/><circle cx="52" cy="62" r="11" fill="#FFF5E6"/><circle cx="36" cy="58" r="7" fill="#FFF5E6"/><circle cx="50" cy="28" r="3.2" fill="#2F6B3F"/><circle cx="70" cy="56" r="3.2" fill="#2F6B3F"/><circle cx="34" cy="68" r="3.2" fill="#2F6B3F"/><circle cx="58" cy="74" r="3.2" fill="#2F6B3F"/>',
    pepperoni: '<rect x="30" y="30" width="12" height="12" rx="2" fill="#8E2A20"/><rect x="56" y="28" width="12" height="12" rx="2" fill="#8E2A20"/><rect x="44" y="45" width="12" height="12" rx="2" fill="#8E2A20"/><rect x="64" y="50" width="12" height="12" rx="2" fill="#8E2A20"/><rect x="26" y="52" width="12" height="12" rx="2" fill="#8E2A20"/><rect x="38" y="66" width="12" height="12" rx="2" fill="#8E2A20"/><rect x="58" y="66" width="12" height="12" rx="2" fill="#8E2A20"/>',
    vegetal: '<circle cx="36" cy="44" r="5" fill="#E88B83"/><circle cx="56" cy="38" r="5.5" fill="#E9D56B"/><circle cx="62" cy="58" r="6" fill="#C9452F"/><circle cx="44" cy="64" r="5" fill="#2F6B3F"/><circle cx="70" cy="64" r="5" fill="#E9D56B"/><circle cx="40" cy="32" r="1.8" fill="#252824"/><circle cx="66" cy="36" r="1.8" fill="#252824"/><circle cx="34" cy="62" r="1.8" fill="#252824"/><circle cx="52" cy="72" r="1.8" fill="#252824"/>',
    bbq: '<rect x="32" y="32" width="12" height="12" rx="3" fill="#E1B97C"/><rect x="58" y="30" width="12" height="12" rx="3" fill="#E1B97C"/><rect x="28" y="52" width="12" height="12" rx="3" fill="#E1B97C"/><rect x="48" y="58" width="12" height="12" rx="3" fill="#E1B97C"/><rect x="64" y="50" width="12" height="12" rx="3" fill="#E1B97C"/><circle cx="50" cy="46" r="3.2" fill="#E88B83"/><circle cx="44" cy="72" r="3.2" fill="#E88B83"/><circle cx="66" cy="70" r="3.2" fill="#E88B83"/>',
  };
  const salsa = variante === 'bbq' ? '#7A3A22' : COLORES.salsa;
  return `<svg class="pizza" width="${tamano}" height="${tamano}" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="51.5" r="47" fill="rgba(37,40,36,.12)"/>
    <circle cx="50" cy="50" r="47" fill="${COLORES.borde}"/>
    <circle cx="50" cy="50" r="43" fill="${COLORES.masa}"/>
    <circle cx="50" cy="50" r="36" fill="${salsa}"/>
    <circle cx="50" cy="50" r="30" fill="${COLORES.queso}"/>
    ${toppings[variante] ?? toppings.margherita}
  </svg>`;
}

/** Plato sencillo para entradas, postres y bebidas. */
export function plato(color = '#D9A35B', fondo = '#FFF5E6', tamano = 120) {
  return `<svg width="${tamano}" height="${tamano}" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="44" fill="${fondo}"/><circle cx="50" cy="50" r="34" fill="#fff"/>
    <circle cx="50" cy="50" r="17" fill="${color}"/></svg>`;
}

const VARIANTES_PIZZA = ['margherita', 'pepperoni', 'vegetal', 'bbq'];

/** Ilustración por defecto de un plato (si no tiene imagen subida). */
export function ilustracionPlato(p, indice = 0) {
  if (p.categoria_id === 'pizzas') {
    const nombre = p.nombre.toLowerCase();
    const variante = nombre.includes('pepperoni') ? 'pepperoni'
      : nombre.includes('bbq') ? 'bbq'
        : nombre.includes('veget') ? 'vegetal'
          : nombre.includes('margh') ? 'margherita'
            : VARIANTES_PIZZA[indice % 4];
    return pizza(variante, 160);
  }
  const colores = { entradas: ['#D9A35B', '#DDEADB'], postres: ['#A0703F', '#F7D9D3'], bebidas: ['#F2E2B5', '#DCE8F0'] };
  const [c, f] = colores[p.categoria_id] ?? colores.entradas;
  return plato(c, f, 120);
}

/** Mesa vista desde arriba: sillas según capacidad, colores según zona. */
export function ilustracionMesa(mesa) {
  const terraza = mesa.zona === 'terraza';
  const silla = terraza ? '#B4443B' : '#173F35';
  const cap = Math.max(1, Math.min(12, mesa.capacidad));
  const porLado = Math.ceil(cap / 2);
  const larga = cap > 4;
  const ancho = larga ? 44 + porLado * 10 : 34;
  const centro = 100;
  const sillas = [];
  for (let i = 0; i < porLado; i++) {
    const x = centro - ((porLado - 1) * 22) / 2 + i * 22 - 7;
    sillas.push(`<rect x="${x}" y="10" width="14" height="14" rx="4" fill="${silla}"/>`);
    if (i < cap - porLado) sillas.push(`<rect x="${x}" y="72" width="14" height="14" rx="4" fill="${silla}"/>`);
  }
  const mesaForma = larga
    ? `<rect x="${centro - ancho / 2}" y="30" width="${ancho}" height="36" rx="9" fill="#FFF8EC"/>`
    : `<circle cx="${centro}" cy="48" r="${ancho / 1.6}" fill="#FFF8EC"/>`;
  const fondo = terraza
    ? '<rect width="200" height="96" fill="#D3E5CF"/><circle cx="18" cy="16" r="20" fill="#B9D5B2"/><circle cx="188" cy="82" r="24" fill="#B9D5B2"/>'
    : '<rect width="200" height="96" fill="#EAD5B5"/>' + [32, 64, 96, 128, 160].map((x) => `<path d="M${x} 0v96" stroke="#DDC39C" stroke-width="1"/>`).join('');
  return `<svg class="ilustracion-mesa" viewBox="0 0 200 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    ${fondo}${sillas.join('')}${mesaForma}
    <g transform="translate(${centro - 12} 36)">${pizza(VARIANTES_PIZZA[mesa.id % 4], 24)}</g>
  </svg>`;
}

/** Imagen de una mesa o plato: foto subida o ilustración. */
export function imagenOIlustracion(url, alternativa, texto) {
  return url
    ? `<img src="${esc(url)}" alt="${esc(texto)}" loading="lazy" decoding="async">`
    : alternativa;
}

/** Logotipo "Konys PIZZA". */
export function logotipo(sufijo = 'PIZZA') {
  return `<span class="logo"><span class="logo__marca">Konys</span><span class="logo__sello">${esc(sufijo)}</span></span>`;
}
