-- 0047_inventario_atributos_trazabilidad.sql — Fase 8 del plan de mejora (inventario comercial).
--
-- 1) Atributos flexibles: no se inventa un esquema rígido de columnas por tipo de prenda
--    (ternos necesitan tela/forro, camisas cuello/manga, corbatas ancho, etc. — regla de negocio
--    no confirmada). En su lugar, una bolsa clave-valor editable desde el modal de inventario.
--    `publicable`/`descripcion_publica` son el groundwork "web-ready" pedido por el plan: campos
--    públicos vs internos, sin construir todavía la integración real con LB-Web.
alter table inventario_activo
  add column if not exists atributos jsonb not null default '{}'::jsonb,
  add column if not exists publicable boolean not null default false,
  add column if not exists descripcion_publica text not null default '';

-- 2) Trazabilidad pipeline↔inventario: el vínculo YA EXISTÍA a nivel de esquema
--    (prenda_pasada.activo_id → inventario_activo.id, migración 0001, comentario "E5: un activo
--    → muchas pasadas") pero nunca se poblaba desde la app. Fase 8 lo activa en
--    apps/erp-web/lib/pipeline-repo.ts (registrarPasada busca-o-crea el activo por código) para
--    que "nuevo activo entra al pipeline a codificarse" sea real sin cambios de esquema
--    adicionales — el índice idx_pasada_activo ya existe desde 0001.
