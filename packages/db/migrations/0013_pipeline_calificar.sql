-- 0013_pipeline_calificar.sql — "Calificar en tienda": el otro extremo de enviar. Cuando un
-- envío llega a la tienda, el encargado acepta cada prenda (termina su viaje → 'recibido') o
-- la observa (vuelve a una etapa de trabajo). Registra prenda_calificacion + historial.
-- Portado de routes/pipeline.js (PUT /envios/:id/calificar). RPC atómico, security invoker.
create or replace function pipeline_calificar(p_id uuid, p_aceptada boolean, p_destino text, p_obs text)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_etapa text; v_envio uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select etapa, envio_id into v_etapa, v_envio from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;

  insert into prenda_calificacion (pasada_id, envio_id, aceptada, obs, calificador_id)
    values (p_id, v_envio, p_aceptada, nullif(p_obs, ''), v_actor);

  if p_aceptada then
    update prenda_pasada set etapa = 'recibido', fecha_actualizado = now() where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
      values (p_id, v_etapa, 'recibido', v_actor, 'Recibida y aceptada en tienda');
  else
    update prenda_pasada set etapa = p_destino, envio_id = null, aprobada = false, fecha_actualizado = now()
      where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
      values (p_id, v_etapa, p_destino, v_actor,
              'Observada en tienda → ' || p_destino || coalesce(': ' || nullif(p_obs, ''), ''));
  end if;
end;
$$;
revoke execute on function pipeline_calificar(uuid, boolean, text, text) from public;
grant execute on function pipeline_calificar(uuid, boolean, text, text) to authenticated;
