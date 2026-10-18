-- 0155 — Tanda: resultado honesto y «Deshacer» (lucebien-tablero #39, bloque «Tanda equivocada»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-tanda-deshacer-y-resultado-design.md
-- Prueba: packages/db/pruebas/0155_tanda_deshacer.prueba.sql (escrita antes). Idempotente.
--
-- 1) pipeline_avanzar_tanda_resultado: mismo recorrido que pipeline_avanzar_tanda (omite las prendas
--    que no se pueden avanzar) pero cuenta movidas y omitidas. 2) pipeline_avanzar_tanda conserva
--    firma y retorno y delega en la nueva. 3) pipeline_deshacer_tanda: deshace varias en UNA
--    transacción (todo o nada), en orden fijo. Las tres son invoker, como pipeline_avanzar_tanda.

create or replace function pipeline_avanzar_tanda_resultado(p_ids uuid[], p_destino text, p_operador uuid default null)
  returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_id uuid; v_total numeric := 0; v_mov int := 0; v_omi int := 0; v_ids jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform private.actor_pipeline(p_operador);   -- lanza CODIGO: si el token no vale; aborta todo
  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    begin
      v_total := v_total + coalesce(pipeline_avanzar(v_id, p_destino, p_operador), 0);
      v_mov := v_mov + 1;
      v_ids := v_ids || to_jsonb(v_id::text);
    exception when others then
      v_omi := v_omi + 1;   -- omite prendas que no se pueden avanzar, pero ahora se cuentan
    end;
  end loop;
  return jsonb_build_object('puntos', v_total, 'movidas', v_mov, 'omitidas', v_omi, 'ids_movidos', v_ids);
end;
$$;
revoke execute on function pipeline_avanzar_tanda_resultado(uuid[], text, uuid) from public, anon;
grant  execute on function pipeline_avanzar_tanda_resultado(uuid[], text, uuid) to authenticated;

create or replace function pipeline_avanzar_tanda(p_ids uuid[], p_destino text, p_operador uuid default null)
  returns numeric language plpgsql security invoker set search_path = public
as $$
begin
  return (pipeline_avanzar_tanda_resultado(p_ids, p_destino, p_operador)->>'puntos')::numeric;
end;
$$;
revoke execute on function pipeline_avanzar_tanda(uuid[], text, uuid) from public, anon;
grant  execute on function pipeline_avanzar_tanda(uuid[], text, uuid) to authenticated;

create or replace function pipeline_deshacer_tanda(p_items jsonb, p_operador uuid default null)
  returns integer language plpgsql security invoker set search_path = public
as $$
declare v_it record; v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La tanda está vacía: elige al menos una prenda';
  end if;
  perform private.actor_pipeline(p_operador);   -- lanza CODIGO: si el token no vale; aborta todo
  for v_it in
    select (x->>'id')::uuid as id, x->>'etapa_anterior' as etapa
      from jsonb_array_elements(p_items) x order by 1
  loop
    begin
      perform pipeline_deshacer(v_it.id, v_it.etapa, p_operador);
    exception when others then
      if sqlerrm like 'CODIGO:%' then raise; end if;
      raise exception '% (prenda %)', sqlerrm,
        coalesce((select codigo from prenda_pasada where id = v_it.id), v_it.id::text);
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function pipeline_deshacer_tanda(jsonb, uuid) from public, anon;
grant  execute on function pipeline_deshacer_tanda(jsonb, uuid) to authenticated;
