-- =====================================================================
-- Konys Pizza · REVERTIR la carta real (deshace seed_carta_real.sql)
-- Devuelve platos y categorías al estado guardado en el esquema "respaldo"
-- por la migración 002. Solo ejecutar si el equipo decide volver atrás.
-- Ver docs/CAMBIOS_SUPABASE.md, sección 4.
-- =====================================================================
begin;
delete from public.platos where origen = 'oficial' and id not in (select id from respaldo.platos_antes_catalogo);
update public.platos p set
  nombre = r.nombre, categoria_id = r.categoria_id, descripcion = r.descripcion, precio = r.precio,
  imagen_url = r.imagen_url, etiqueta = r.etiqueta, disponible = r.disponible, orden = r.orden,
  id_externo = null, origen = 'manual', subcategoria = null, recomendado = false,
  etiquetas = '{}', variantes = '[]'::jsonb
from respaldo.platos_antes_catalogo r where r.id = p.id;
update public.categorias c set nombre = r.nombre, orden = r.orden, subtitulo = null,
  disponible_desde = null, disponible_hasta = null
from respaldo.categorias_antes_catalogo r where r.id = c.id;
delete from public.categorias where id not in (select id from respaldo.categorias_antes_catalogo);
commit;
