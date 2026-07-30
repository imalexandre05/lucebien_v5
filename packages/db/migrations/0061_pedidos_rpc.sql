-- 0061_pedidos_rpc.sql — Fase 8 del plan de perfeccionamiento (Pedidos: RPC atómicas).
--
-- pedido_crear / pedido_devolver / pedido_cobrar / pedido_anular. `security invoker` + `set
-- search_path = public`, imitando compra_recibir (0039) y las RPC de solicitudes (0056): cada una
-- respeta la RLS real del actor (nada de security definer salvo los dos helpers de mantenimiento
-- de invariantes de la 0059, que son deliberadamente la excepción, ver su propio comentario).
--
-- Contrato de errores con la UI (constructor de la Fase 9): 'PREFIJO:detalle' —
--   SIN_CAJA             → banner con botón "Abrir caja" inline.
--   ACTIVO_OCUPADO       → 'ACTIVO_OCUPADO:<codigo activo>|<codigo pedido bloqueante>' — marca la
--                           línea y nombra el pedido que lo tiene.
--   ACTIVO_EN_LAVANDERIA → 'ACTIVO_EN_LAVANDERIA:<codigo activo>' — ofrece forzar (p_forzar=true).
--   COBRO_EXCEDE         → ajusta al total.
-- Otros prefijos (mismo mecanismo, sin contrato de UI específico todavía):
-- ITEMS_VACIOS, ITEMS_INVALIDOS, CLIENTE_INVALIDO, GARANTIA_INVALIDA, MONTO_INVALIDO,
-- ESTADO_INVALIDO, SIN_ITEMS, ACCION_INVALIDA, ACTIVO_NO_ENCONTRADO.
--
-- Bloqueo de inventario (checklist obligatorio del plan, punto 3): `for update` sobre TODA la
-- familia (self+padre+hijos, vía inventario_familia() de la 0055 — no se reescribe) de cada activo
-- tocado, SIEMPRE ordenado por id antes de tomar el lock de caja_sesiones — el mismo orden en las
-- cuatro RPC evita deadlocks entre transacciones concurrentes que necesiten ambos locks.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Helper compartido: resolver una garantía (devolver | retener). Lo usan pedido_devolver y
-- pedido_anular. security invoker (a diferencia de los triggers de la 0059): esto SÍ es una
-- acción iniciada por un actor concreto sobre un pedido de su sede — debe respetar la RLS real,
-- no bypassearla. Vive en `private` porque no es una operación que se exponga sola por RPC.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.pedido_garantia_resolver(
  p_pedido_id uuid, p_accion text, p_monto numeric, p_metodo text, p_sede text, p_actor uuid
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_gar     record;
  v_sesion  uuid;
  v_monto   numeric;
  v_mov_id  uuid;
begin
  select * into v_gar from pedido_garantias where pedido_id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido sin fila de garantía (dato inconsistente — debería existir siempre desde la 0060)';
  end if;
  if v_gar.estado <> 'retenida' then
    raise exception 'ESTADO_INVALIDO:La garantía ya está %', v_gar.estado;
  end if;

  -- 'ninguna' se cierra sola, sin acción de dinero/documento posible.
  if v_gar.tipo = 'ninguna' then
    update pedido_garantias set estado = 'devuelta', resuelta_at = now() where id = v_gar.id;
    return;
  end if;

  if p_accion = 'retener' then
    -- Nunca se borra el movimiento de caja que la originó (si lo hubo) — solo cambia el estado.
    update pedido_garantias set estado = 'ejecutada', resuelta_at = now() where id = v_gar.id;
    return;
  end if;

  if p_accion <> 'devolver' then
    raise exception 'ACCION_INVALIDA:Acción de garantía inválida: %', coalesce(p_accion, '(vacía)');
  end if;

  -- Documento (DNI/carnet/licencia...): devolverlo es un acto físico, no mueve caja.
  if v_gar.tipo = 'documento' then
    update pedido_garantias set estado = 'devuelta', resuelta_at = now() where id = v_gar.id;
    return;
  end if;

  -- Efectivo: egreso real (parcial si p_monto viene menor al original — "devolver parte, quedarse
  -- con el resto" también resuelve como 'devuelta', con el monto efectivamente regresado en el
  -- propio caja_movimientos; el ciclo de la 0060 solo define 2 estados terminales, no un 3ro
  -- "parcial" separado). Requiere caja abierta: es dinero saliendo de verdad.
  v_monto := coalesce(p_monto, v_gar.monto, 0);
  if v_monto > 0 then
    select id into v_sesion from caja_sesiones where sede_cod = p_sede and estado = 'abierta' for update;
    if v_sesion is null then
      raise exception 'SIN_CAJA:Abre la caja de % para devolver la garantía', p_sede;
    end if;
    insert into caja_movimientos
      (sesion_id, sede_cod, tipo, categoria, monto, metodo, pedido_id, descripcion, registrado_por_id)
      values (v_sesion, p_sede, 'egreso', 'devolucion_garantia', v_monto,
              coalesce(p_metodo, v_gar.metodo, 'efectivo'), p_pedido_id,
              'Devolución de garantía', p_actor)
      returning id into v_mov_id;
    update pedido_garantias set devolucion_movimiento_id = v_mov_id where id = v_gar.id;
  end if;

  update pedido_garantias set estado = 'devuelta', resuelta_at = now() where id = v_gar.id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- pedido_crear — UNA transacción: upsert de cliente, N líneas, garantía, cobro(s) iniciales e
-- inventario. Devuelve el id del pedido creado (el repo hace un select aparte para traerlo
-- completo, mismo patrón que solicitud_crear en 0056).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pedido_crear(
  p_cliente jsonb,             -- {id?, nombre, dni?, telefono?, medidas?}
  p_sede text,
  p_items jsonb,                -- [{tipo, activo_id?, descripcion?, cantidad?, precio_unitario,
                                 --   precio_lista?, es_cortesia?, notas?, tela?, fecha_prueba?,
                                 --   fecha_segunda_prueba?, etapa_confeccion?}, ...]
  p_garantia jsonb default null, -- {tipo, monto?, metodo?, documento_tipo?, documento_num?}
  p_pagos jsonb default null,    -- [{monto, metodo, descripcion?}, ...]
  p_fecha date default current_date,
  p_fecha_devolucion date default null,
  p_fecha_entrega date default null,
  p_notas text default '',
  p_forzar boolean default false
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_actor         uuid := auth.uid();
  v_cod_actor     text;
  v_cliente_id    uuid;
  v_pedido_id     uuid;
  v_garantia_id   uuid;
  v_mov_id        uuid;
  v_sesion_id     uuid;
  v_activo_ids    uuid[];
  v_activo_id     uuid;
  v_estado_activo text;
  v_codigo_activo text;
  v_padre_id      uuid;
  v_pedido_bloq   text;
  v_fam_codigo    text;
  v_row           record;
  v_pago          record;
  v_total         numeric;
  v_pagado        numeric;
  v_gar_tipo      text;
  v_gar_monto     numeric;
  v_requiere_caja boolean;
  v_cobrado_acum  numeric := 0;
  v_cobro_tipo    text;
  v_n_items_inv   int;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select cod into v_cod_actor from empleados where id = v_actor;

  if coalesce(trim(p_sede), '') = '' then raise exception 'Sede requerida'; end if;

  -- ── 1) Validar forma de p_items ──────────────────────────────────────────────────────────
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_VACIOS:Agrega al menos un ítem al pedido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where coalesce(e ->> 'tipo', '') not in ('alquiler', 'venta', 'servicio', 'confeccion')
  ) then
    raise exception 'ITEMS_INVALIDOS:Cada ítem necesita un tipo válido (alquiler/venta/servicio/confección)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where coalesce((e ->> 'precio_unitario'), '0') !~ '^-?\d+(\.\d+)?$'
  ) then
    raise exception 'ITEMS_INVALIDOS:precio_unitario inválido en algún ítem';
  end if;

  -- ── 2) Bloquear inventario tocado (alquiler/venta con activo_id) ────────────────────────
  select array_agg(distinct (e ->> 'activo_id')::uuid) into v_activo_ids
    from jsonb_array_elements(p_items) e
    where coalesce(e ->> 'activo_id', '') <> '' and (e ->> 'tipo') in ('alquiler', 'venta');

  select count(*) into v_n_items_inv from jsonb_array_elements(p_items) e
    where coalesce(e ->> 'activo_id', '') <> '' and (e ->> 'tipo') in ('alquiler', 'venta');
  if v_activo_ids is not null and array_length(v_activo_ids, 1) <> v_n_items_inv then
    raise exception 'ITEMS_INVALIDOS:Un mismo activo no puede aparecer dos veces en el mismo pedido';
  end if;

  if v_activo_ids is not null then
    -- Lock de TODA la familia de cada activo tocado, ordenado por id (evita deadlocks).
    perform 1 from inventario_activo a
      where a.id in (
        select fam.id from unnest(v_activo_ids) as aid(id)
        cross join lateral inventario_familia(aid.id) fam
      )
      order by a.id
      for update;

    for v_row in
      select e ->> 'activo_id' as activo_id_txt from jsonb_array_elements(p_items) e
      where coalesce(e ->> 'activo_id', '') <> '' and (e ->> 'tipo') in ('alquiler', 'venta')
    loop
      v_activo_id := v_row.activo_id_txt::uuid;
      select estado, codigo, activo_padre_id into v_estado_activo, v_codigo_activo, v_padre_id
        from inventario_activo where id = v_activo_id;
      if not found then
        raise exception 'ACTIVO_NO_ENCONTRADO:%', v_activo_id;
      end if;

      if v_estado_activo in ('alquilado', 'vendido', 'baja') then
        select p.codigo into v_pedido_bloq from pedido_items pi join pedidos p on p.id = pi.pedido_id
          where pi.activo_id = v_activo_id and pi.estado = 'activo'
          order by pi.created_at desc limit 1;
        raise exception 'ACTIVO_OCUPADO:%|%', v_codigo_activo, coalesce(v_pedido_bloq, 'sin pedido activo vinculado');
      end if;

      if v_estado_activo in ('en_pipeline', 'codificando', 'en_compostura') and not p_forzar then
        raise exception 'ACTIVO_EN_LAVANDERIA:%', v_codigo_activo;
      end if;

      -- Bloqueo cruzado por familia (padre u hoja directa — NUNCA hermano, ver inventario.ts::
      -- familiaDeActivo). Solo por ocupación real (alquilado/vendido) — un hermano/padre "en
      -- proceso" no bloquea, la asimetría del despiece es exclusivamente sobre disponibilidad.
      v_fam_codigo := null; v_pedido_bloq := null;
      select f.codigo, p2.codigo into v_fam_codigo, v_pedido_bloq
        from inventario_activo f
        left join pedido_items pi on pi.activo_id = f.id and pi.estado = 'activo'
        left join pedidos p2 on p2.id = pi.pedido_id
        where f.id <> v_activo_id
          and f.estado in ('alquilado', 'vendido')
          and (f.id = v_padre_id or f.activo_padre_id = v_activo_id)
        order by pi.created_at desc nulls last
        limit 1;
      if v_fam_codigo is not null then
        raise exception 'ACTIVO_OCUPADO:%|%', v_fam_codigo, coalesce(v_pedido_bloq, 'sin pedido activo vinculado');
      end if;
    end loop;
  end if;

  -- ── 3) Total, cobro inicial, garantía: validar ANTES de escribir nada ───────────────────
  select coalesce(sum(
    greatest(coalesce((e ->> 'cantidad')::int, 1), 1) *
    (case when coalesce((e ->> 'es_cortesia')::boolean, false) then 0
          else coalesce((e ->> 'precio_unitario')::numeric, 0) end)
  ), 0) into v_total
  from jsonb_array_elements(p_items) e;

  select coalesce(sum(coalesce((e ->> 'monto')::numeric, 0)), 0) into v_pagado
    from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) e;

  v_gar_tipo := coalesce(nullif(p_garantia ->> 'tipo', ''), 'ninguna');
  if v_gar_tipo not in ('efectivo', 'documento', 'ninguna') then
    raise exception 'GARANTIA_INVALIDA:Tipo de garantía inválido: %', v_gar_tipo;
  end if;
  if v_gar_tipo = 'documento'
     and (coalesce(p_garantia ->> 'documento_tipo', '') = '' or coalesce(p_garantia ->> 'documento_num', '') = '') then
    raise exception 'GARANTIA_INVALIDA:Falta el tipo o número de documento de la garantía';
  end if;
  v_gar_monto := case when v_gar_tipo = 'efectivo' then coalesce((p_garantia ->> 'monto')::numeric, 0) else 0 end;

  v_requiere_caja := (v_pagado > 0) or (v_gar_tipo = 'efectivo' and v_gar_monto > 0);
  if v_requiere_caja then
    select id into v_sesion_id from caja_sesiones where sede_cod = p_sede and estado = 'abierta' for update;
    if v_sesion_id is null then
      raise exception 'SIN_CAJA:Abre la caja de % para registrar el cobro o la garantía', p_sede;
    end if;
  end if;

  if v_pagado > v_total then
    raise exception 'COBRO_EXCEDE:El monto cobrado (%) supera el total del pedido (%)', round(v_pagado, 2), round(v_total, 2);
  end if;

  -- ── 4) Cliente: crear o actualizar ("editar todo" — requisito del plan) ────────────────
  if coalesce(p_cliente ->> 'nombre', '') = '' then
    raise exception 'CLIENTE_INVALIDO:El nombre del cliente es obligatorio';
  end if;

  if coalesce(p_cliente ->> 'id', '') <> '' then
    v_cliente_id := (p_cliente ->> 'id')::uuid;
    update clientes set
      nombre = p_cliente ->> 'nombre',
      dni = coalesce(p_cliente ->> 'dni', dni),
      telefono = coalesce(p_cliente ->> 'telefono', telefono),
      medidas = coalesce(p_cliente -> 'medidas', medidas),
      sede_cod = coalesce(sede_cod, p_sede)
    where id = v_cliente_id;
    if not found then raise exception 'CLIENTE_INVALIDO:Cliente % no encontrado', v_cliente_id; end if;
  else
    insert into clientes (nombre, dni, telefono, medidas, sede_cod)
      values (p_cliente ->> 'nombre', coalesce(p_cliente ->> 'dni', ''), coalesce(p_cliente ->> 'telefono', ''),
              coalesce(p_cliente -> 'medidas', '{}'::jsonb), p_sede)
      returning id into v_cliente_id;
  end if;

  -- ── 5) Pedido (cabecera) — tipo sembrado con el primer ítem; el trigger lo recalcula ya
  --      mismo al insertar las líneas (sección 6), igual que `total`. ──────────────────────
  insert into pedidos
    (cliente_id, tipo, sede_cod, estado, fecha, fecha_devolucion, fecha_entrega, notas,
     creado_por_id, creado_por_cod)
    values (v_cliente_id, p_items -> 0 ->> 'tipo', p_sede, 'abierto', p_fecha, p_fecha_devolucion,
            p_fecha_entrega, coalesce(p_notas, ''), v_actor, v_cod_actor)
    returning id into v_pedido_id;

  -- ── 6) Líneas ────────────────────────────────────────────────────────────────────────
  insert into pedido_items (
    pedido_id, activo_id, tipo, descripcion, cantidad, precio_unitario, precio_lista,
    es_cortesia, estado, notas, orden, tela, fecha_prueba, fecha_segunda_prueba, etapa_confeccion
  )
  select
    v_pedido_id,
    nullif(e ->> 'activo_id', '')::uuid,
    e ->> 'tipo',
    coalesce(e ->> 'descripcion', ''),
    greatest(coalesce((e ->> 'cantidad')::int, 1), 1),
    case when coalesce((e ->> 'es_cortesia')::boolean, false) then 0
         else coalesce((e ->> 'precio_unitario')::numeric, 0) end,
    coalesce((e ->> 'precio_lista')::numeric, coalesce((e ->> 'precio_unitario')::numeric, 0)),
    coalesce((e ->> 'es_cortesia')::boolean, false),
    'activo',
    coalesce(e ->> 'notas', ''),
    (ord - 1)::int,
    nullif(e ->> 'tela', ''),
    nullif(e ->> 'fecha_prueba', '')::date,
    nullif(e ->> 'fecha_segunda_prueba', '')::date,
    nullif(e ->> 'etapa_confeccion', '')
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);

  -- ── 7) Inventario: reservar lo que se alquila/vende ────────────────────────────────────
  update inventario_activo set estado = 'alquilado'
    where id in (
      select (e ->> 'activo_id')::uuid from jsonb_array_elements(p_items) e
      where coalesce(e ->> 'activo_id', '') <> '' and e ->> 'tipo' = 'alquiler'
    );
  update inventario_activo set estado = 'vendido'
    where id in (
      select (e ->> 'activo_id')::uuid from jsonb_array_elements(p_items) e
      where coalesce(e ->> 'activo_id', '') <> '' and e ->> 'tipo' = 'venta'
    );

  -- ── 8) Servicio → entra al pipeline (mismo criterio que generaPasada() en @scilb/core) ──
  for v_row in
    select e ->> 'descripcion' as descripcion, nullif(e ->> 'activo_id', '')::uuid as activo_id
    from jsonb_array_elements(p_items) e where e ->> 'tipo' = 'servicio'
  loop
    insert into prenda_pasada (activo_id, codigo, tipo, sede_origen_cod, pedido_id, etapa)
      values (
        v_row.activo_id,
        coalesce((select codigo from inventario_activo where id = v_row.activo_id), nullif(v_row.descripcion, ''), 'Servicio'),
        'servicio', p_sede, v_pedido_id, 'recepcion'
      );
  end loop;

  -- ── 9) Garantía: SIEMPRE se crea una fila, incluso 'ninguna' ───────────────────────────
  insert into pedido_garantias (pedido_id, tipo, monto, metodo, documento_tipo, documento_num, creado_por_id)
    values (
      v_pedido_id, v_gar_tipo,
      case when v_gar_tipo = 'efectivo' then v_gar_monto else null end,
      case when v_gar_tipo = 'efectivo' then coalesce(nullif(p_garantia ->> 'metodo', ''), 'efectivo') else null end,
      case when v_gar_tipo = 'documento' then p_garantia ->> 'documento_tipo' else null end,
      case when v_gar_tipo = 'documento' then p_garantia ->> 'documento_num' else null end,
      v_actor
    )
    returning id into v_garantia_id;

  if v_gar_tipo = 'efectivo' and v_gar_monto > 0 then
    insert into caja_movimientos
      (sesion_id, sede_cod, tipo, categoria, monto, metodo, pedido_id, descripcion, registrado_por_id)
      values (v_sesion_id, p_sede, 'ingreso', 'garantia', v_gar_monto,
              coalesce(nullif(p_garantia ->> 'metodo', ''), 'efectivo'), v_pedido_id,
              'Garantía en efectivo', v_actor)
      returning id into v_mov_id;
    update pedido_garantias set ingreso_movimiento_id = v_mov_id where id = v_garantia_id;
  end if;

  -- ── 10) Cobro(s) iniciales — clasifica adelanto/saldo/completo progresivamente ─────────
  for v_pago in select value as p from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) as value loop
    if coalesce((v_pago.p ->> 'monto')::numeric, 0) > 0 then
      v_cobro_tipo := case
        when v_cobrado_acum + (v_pago.p ->> 'monto')::numeric >= v_total then
          case when v_cobrado_acum <= 0 then 'completo' else 'saldo' end
        else 'adelanto'
      end;
      insert into caja_movimientos
        (sesion_id, sede_cod, tipo, categoria, monto, metodo, pedido_id, cobro_tipo, descripcion, registrado_por_id)
        values (v_sesion_id, p_sede, 'ingreso', 'cobro', (v_pago.p ->> 'monto')::numeric,
                coalesce(v_pago.p ->> 'metodo', 'efectivo'), v_pedido_id, v_cobro_tipo,
                nullif(v_pago.p ->> 'descripcion', ''), v_actor);
      v_cobrado_acum := v_cobrado_acum + (v_pago.p ->> 'monto')::numeric;
    end if;
  end loop;

  return v_pedido_id;
