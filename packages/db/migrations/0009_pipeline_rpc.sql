-- 0009_pipeline_rpc.sql — máxima optimización: las mutaciones del pipeline pasan de ~6
-- viajes de red secuenciales (~1.5s desde Perú) a UNA sola llamada RPC atómica (~200ms).
-- security invoker → respeta la RLS del usuario; auth.uid() identifica al actor.
-- La lógica de puntos (clave por etapa, regla del ½) se replica acá del core para que el
-- cálculo viva junto a la BD; los PESOS siguen viniendo de la tabla config.

-- ── AVANZAR: mueve la prenda, registra historial y otorga puntos. Devuelve los puntos. ──
create or replace function pipeline_avanzar(p_id uuid, p_destino text)
  returns numeric language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_etapa text; v_tipo text; v_tlav text; v_codigo text; v_dividida boolean;
  v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select etapa, tipo, tipo_lavado, codigo, dividida
    into v_etapa, v_tipo, v_tlav, v_codigo, v_dividida
    from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_dividida then raise exception 'Prenda dividida'; end if;

  if v_etapa = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
  else v_clave := 'pts_' || v_etapa; end if;
  select valor::numeric into v_peso from config where clave = v_clave;
  if v_peso is null then v_peso := 1; end if;

  v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
             and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
  v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;

  update prenda_pasada set
    etapa = p_destino,
    fecha_actualizado = now(),
    aprobada = case when p_destino = 'listo' then true else aprobada end,
    lavador_id = case when v_etapa = 'recepcion' then v_actor else lavador_id end,
    planchador_id = case when v_etapa = 'planchado' then v_actor else planchador_id end
  where id = p_id;

  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
  values (p_id, v_etapa, p_destino, v_actor, null);

  if v_pts > 0 then
    insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end, now());
  end if;
  return coalesce(v_pts, 0);
end;
$$;

-- ── ENVIAR: crea el envío, marca enviada y registra historial. ──
create or replace function pipeline_enviar(p_id uuid, p_sede text)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_etapa text; v_envio uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select etapa into v_etapa from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'listo' then raise exception 'Solo se envían prendas listas'; end if;

  insert into envios_prendas (sede_destino_cod, fecha, responsable_id, estado)
    values (p_sede, now(), v_actor, 'enviado') returning id into v_envio;
  update prenda_pasada set etapa = 'enviado', envio_id = v_envio, fecha_actualizado = now() where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, 'listo', 'enviado', v_actor, 'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede);
end;
$$;

-- ── RECHAZAR: devuelve la prenda y descuenta al que hizo esa etapa (regla confirmada). ──
create or replace function pipeline_rechazar(p_id uuid, p_destino text)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_etapa text; v_tipo text; v_tlav text; v_codigo text;
  v_culpable uuid; v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select etapa, tipo, tipo_lavado, codigo into v_etapa, v_tipo, v_tlav, v_codigo
    from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;

  select empleado_id into v_culpable from prenda_historial
    where pasada_id = p_id and etapa_anterior = p_destino and empleado_id is not null
    order by fecha desc limit 1;

  update prenda_pasada set etapa = p_destino, aprobada = false, fecha_actualizado = now() where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino);

  if v_culpable is not null then
    if p_destino = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
    else v_clave := 'pts_' || p_destino; end if;
    select valor::numeric into v_peso from config where clave = v_clave;
    if v_peso is null then v_peso := 1; end if;
    v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
               and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
    v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;
    if v_pts > 0 then
      insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
      values (v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino, now());
    end if;
  end if;
end;
$$;

-- Solo usuarios autenticados pueden invocarlas (anon entra a auth.uid() null → excepción).
revoke execute on function pipeline_avanzar(uuid, text) from public;
revoke execute on function pipeline_enviar(uuid, text) from public;
revoke execute on function pipeline_rechazar(uuid, text) from public;
grant execute on function pipeline_avanzar(uuid, text) to authenticated;
grant execute on function pipeline_enviar(uuid, text) to authenticated;
grant execute on function pipeline_rechazar(uuid, text) to authenticated;
