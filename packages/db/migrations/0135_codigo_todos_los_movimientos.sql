-- 0135 — Código personal en todos los movimientos del pipeline + código de movimiento.
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-codigo-en-todos-los-movimientos-design.md
-- Prueba: packages/db/pruebas/0135_codigo_todos_los_movimientos.prueba.sql (escrita antes).
-- Ticket: lucebien-tablero #16. Idempotente: se puede reaplicar.
--
-- 1) pipeline_registrar_prenda, lavanderia_enviar y lavanderia_validar_retorno aceptan el token de
--    operador (0112) y lo resuelven con private.actor_pipeline, igual que pipeline_avanzar.
-- 2) Cada fila nueva de prenda_historial recibe un código de movimiento (trigger).

-- ═══ 1) Esquema ═══════════════════════════════════════════════════════════════════════════════
alter table prenda_historial add column if not exists codigo_mov text;
create unique index if not exists uq_prenda_historial_codigo_mov
  on prenda_historial(codigo_mov) where codigo_mov is not null;
create sequence if not exists prenda_mov_seq;
alter table listas_lavanderia add column if not exists validado_por uuid references empleados(id);

-- DEFAULT INVENTADO (regla 5): el dueño no definió el formato del código de movimiento. Prefijo
-- editable en /configuracion; el resto (AAMMDD hora Perú + correlativo de 5 dígitos) es fijo.
-- Anotado en docs/pendientes-negocio.md.
insert into config (clave, valor) values ('pipeline_mov_prefijo', 'MOV') on conflict (clave) do nothing;

-- ═══ 2) Código de movimiento ══════════════════════════════════════════════════════════════════
-- Fecha: la de la propia fila, en hora Perú (nunca la del reloj del servidor en UTC).
create or replace function private.asignar_codigo_mov()
  returns trigger language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare v_pref text;
begin
  if new.codigo_mov is null then
    select nullif(trim(valor), '') into v_pref from config where clave = 'pipeline_mov_prefijo';
    new.codigo_mov := coalesce(v_pref, 'MOV') || '-'
      || to_char(coalesce(new.fecha, now()) at time zone 'America/Lima', 'YYMMDD') || '-'
      || lpad(nextval('prenda_mov_seq')::text, 5, '0');
  end if;
  return new;
end;
$fn$;
revoke execute on function private.asignar_codigo_mov() from public, anon;

drop trigger if exists trg_prenda_historial_codigo_mov on prenda_historial;
create trigger trg_prenda_historial_codigo_mov before insert on prenda_historial
  for each row execute function private.asignar_codigo_mov();

-- ═══ 3) Las tres acciones con código personal ═════════════════════════════════════════════════
drop function if exists public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid);
create or replace function public.pipeline_registrar_prenda(
  p_codigo text, p_tipo text, p_color text, p_talla text, p_sede text,
  p_tipo_lavado text, p_necesita_compostura boolean, p_obs text,
  p_activo_id uuid default null, p_operador uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  -- Misma condición que la policy pasada_insert.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes registrar prendas de la sede %', p_sede;
  end if;
  v_actor := private.actor_pipeline(p_operador);   -- código personal (0112)
  if nullif(trim(coalesce(p_codigo, '')), '') is null then
    raise exception 'El código de la prenda es obligatorio';
  end if;
  if nullif(trim(coalesce(p_tipo, '')), '') is null then
    raise exception 'El tipo de la prenda es obligatorio';
  end if;
  if p_sede is null or not exists (select 1 from sedes where cod = p_sede) then
    raise exception 'La sede % no existe', coalesce(p_sede, '(vacía)');
  end if;
  if p_activo_id is not null
     and not exists (select 1 from inventario_activo where id = p_activo_id) then
    raise exception 'El activo de inventario indicado no existe';
  end if;

  insert into prenda_pasada
    (activo_id, codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado,
     necesita_compostura, obs_general)
  values
    (p_activo_id, trim(p_codigo), trim(p_tipo), coalesce(p_color, ''), coalesce(p_talla, ''),
     p_sede, 'recepcion', p_tipo_lavado, coalesce(p_necesita_compostura, false), p_obs)
  returning id into v_id;

  -- El alta también es un movimiento: queda quién la codificó y con qué código de movimiento.
  perform private.prenda_historial_registrar(v_id, null, 'recepcion', v_actor, 'Alta / codificación');
  return v_id;
end;
$$;
revoke execute on function public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid, uuid) from public, anon;
grant  execute on function public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid, uuid) to authenticated;

