-- 0060_pedido_garantias.sql — Fase 8 del plan de perfeccionamiento (Pedidos: garantías con
-- trazabilidad). Tabla polimórfica: efectivo | documento | ninguna. SIEMPRE se crea una fila por
-- pedido (incluso 'ninguna') para dejar traza de la decisión y de quién la tomó — antes esto vivía
-- solo como `pedidos.garantia_monto` (0048), un número suelto sin ciclo de vida ni vínculo a los
-- movimientos de caja que la cobraron/devolvieron.
--
-- Depende de 0059 (pedidos.codigo, pedido_items). Idempotente (create table/index if not exists).

create table if not exists pedido_garantias (
  id                       uuid primary key default gen_random_uuid(),
  pedido_id                uuid not null references pedidos(id) on delete cascade,
  tipo                     text not null check (tipo in ('efectivo', 'documento', 'ninguna')),
  -- Solo aplica a tipo='efectivo':
  monto                    numeric(10,2),
  metodo                   text,
  -- Solo aplica a tipo='documento' (DNI, carnet de extranjería, licencia, ...):
  documento_tipo           text,
  documento_num            text,
  -- Ciclo: retenida → devuelta | ejecutada ('ejecutada' = LuceBien la retiene — daño/pérdida/
  -- incumplimiento; nunca se borra el movimiento de caja que la originó, ver 0061).
  estado                   text not null default 'retenida' check (estado in ('retenida', 'devuelta', 'ejecutada')),
  -- FK a los movimientos de caja de ingreso (al cobrarla) y egreso (al devolverla) — null en
  -- ambos para tipo != 'efectivo' (no hay dinero de por medio) y para el backfill histórico (ver
  -- más abajo: los caja_movimientos categoría 'garantia' de ANTES de esta migración no tienen
  -- pedido_id, así que no hay forma de re-vincularlos).
  ingreso_movimiento_id    uuid references caja_movimientos(id) on delete set null,
  devolucion_movimiento_id uuid references caja_movimientos(id) on delete set null,
  creado_por_id            uuid references empleados(id),
  created_at               timestamptz not null default now(),
  resuelta_at              timestamptz,
  obs                      text not null default '',
  constraint pedido_garantias_efectivo_chk
    check (tipo <> 'efectivo' or monto is not null),
  constraint pedido_garantias_documento_chk
    check (tipo <> 'documento' or (documento_tipo is not null and documento_num is not null))
);

-- Un pedido = una sola garantía (consecuencia directa de la decisión "un pedido por visita, una
-- sola garantía" de la migración 0059) — nunca múltiples filas por pedido.
create unique index if not exists uq_pedido_garantias_pedido on pedido_garantias(pedido_id);
create index if not exists idx_pedido_garantias_estado on pedido_garantias(estado);

alter table pedido_garantias enable row level security;

-- Mismo patrón que pedido_items (0004): hereda la visibilidad/escritura del pedido padre.
drop policy if exists pedido_garantias_all on pedido_garantias;
create policy pedido_garantias_all on pedido_garantias for all
  using (
    private.app_es_admin() or exists (
      select 1 from pedidos p
      where p.id = pedido_garantias.pedido_id and p.sede_cod in (select private.app_sedes())
    )
  )
  with check (
    private.app_es_admin() or exists (
      select 1 from pedidos p
      where p.id = pedido_garantias.pedido_id and p.sede_cod in (select private.app_sedes())
    )
  );

-- Backfill: una fila por pedido existente, derivada de garantia_monto (0048). Idempotente por el
-- índice único de arriba + el "where not exists" (una repetición de esta migración no duplica).
-- ⚠️ No se intenta re-vincular ingreso_movimiento_id contra caja_movimientos históricos: esas filas
-- (categoría 'garantia', de antes de esta fase) tienen pedido_id = null y no hay ninguna clave
-- (monto/fecha no bastan) para asociarlas con certeza a un pedido en particular — quedan como
-- huérfanas a propósito, tal como ya lo documentaba totalGarantias() en lib/caja-repo.ts, que las
-- sigue sumando aparte sin cambios en esta fase.
insert into pedido_garantias (pedido_id, tipo, monto, metodo, estado, obs)
select
  p.id,
  case when coalesce(p.garantia_monto, 0) > 0 then 'efectivo' else 'ninguna' end,
  nullif(p.garantia_monto, 0),
  case when coalesce(p.garantia_monto, 0) > 0 then 'efectivo' else null end,
  'retenida',
  'Backfill automático desde pedidos.garantia_monto (migración 0060).'
from pedidos p
where not exists (select 1 from pedido_garantias g where g.pedido_id = p.id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr manualmente tras aplicar):
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   select count(*) from pedidos p where not exists
--     (select 1 from pedido_garantias g where g.pedido_id = p.id);            -- esperado: 0
--   select tipo, count(*) from pedido_garantias group by tipo;                -- cuadra con
--                                                                              -- pedidos.garantia_monto
