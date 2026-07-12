-- 0039_proveedores_compras_stock.sql — S16: Proveedores, compras y control de stock de materiales.
-- Da el maestro de proveedores, el registro de compras y el stock de materiales (telas, hilos,
-- avíos, insumos de lavandería) que se descuenta/repone. Deja el gancho para S19 (stock mínimo /
-- órdenes automáticas) vía stock_minimo + stock_movimientos, y para S21 (alertas de reposición).
-- RLS: materiales/compras por sede (calca el patrón comercial y de caja); proveedores es maestro
-- global (lectura para autenticados, escritura para admin/almacén). Helpers en schema private (0037).
-- Migración idempotente (create table/index if not exists; create or replace en RPCs).

-- ── Maestro de proveedores (global, no atado a sede) ──
create table if not exists proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  ruc        text,
  contacto   text,
  telefono   text,
  direccion  text,
  categoria  text,                       -- del catálogo del adapter (telas, avíos, servicios…)
  activo     boolean not null default true,
  obs        text,
  created_at timestamptz not null default now()
);
create index if not exists idx_proveedores_activo on proveedores(activo);

-- ── Materiales / insumos con stock por sede ──
create table if not exists materiales (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  categoria      text,                    -- del catálogo del adapter
  unidad         text not null default 'unidad',  -- m | kg | unidad | rollo … (config adapter)
  stock_actual   numeric not null default 0,
  stock_minimo   numeric not null default 0,
  sede_cod       text not null references sedes(cod),
  costo_promedio numeric not null default 0,       -- promedio ponderado, recalculado al recibir
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists idx_materiales_sede on materiales(sede_cod);
create index if not exists idx_materiales_bajo on materiales(sede_cod) where activo and stock_actual < stock_minimo;

-- ── Compras (cabecera) ──
create table if not exists compras (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid references proveedores(id) on delete set null,
  fecha          date not null default (now() at time zone 'America/Lima')::date,
  estado         text not null default 'pendiente',   -- 'pendiente' | 'recibida' | 'anulada'
  total          numeric not null default 0,
  sede_cod       text not null references sedes(cod),
  responsable_id uuid references empleados(id),
  obs            text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_compras_sede_fecha on compras(sede_cod, fecha);
create index if not exists idx_compras_proveedor on compras(proveedor_id);

-- ── Ítems de compra ──
create table if not exists compra_items (
  id             uuid primary key default gen_random_uuid(),
  compra_id      uuid not null references compras(id) on delete cascade,
  material_id    uuid not null references materiales(id),
  cantidad       numeric not null,
  costo_unitario numeric not null default 0
);
create index if not exists idx_compra_items_compra on compra_items(compra_id);

-- ── Movimientos de stock (trazabilidad de cada cambio) ──
create table if not exists stock_movimientos (
  id                uuid primary key default gen_random_uuid(),
  material_id       uuid not null references materiales(id),
  sede_cod          text not null references sedes(cod),   -- denormalizado para RLS directa
  tipo              text not null,          -- 'entrada' | 'salida' | 'ajuste'
  cantidad          numeric not null,
  motivo            text,
  ref_tipo          text,                   -- 'compra' | 'consumo' | 'merma' | 'ajuste' | ...
  ref_id            uuid,
  responsable_id    uuid references empleados(id),
  fecha             date not null default (now() at time zone 'America/Lima')::date,
  created_at        timestamptz not null default now()
);
create index if not exists idx_stock_mov_material on stock_movimientos(material_id);
create index if not exists idx_stock_mov_sede_fecha on stock_movimientos(sede_cod, fecha);

-- ── RLS ──
alter table proveedores       enable row level security;
alter table materiales        enable row level security;
alter table compras           enable row level security;
alter table compra_items      enable row level security;
alter table stock_movimientos enable row level security;

-- Proveedores: maestro global — lectura a cualquier autenticado; escritura admin/almacén.
drop policy if exists prov_sel on proveedores;
create policy prov_sel on proveedores for select using (auth.uid() is not null);
drop policy if exists prov_rw on proveedores;
create policy prov_rw on proveedores for all
  using (private.app_es_admin() or private.app_es_almacen())
  with check (private.app_es_admin() or private.app_es_almacen());

-- Materiales / compras / stock: admin OR sede propia.
drop policy if exists mat_rw on materiales;
create policy mat_rw on materiales for all
  using (private.app_es_admin() or (sede_cod in (select private.app_sedes())))
  with check (private.app_es_admin() or (sede_cod in (select private.app_sedes())));

drop policy if exists compras_rw on compras;
create policy compras_rw on compras for all
  using (private.app_es_admin() or (sede_cod in (select private.app_sedes())))
  with check (private.app_es_admin() or (sede_cod in (select private.app_sedes())));

drop policy if exists compra_items_rw on compra_items;
create policy compra_items_rw on compra_items for all
  using (
    private.app_es_admin() or exists (
      select 1 from compras c where c.id = compra_items.compra_id
        and c.sede_cod in (select private.app_sedes())
    )
  )
  with check (
    private.app_es_admin() or exists (
      select 1 from compras c where c.id = compra_items.compra_id
        and c.sede_cod in (select private.app_sedes())
    )
  );

drop policy if exists stock_mov_rw on stock_movimientos;
create policy stock_mov_rw on stock_movimientos for all
  using (private.app_es_admin() or (sede_cod in (select private.app_sedes())))
  with check (private.app_es_admin() or (sede_cod in (select private.app_sedes())));

-- ── RPC: recibir una compra (atómico) ──
-- Estado pendiente → recibida. Por cada ítem: inserta un stock_movimientos de entrada, sube
-- stock_actual y recalcula costo_promedio (promedio ponderado). Fija el total = Σ(cant×costo).
-- security invoker: aplica la RLS del que llama (admin/almacén de la sede de la compra).
create or replace function compra_recibir(p_compra_id uuid)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_estado text;
  v_sede text;
  v_total numeric := 0;
  it record;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select estado, sede_cod into v_estado, v_sede from compras where id = p_compra_id;
  if not found then raise exception 'Compra no encontrada'; end if;
  if v_estado <> 'pendiente' then raise exception 'La compra ya está %', v_estado; end if;

  for it in select material_id, cantidad, costo_unitario from compra_items where compra_id = p_compra_id loop
    v_total := v_total + (it.cantidad * it.costo_unitario);
    insert into stock_movimientos (material_id, sede_cod, tipo, cantidad, motivo, ref_tipo, ref_id, responsable_id)
      values (it.material_id, v_sede, 'entrada', it.cantidad, 'Compra recibida', 'compra', p_compra_id, v_actor);
    update materiales m
      set costo_promedio = case
            when (m.stock_actual + it.cantidad) > 0
            then round(((m.stock_actual * m.costo_promedio) + (it.cantidad * it.costo_unitario))
                       / (m.stock_actual + it.cantidad), 4)
            else m.costo_promedio end,
          stock_actual = m.stock_actual + it.cantidad
      where m.id = it.material_id;
  end loop;

  update compras set estado = 'recibida', total = v_total where id = p_compra_id;
end;
$$;
revoke execute on function compra_recibir(uuid) from public;
grant execute on function compra_recibir(uuid) to authenticated;

-- ── RPC: anular una compra (atómico) ──
-- Si estaba 'recibida', revierte los movimientos: descuenta el stock que había entrado y registra
-- un stock_movimientos de salida por trazabilidad. Luego marca la compra 'anulada'.
create or replace function compra_anular(p_compra_id uuid)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_estado text;
  v_sede text;
  it record;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select estado, sede_cod into v_estado, v_sede from compras where id = p_compra_id;
  if not found then raise exception 'Compra no encontrada'; end if;
  if v_estado = 'anulada' then raise exception 'La compra ya está anulada'; end if;

  if v_estado = 'recibida' then
    for it in select material_id, cantidad from compra_items where compra_id = p_compra_id loop
      insert into stock_movimientos (material_id, sede_cod, tipo, cantidad, motivo, ref_tipo, ref_id, responsable_id)
        values (it.material_id, v_sede, 'salida', it.cantidad, 'Anulación de compra', 'compra', p_compra_id, v_actor);
      update materiales set stock_actual = stock_actual - it.cantidad where id = it.material_id;
    end loop;
  end if;

  update compras set estado = 'anulada' where id = p_compra_id;
end;
$$;
revoke execute on function compra_anular(uuid) from public;
grant execute on function compra_anular(uuid) to authenticated;

-- ── RPC: ajuste/salida manual de material (mermas, consumo de taller) ──
-- Registra el movimiento y ajusta stock_actual. tipo 'salida' resta, 'entrada' suma, 'ajuste' fija.
create or replace function stock_ajustar(p_material_id uuid, p_tipo text, p_cantidad numeric, p_motivo text)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_sede text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then raise exception 'Tipo inválido'; end if;
  if p_cantidad < 0 then raise exception 'La cantidad no puede ser negativa'; end if;
  select sede_cod into v_sede from materiales where id = p_material_id;
  if not found then raise exception 'Material no encontrado'; end if;

  insert into stock_movimientos (material_id, sede_cod, tipo, cantidad, motivo, ref_tipo, responsable_id)
    values (p_material_id, v_sede, p_tipo, p_cantidad, nullif(p_motivo, ''), p_tipo, v_actor);

  update materiales set stock_actual = case
      when p_tipo = 'entrada' then stock_actual + p_cantidad
      when p_tipo = 'salida'  then stock_actual - p_cantidad
      else p_cantidad end
    where id = p_material_id;
end;
$$;
revoke execute on function stock_ajustar(uuid, text, numeric, text) from public;
grant execute on function stock_ajustar(uuid, text, numeric, text) to authenticated;
