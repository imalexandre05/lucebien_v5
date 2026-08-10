-- 0066_lavanderia_envio_rpc.sql — módulo "Envío a Lavandería" (Fase 11 no cubierta del plan
-- original de 13 fases). El schema ya existía desde 0005/0006 (listas_lavanderia/lista_items,
-- RLS por sede) pero nunca se conectó a ninguna RPC ni UI — puerto directo de
-- routes/lavanderia.js del sistema viejo. Lo usan las TIENDAS: revisan rápido los ternos sucios
-- (código a código, algunos van directo a compostura) y envían lotes de accesorios a granel.
--
-- security invoker (no definer): la RLS de listas_rw/lista_items_rw (0006) ya resuelve el
-- alcance por sede vía app_sedes() — mismo patrón que las RPC de pedidos/solicitudes.

create or replace function lavanderia_enviar(
  p_sede text, p_tipo text, p_resp_inv text, p_resp_traslado text,
  p_generales jsonb default '{}'::jsonb, p_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
  v_item  jsonb;
  v_etapa text;
  v_activo_id uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

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
    );

    -- prenda_historial usa empleado_id (uuid, ya migrado del pseudo-FK por nombre TEXT que
    -- describe CLAUDE.md) — v_actor es quien ejecuta el envío, no resp_traslado (nombre libre
    -- sin garantía de tener cuenta en el sistema).
    insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    select p.id, v_etapa, v_actor, 'Lista ' || v_id || coalesce(' · traslado: ' || nullif(p_resp_traslado, ''), '')
    from prenda_pasada p where p.lista_lavanderia_id = v_id and p.codigo = v_item->>'cod'
    order by p.fecha_ingreso desc limit 1;
  end loop;

  return v_id;
end;
$$;

create or replace function lavanderia_validar_retorno(
  p_id uuid, p_items jsonb default '[]'::jsonb, p_obs_retorno text default null
) returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_item  jsonb;
  v_hay_problemas boolean;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
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
      obs_retorno = coalesce(p_obs_retorno, obs_retorno)
  where id = p_id;
end;
$$;

revoke execute on function lavanderia_enviar(text, text, text, text, jsonb, jsonb) from public;
revoke execute on function lavanderia_validar_retorno(uuid, jsonb, text) from public;
grant execute on function lavanderia_enviar(text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function lavanderia_validar_retorno(uuid, jsonb, text) to authenticated;

-- Permisos de módulo: lo envían las tiendas (mismo set de roles que el sistema viejo daba acceso
-- a 'lavanderia' en DEFAULT_PERMS — encargado_tienda, ventas_junior, ventas_junior_2; NO
-- confeccionista ni encargado_almacen, que reciben del lado del pipeline, no envían).
insert into permisos_modulos (rol, modulo, acciones) values
  ('encargado_tienda',  'lavanderia_envio', array['ver']),
  ('ventas_junior',     'lavanderia_envio', array['ver']),
  ('ventas_junior_2',   'lavanderia_envio', array['ver'])
on conflict (rol, modulo) do nothing;