drop function if exists public.lavanderia_enviar(text, text, text, text, jsonb, jsonb);
create or replace function public.lavanderia_enviar(
  p_sede text, p_tipo text, p_resp_inv text, p_resp_traslado text,
  p_generales jsonb default '{}'::jsonb, p_items jsonb default '[]'::jsonb,
  p_operador uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_id    uuid;
  v_item  jsonb;
  v_pasada uuid;
  v_etapa text;
  v_activo_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  -- Reemplaza al with check de listas_rw, que esta función deja de tener encima al ser definer.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes enviar a lavandería desde la sede %', p_sede;
  end if;
  v_actor := private.actor_pipeline(p_operador);   -- código personal (0112): CODIGO: si falta o venció

  insert into listas_lavanderia (
    sede_cod, tipo, fecha, resp_inv, resp_traslado,
    camisas, corbatas, michis, corbatones, porta_ternos, zapatos
  ) values (
    p_sede, p_tipo, now(), nullif(p_resp_inv, ''), nullif(p_resp_traslado, ''),
    coalesce((p_generales->>'camisas')::int, 0),
    coalesce((p_generales->>'corbatas')::int, 0),
    coalesce((p_generales->>'michis')::int, 0),
    coalesce((p_generales->>'corbatones')::int, 0),
    coalesce((p_generales->>'porta_ternos')::int, 0),
    coalesce((p_generales->>'zapatos')::int, 0)
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'cod', '') = '' then continue; end if;

    insert into lista_items (lista_id, cod, tipo, color, talla, obs, motivo)
    values (v_id, v_item->>'cod', v_item->>'tipo', v_item->>'color', v_item->>'talla',
            v_item->>'obs', v_item->>'motivo');

    -- Auto-insert al pipeline (mismo comportamiento que routes/lavanderia.js): refacción
    -- siempre a compostura; el resto entra a recepción salvo que la tienda marque el ítem.
    v_etapa := case
      when p_tipo = 'REF' or v_item->>'destino' = 'compostura' then 'compostura'
      else 'recepcion'
    end;

    select id into v_activo_id from inventario_activo where codigo = v_item->>'cod' limit 1;

    insert into prenda_pasada (
      activo_id, codigo, tipo, color, talla, sede_origen_cod, etapa, lista_lavanderia_id
    ) values (
      v_activo_id, v_item->>'cod', v_item->>'tipo', v_item->>'color', v_item->>'talla',
      p_sede, v_etapa, v_id
    ) returning id into v_pasada;

    -- prenda_historial usa empleado_id (uuid, ya migrado del pseudo-FK por nombre TEXT que
    -- describe CLAUDE.md) — v_actor es quien ejecuta el envío, no resp_traslado (nombre libre
    -- sin garantía de tener cuenta en el sistema). El id sale del propio insert: la búsqueda
    -- por (lista, código) de la 0066 elegía UNA prenda cuando el mismo código venía dos veces
    -- en la lista y dejaba a la otra sin historial (arreglo de la 0115).
    perform private.prenda_historial_registrar(v_pasada, null, v_etapa, v_actor,
      'Lista ' || v_id || coalesce(' · traslado: ' || nullif(p_resp_traslado, ''), ''));
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.lavanderia_enviar(text, text, text, text, jsonb, jsonb, uuid) from public, anon;
grant  execute on function public.lavanderia_enviar(text, text, text, text, jsonb, jsonb, uuid) to authenticated;

drop function if exists public.lavanderia_validar_retorno(uuid, jsonb, text);
create or replace function public.lavanderia_validar_retorno(
  p_id uuid, p_items jsonb default '[]'::jsonb, p_obs_retorno text default null,
  p_operador uuid default null
) returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid;
  v_item  jsonb;
  v_hay_problemas boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);   -- código personal (0112)
  if not exists (select 1 from listas_lavanderia where id = p_id) then
    raise exception 'Lista % no encontrada', p_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    update lista_items set estado_retorno = v_item->>'estado'
    where id = (v_item->>'id')::uuid and lista_id = p_id;
  end loop;

  select bool_or(coalesce(estado_retorno, 'bien') <> 'bien') into v_hay_problemas
  from lista_items where lista_id = p_id;

  update listas_lavanderia
  set estado = case when coalesce(v_hay_problemas, false) then 'Devuelto-Observado' else 'Validado' end,
      validado_tienda = true,
      validado_por = v_actor,
      obs_retorno = coalesce(p_obs_retorno, obs_retorno)
  where id = p_id;
end;
$$;
revoke execute on function public.lavanderia_validar_retorno(uuid, jsonb, text, uuid) from public, anon;
grant  execute on function public.lavanderia_validar_retorno(uuid, jsonb, text, uuid) to authenticated;