end;
$$;
revoke execute on function pedido_crear(jsonb, text, jsonb, jsonb, jsonb, date, date, date, text, boolean) from public;
grant execute on function pedido_crear(jsonb, text, jsonb, jsonb, jsonb, date, date, date, text, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- pedido_devolver — marca líneas de alquiler devueltas, reingresa los activos al pipeline, cobra
-- el saldo si toca y resuelve la garantía. Idempotente sobre líneas ya devueltas (no-op, no error).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pedido_devolver(
  p_pedido_id uuid,
  p_item_ids uuid[] default null,       -- null = todas las líneas de alquiler activas
  p_cobro_saldo jsonb default null,     -- {monto, metodo?, descripcion?}
  p_garantia jsonb default null         -- {accion: 'devolver'|'retener', monto?, metodo?}
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_actor     uuid := auth.uid();
  v_pedido    record;
  v_sesion_id uuid;
  v_row       record;
  v_activo    record;
  v_ids       uuid[];
  v_restantes int;
  v_monto     numeric;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_pedido.estado = 'cancelado' then raise exception 'ESTADO_INVALIDO:El pedido está cancelado'; end if;

  if p_item_ids is not null then
    v_ids := p_item_ids;
  else
    select array_agg(id) into v_ids from pedido_items
      where pedido_id = p_pedido_id and tipo = 'alquiler' and estado = 'activo';
  end if;
  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'SIN_ITEMS:No hay líneas de alquiler pendientes de devolución';
  end if;

  for v_row in select * from pedido_items where id = any(v_ids) and pedido_id = p_pedido_id loop
    if v_row.tipo <> 'alquiler' then
      raise exception 'ESTADO_INVALIDO:La línea "%" no es de alquiler', coalesce(nullif(v_row.descripcion, ''), v_row.id::text);
    end if;
    if v_row.estado <> 'activo' then
      continue; -- ya devuelta/cancelada: no-op, permite reintentar sin romper.
    end if;

    update pedido_items set estado = 'devuelto', devuelto_at = now() where id = v_row.id;

    if v_row.activo_id is not null then
      select * into v_activo from inventario_activo where id = v_row.activo_id for update;
      if found then
        insert into prenda_pasada (activo_id, codigo, tipo, sede_origen_cod, pedido_id, etapa)
          values (v_activo.id, v_activo.codigo, v_activo.tipo, v_pedido.sede_cod, p_pedido_id, 'recepcion');
        update inventario_activo set estado = 'en_pipeline' where id = v_activo.id;
      end if;
    end if;
  end loop;

  -- Cobro del saldo (opcional) — usa el mismo contrato COBRO_EXCEDE/SIN_CAJA que pedido_cobrar.
  if p_cobro_saldo is not null and coalesce((p_cobro_saldo ->> 'monto')::numeric, 0) > 0 then
    v_monto := (p_cobro_saldo ->> 'monto')::numeric;
    if v_monto > v_pedido.saldo then
      raise exception 'COBRO_EXCEDE:El monto (%) supera el saldo pendiente (%)', round(v_monto, 2), round(v_pedido.saldo, 2);
    end if;
    select id into v_sesion_id from caja_sesiones where sede_cod = v_pedido.sede_cod and estado = 'abierta' for update;
    if v_sesion_id is null then
      raise exception 'SIN_CAJA:Abre la caja de % para cobrar el saldo', v_pedido.sede_cod;
    end if;
    insert into caja_movimientos
      (sesion_id, sede_cod, tipo, categoria, monto, metodo, pedido_id, cobro_tipo, descripcion, registrado_por_id)
      values (v_sesion_id, v_pedido.sede_cod, 'ingreso', 'cobro', v_monto,
              coalesce(p_cobro_saldo ->> 'metodo', 'efectivo'), p_pedido_id, 'saldo',
              coalesce(nullif(p_cobro_saldo ->> 'descripcion', ''), 'Cobro de saldo al devolver'), v_actor);
  end if;

  if p_garantia is not null and coalesce(p_garantia ->> 'accion', '') <> '' then
    perform private.pedido_garantia_resolver(
      p_pedido_id, p_garantia ->> 'accion', nullif(p_garantia ->> 'monto', '')::numeric,
      nullif(p_garantia ->> 'metodo', ''), v_pedido.sede_cod, v_actor
    );
  end if;

  select count(*) into v_restantes from pedido_items
    where pedido_id = p_pedido_id and tipo = 'alquiler' and estado = 'activo';
  if v_restantes = 0 and v_pedido.estado not in ('cerrado', 'cancelado') then
    update pedidos set estado = 'devuelto' where id = p_pedido_id;
  end if;
end;
$$;
revoke execute on function pedido_devolver(uuid, uuid[], jsonb, jsonb) from public;
grant execute on function pedido_devolver(uuid, uuid[], jsonb, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- pedido_cobrar — única verdad del cobro (la usarán /pedidos y, desde la Fase 10, /caja). Deriva
-- adelanto/saldo/completo sola y valida sobrepago contra el saldo REAL (columna generada).
-- Devuelve el cobro_tipo resultante (evita un round-trip extra solo para saberlo).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pedido_cobrar(
  p_pedido_id uuid, p_monto numeric, p_metodo text, p_descripcion text default null
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_actor      uuid := auth.uid();
  v_pedido     record;
  v_sesion_id  uuid;
  v_cobro_tipo text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'MONTO_INVALIDO:El monto debe ser mayor a 0'; end if;

  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_pedido.estado = 'cancelado' then raise exception 'ESTADO_INVALIDO:El pedido está cancelado'; end if;
  if p_monto > v_pedido.saldo then
    raise exception 'COBRO_EXCEDE:El monto (%) supera el saldo pendiente (%)', round(p_monto, 2), round(v_pedido.saldo, 2);
  end if;

  select id into v_sesion_id from caja_sesiones where sede_cod = v_pedido.sede_cod and estado = 'abierta' for update;
  if v_sesion_id is null then
    raise exception 'SIN_CAJA:Abre la caja de % para registrar el cobro', v_pedido.sede_cod;
  end if;

  v_cobro_tipo := case
    when v_pedido.cobrado + p_monto >= v_pedido.total then
      case when v_pedido.cobrado <= 0 then 'completo' else 'saldo' end
    else 'adelanto'
  end;

  insert into caja_movimientos
    (sesion_id, sede_cod, tipo, categoria, monto, metodo, pedido_id, cobro_tipo, descripcion, registrado_por_id)
    values (v_sesion_id, v_pedido.sede_cod, 'ingreso', 'cobro', p_monto, p_metodo, p_pedido_id, v_cobro_tipo,
            nullif(p_descripcion, ''), v_actor);

  return v_cobro_tipo;
end;
$$;
revoke execute on function pedido_cobrar(uuid, numeric, text, text) from public;
grant execute on function pedido_cobrar(uuid, numeric, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- pedido_anular — libera activos, cancela líneas activas, inserta contra-asientos por lo ya
-- cobrado (uno POR MÉTODO de pago, para que el arqueo de caja cuadre exacto) y devuelve la
-- garantía. Nunca borra un caja_movimientos.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pedido_anular(p_pedido_id uuid, p_motivo text default '')
  returns void language plpgsql security invoker set search_path = public as $$
declare
  v_actor     uuid := auth.uid();
  v_pedido    record;
  v_sesion_id uuid;
  v_row       record;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_pedido.estado = 'cancelado' then raise exception 'ESTADO_INVALIDO:El pedido ya está cancelado'; end if;

  for v_row in select * from pedido_items where pedido_id = p_pedido_id and estado = 'activo' for update loop
    if v_row.activo_id is not null and v_row.tipo in ('alquiler', 'venta') then
      update inventario_activo set estado = 'disponible'
        where id = v_row.activo_id and estado in ('alquilado', 'vendido');
    end if;
    update pedido_items set estado = 'cancelado' where id = v_row.id;
  end loop;

  if v_pedido.cobrado > 0 then
    select id into v_sesion_id from caja_sesiones where sede_cod = v_pedido.sede_cod and estado = 'abierta' for update;
    if v_sesion_id is null then
      raise exception 'SIN_CAJA:Abre la caja de % para revertir lo ya cobrado (S/ %) al anular',
        v_pedido.sede_cod, round(v_pedido.cobrado, 2);
    end if;

    -- Un contra-asiento por método (no un solo lump-sum): así el arqueo de caja por método
    -- (efectivo/yape/transferencia) sigue cuadrando tras la anulación.
    for v_row in
      select metodo, sum(monto) as monto from caja_movimientos
      where pedido_id = p_pedido_id and categoria = 'cobro' and tipo = 'ingreso'
      group by metodo
    loop
      insert into caja_movimientos
        (sesion_id, sede_cod, tipo, categoria, monto, metodo, pedido_id, descripcion, registrado_por_id)
        values (v_sesion_id, v_pedido.sede_cod, 'egreso', 'cobro', v_row.monto, v_row.metodo, p_pedido_id,
                'Reverso por anulación de pedido ' || coalesce(v_pedido.codigo, p_pedido_id::text) ||
                case when coalesce(trim(p_motivo), '') <> '' then ': ' || trim(p_motivo) else '' end,
                v_actor);
    end loop;
  end if;

  -- El trato se cae por completo: la garantía siempre se devuelve al anular (nunca se retiene
  -- sobre un pedido que ya no existe como tal).
  perform private.pedido_garantia_resolver(p_pedido_id, 'devolver', null, null, v_pedido.sede_cod, v_actor);

  update pedidos set estado = 'cancelado' where id = p_pedido_id;
end;
$$;
revoke execute on function pedido_anular(uuid, text) from public;
grant execute on function pedido_anular(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (script de humo obligatorio — ver el propio plan de la Fase 8; se ejecuta aparte
-- contra la base real, con dos conexiones concurrentes para el punto 3). Manual de referencia:
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   1) select pedido_crear('{"nombre":"QA"}'::jsonb, 'TR',
--        '[{"tipo":"alquiler","precio_unitario":100}]'::jsonb,
--        '{"tipo":"documento","documento_tipo":"dni","documento_num":"1"}'::jsonb) ;  -- sin caja: OK
--   2) igual pero con p_pagos → 'SIN_CAJA:...'
--   3) dos conexiones, mismo activo_id, alquiler → la 2da 'ACTIVO_OCUPADO:...' tras commitear la 1ra
--   4) p_pagos con monto > total → 'COBRO_EXCEDE:...'
--   5) select count(*) from pedidos; antes y después de cada raise — no debe cambiar
--   6) alquilar AST-501 (hijo) → BST-501 (hermano) sigue disponible; TN-501 (padre) no
