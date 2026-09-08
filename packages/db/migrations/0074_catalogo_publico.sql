-- 0074_catalogo_publico.sql — el stock real, visible desde la web pública.
--
-- Implementa el puente que pedía el dueño (confirmado por Alexander el
-- 15-ago-2026): el cliente se mide en /mi-talla y, con esa talla, ve QUÉ HAY
-- DISPONIBLE en su medida para reservar. Hasta hoy /mi-talla terminaba en un
-- número sin destino y el catálogo de LB-Web eran datos inventados.
--
-- El stock ya existe: inventario_activo guarda la talla en pulgadas US
-- ('38','40','42'), exactamente el formato que produce el motor de tallas
-- (LB-Web lib/medidas/tallas.ts), así que encajan sin traducción.
--
-- POR QUÉ UNA VISTA Y NO UNA POLICY NUEVA. inventario_activo tiene dos
-- policies (inv_select / inv_write) que limitan todo a admin o empleado de la
-- sede. Abrirle una policy al público expondría la FILA ENTERA: precio_base es
-- el costo interno y usos_acumulados el desgaste de cada prenda — dos cosas
-- que no se le muestran a un cliente. La vista publica un subconjunto
-- explícito de columnas y de filas; las policies del ERP quedan intactas.
--
-- La vista es SECURITY DEFINER (el default de Postgres para vistas): corre con
-- los permisos de su dueño y por eso ve la tabla pese a la RLS. Es deliberado
-- y está acotado por el WHERE — solo prendas marcadas publicable, disponibles
-- y no bloqueadas por su pieza hermana. Las columnas nuevas de
-- inventario_activo NO entran solas: hay que listarlas acá a propósito.
--
-- Idempotente: create or replace view + grants re-ejecutables.

create or replace view v_catalogo_publico as
select
  a.id,
  a.codigo,
  a.tipo,
  a.talla,
  a.color,
  a.sede_cod,
  a.precio_alquiler,
  a.precio_venta,
  a.foto_url,
  a.descripcion_publica,
  a.pieza
from inventario_activo a
where a.publicable is true
  and a.estado = 'disponible'
  -- Una pieza cuya hermana (el saco o el pantalón del mismo terno) está
  -- alquilada o vendida no se ofrece: el conjunto ya no está completo. Mismo
  -- criterio que v_activo_disponible, la vista que el ERP usa internamente.
  and not exists (
    select 1 from inventario_activo f
    where f.id <> a.id
      and f.estado in ('alquilado', 'vendido')
      and (f.id = a.activo_padre_id or f.activo_padre_id = a.id)
  );

comment on view v_catalogo_publico is
  'Catalogo que ve el publico en LB-Web (/mi-talla y catalogo). Solo prendas '
  'publicable=true, disponibles y no bloqueadas por su pieza hermana. NO expone '
  'precio_base (costo interno) ni usos_acumulados (desgaste). Agregar columnas '
  'exige revisar que no sean internas. Migracion 0074.';

-- Lectura pública explícita: un catálogo existe para ser visto.
grant select on v_catalogo_publico to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr tras aplicar):
--   -- 1) No se filtró nada interno:
--   select column_name from information_schema.columns
--     where table_name = 'v_catalogo_publico'
--       and column_name in ('precio_base','usos_acumulados','atributos');   -- 0 filas
--
--   -- 2) Solo salen publicables y disponibles:
--   select count(*) from v_catalogo_publico;
--   select count(*) from inventario_activo where publicable and estado='disponible';
--
--   -- 3) Desde fuera con la key publishable (rol anon):
--   --    GET /rest/v1/v_catalogo_publico?select=codigo,talla   → 200
--   --    GET /rest/v1/inventario_activo?select=precio_base     → [] (la RLS lo tapa)
--
-- NOTA OPERATIVA: hoy inventario_activo tiene 4 filas de prueba y NINGUNA con
-- publicable=true, así que la vista devuelve vacío a propósito — la web dirá
-- "aún no hay stock publicado", no un error. Para publicar una prenda: marcar
-- publicable, cargar foto_url y descripcion_publica desde el ERP.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
