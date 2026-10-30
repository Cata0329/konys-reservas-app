// Piezas compartidas por las secciones del panel: cajón lateral con
// formulario, campo de imagen e interruptor.
import * as api from '../api.js';
import { esc, icono, alerta, botonCargando, notificar } from '../ui.js';

/**
 * Abre un cajón lateral con un formulario.
 * alGuardar(form) debe devolver true si se guardó (cierra el cajón) o
 * lanzar un error (se muestra arriba del formulario y el cajón sigue abierto).
 */
export function abrirCajon({ titulo, cuerpo, textoGuardar = 'Guardar', alAbrir, alGuardar }) {
  const cajon = document.createElement('dialog');
  cajon.className = 'cajon';
  cajon.setAttribute('aria-labelledby', 'cajon-titulo');
  cajon.innerHTML = `
    <form novalidate>
      <div class="cajon__cabecera">
        <h2 id="cajon-titulo">${esc(titulo)}</h2>
        <button type="button" class="btn-circulo" data-cerrar aria-label="Cerrar">${icono('x')}</button>
      </div>
      <div class="cajon__cuerpo"><div data-alerta></div>${cuerpo}</div>
      <div class="cajon__pie">
        <button type="button" class="btn btn--secundario" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn--verde" data-guardar>${esc(textoGuardar)}</button>
      </div>
    </form>`;
  document.body.append(cajon);
  const form = cajon.querySelector('form');
  cajon.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => cajon.close()));
  cajon.addEventListener('close', () => cajon.remove());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const zonaAlerta = form.querySelector('[data-alerta]');
    zonaAlerta.innerHTML = '';
    const restaurar = botonCargando(form.querySelector('[data-guardar]'), 'Guardando…');
    try {
      if (await alGuardar(form)) cajon.close();
      else restaurar();
    } catch (err) {
      restaurar();
      zonaAlerta.innerHTML = alerta('error', 'No pudimos guardar.', err.message);
      zonaAlerta.scrollIntoView({ block: 'nearest' });
    }
  });
  alAbrir?.(form);
  cajon.showModal();
  form.querySelector('input:not([type=hidden]), select')?.focus();
  return cajon;
}

export function interruptor({ nombre, marcado, texto, id = nombre }) {
  return `<label class="interruptor" for="${esc(id)}">
    <input type="checkbox" id="${esc(id)}" name="${esc(nombre)}" ${marcado ? 'checked' : ''}>
    <span class="interruptor__pista" aria-hidden="true"></span><span>${texto}</span>
  </label>`;
}

/** Campo para subir una imagen al bucket 'imagenes'. Guarda la URL en un input oculto. */
export function campoImagen({ url, texto }) {
  return `<div class="campo">
    <span class="campo__etiqueta">Foto <span class="campo__opcional">(opcional)</span></span>
    <div class="subida">
      <div class="subida__vista" data-vista>${url ? `<img src="${esc(url)}" alt="">` : icono('imagen')}</div>
      <div>
        <label class="btn btn--secundario btn--pequeno" tabindex="0" data-boton-subida>
          <input type="file" accept="image/jpeg,image/png,image/webp" data-archivo>Subir foto
        </label>
        ${url ? '<button type="button" class="btn btn--terciario" data-quitar>Quitar</button>' : ''}
        <p>${esc(texto)} JPG, PNG o WebP de hasta 2 MB.</p>
      </div>
    </div>
    <input type="hidden" name="imagen" value="${esc(url ?? '')}">
  </div>`;
}

export function activarCampoImagen(form, carpeta) {
  const archivo = form.querySelector('[data-archivo]');
  if (!archivo) return;
  const vista = form.querySelector('[data-vista]');
  const oculto = form.elements.imagen;
  const boton = form.querySelector('[data-boton-subida]');
  boton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); archivo.click(); }
  });
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    if (!f) return;
    const zonaAlerta = form.querySelector('[data-alerta]');
    zonaAlerta.innerHTML = '';
    vista.innerHTML = '<span class="giro" aria-label="Subiendo imagen"></span>';
    try {
      oculto.value = await api.subirImagen(f, carpeta);
      vista.innerHTML = `<img src="${esc(oculto.value)}" alt="">`;
    } catch (e) {
      vista.innerHTML = oculto.value ? `<img src="${esc(oculto.value)}" alt="">` : icono('imagen');
      zonaAlerta.innerHTML = alerta('error', 'No pudimos subir la imagen.', e.message);
    }
    archivo.value = '';
  });
  form.querySelector('[data-quitar]')?.addEventListener('click', (e) => {
    oculto.value = '';
    vista.innerHTML = icono('imagen');
    e.target.remove();
  });
}

export const valorDe = (form, nombre) => form.elements[nombre]?.value ?? '';

/** Guarda el cambio de un interruptor de una fila; si falla, lo revierte y avisa. */
export async function alternar(input, accion, mensajeOk) {
  input.disabled = true;
  try {
    await accion(input.checked);
    notificar(mensajeOk(input.checked));
    return true;
  } catch (e) {
    input.checked = !input.checked;
    notificar(e.message, 'error');
    return false;
  } finally {
    input.disabled = false;
  }
}
