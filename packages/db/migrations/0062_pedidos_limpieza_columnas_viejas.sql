-- 0062_pedidos_limpieza_columnas_viejas.sql — Fase 10 del plan de perfeccionamiento (Caja
-- integrada + configuración del POS), punto 6: limpieza de columnas viejas de CABECERA que la
-- migración 0059 (Fase 8) preservó a propósito para no romper nada mientras `pedido_items` se
-- volvía la fuente real de estos datos.
--
-- Verificado por grep antes de escribir esto (ningún .ts las lee del lado CABECERA):
--   · pedidos.garantia_monto  → reemplazada por la tabla `pedido_garantias` (migración 0060).
--     El único resto en TypeScript es `pedidoSchema.garantiaMonto` en packages/core/src/pedidos.ts,
--     un schema Zod MUERTO (no lo importa ningún .ts de apps/erp-web — el modal de un solo ítem
--     que lo usaba, app/pedidos/cliente.tsx, ya no existe desde la Fase 9) — no toca esta columna.
--   · pedidos.tela / fecha_prueba / fecha_segunda_prueba / etapa_confeccion → todo el código vivo
--     (lib/pedidos-repo.ts, app/pedidos/constructor/*, app/pedidos/[id]/acciones.tsx,
--     lib/trazabilidad-repo.ts) lee/escribe la columna homónima de `pedido_items` (línea), NUNCA
--     la de `pedidos` (cabecera). `lib/trazabilidad-repo.ts` en particular ya lo dice en su propio
--     comentario (Fase 8): "un pedido nuevo ya no escribe pedidos.etapa_confeccion (queda NULL)".
--   · Los `select('*')` sobre `pedidos` en pedidos-repo.ts y trazabilidad-repo.ts no nombran estas
--     columnas una a una — dejan de traerlas sin más al desaparecer, ningún `.column` roto.
--
-- Idempotente: `drop column if exists`.

alter table pedidos
  drop column if exists garantia_monto,
  drop column if exists tela,
  drop column if exists fecha_prueba,
  drop column if exists fecha_segunda_prueba,
  drop column if exists etapa_confeccion;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr manualmente tras aplicar):
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   select column_name from information_schema.columns
--     where table_name = 'pedidos'
--       and column_name in ('garantia_monto','tela','fecha_prueba','fecha_segunda_prueba','etapa_confeccion');
--   -- esperado: 0 filas
--   select count(*) from pedidos;  -- antes y después, no debe cambiar (solo se borran columnas)
