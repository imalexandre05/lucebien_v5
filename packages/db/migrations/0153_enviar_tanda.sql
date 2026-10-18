-- 0153 — Envío por tanda atómico (lucebien-tablero #39, bloque «Envíos»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-enviar-tanda-atomica-design.md
-- Prueba: packages/db/pruebas/0153_enviar_tanda.prueba.sql (escrita antes). Idempotente.
--
-- Llama a pipeline_enviar por prenda dentro de UNA sola transacción: si una falla, no sale ninguna.
-- Cada prenda conserva su envío (no se inventa un envío por tanda). Los permisos, la etapa y el
-- código de operador los valida pipeline_enviar.
create or replace function public.pipeline_enviar_tanda(p_ids uuid[], p_sede text, p_operador uuid default null)
  returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid; v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'La tanda está vacía: elige al menos una prenda';
  end if;
  for v_id in select distinct x from unnest(p_ids) x loop
    perform public.pipeline_enviar(v_id, p_sede, p_operador);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.pipeline_enviar_tanda(uuid[], text, uuid) from public, anon;
grant  execute on function public.pipeline_enviar_tanda(uuid[], text, uuid) to authenticated;
