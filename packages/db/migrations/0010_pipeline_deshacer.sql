-- 0010_pipeline_deshacer.sql — "Deshacer" del tablero (los 5 seg para revertir que el
-- personal usaba en el sistema viejo). Revierte la prenda a la etapa anterior, registra el
-- movimiento y BORRA los puntos que se acababan de ganar (el último positivo del actor).
-- Portado de routes/pipeline.js (PUT /:id/deshacer). RPC atómico, security invoker.
create or replace function pipeline_deshacer(p_id uuid, p_etapa_anterior text)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_etapa text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select etapa into v_etapa from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;

  update prenda_pasada set etapa = p_etapa_anterior, fecha_actualizado = now() where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, v_etapa, p_etapa_anterior, v_actor, 'Deshacer');
  delete from pipeline_puntos where id = (
    select id from pipeline_puntos
    where pasada_id = p_id and empleado_id = v_actor and puntos > 0
    order by fecha desc limit 1
  );
end;
$$;
revoke execute on function pipeline_deshacer(uuid, text) from public;
grant execute on function pipeline_deshacer(uuid, text) to authenticated;
