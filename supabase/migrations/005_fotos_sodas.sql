-- =====================================================================
-- Konys Pizza · Migración 005: fotos de «SODA ARANDANOS» y «SODA MARACUYÁ»
--
-- La carta oficial de Konys usa la MISMA foto para estas dos sodas. La primera
-- versión de seed_carta_real.sql las dejó sin imagen; el equipo decidió (8 nov 2026)
-- mostrar la foto oficial en las dos, igual que en soyclubify.com/d/konys/sodas.
--
-- Solo cambia imagen_url de esos dos productos y solo si siguen sin foto
-- (no pisa una imagen que el administrador haya subido). Idempotente.
-- Instrucciones: docs/CAMBIOS_SUPABASE.md
-- =====================================================================

update public.platos
set imagen_url = 'https://pub-6de3a37544604346a69b9836aed1c6cf.r2.dev/2f275d54-b08d-4b72-a197-d9c61299990a/products/572f69e412d25a5bb0ce.webp'
where id_externo in ('0d5c856e-b81e-4338-9e04-f2b26e27ea37', '85d83346-4aa9-4195-8068-3e0d5c638076')
  and imagen_url is null;
