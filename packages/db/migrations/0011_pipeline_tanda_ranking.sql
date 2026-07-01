-- 0011_pipeline_tanda_ranking.sql — dos features interactivas del tablero viejo:
--   · TANDA: avanzar varias prendas de una etapa en UNA sola llamada (reusa pipeline_avanzar
--     por cada id; omite las que no se puedan, ej. divididas). Devuelve los puntos totales.
--   · RANKING del día: puntos por operario desde la medianoche de Perú. SECURITY DEFINER para
--     que CUALQUIER autenticado vea el marcador completo (motivación del personal), exponiendo
--     solo nombre + totales (no datos sensibles).

create or replace function pipeline_avanzar_tanda(p_ids uuid[], p_destino text)
  returns numeric language plpgsql security invoker set search_path = public
as $$
declare v_id uuid; v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  foreach v_id in array p_ids loop
    begin
      v_total := v_total + coalesce(pipeline_avanzar(v_id, p_destino), 0);
    exception when others then null; -- omite prendas que no se pueden avanzar
    end;
  end loop;
  return v_total;
end;
$$;
revoke execute on function pipeline_avanzar_tanda(uuid[], text) from public;
grant execute on function pipeline_avanzar_tanda(uuid[], text) to authenticated;

create or replace function pipeline_ranking_hoy()
  returns table(nombre text, total numeric, acciones bigint)
  language sql security definer set search_path = public stable
as $$
  select e.nombre, sum(pp.puntos)::numeric as total, count(*)::bigint as acciones
  from pipeline_puntos pp
  join empleados e on e.id = pp.empleado_id
  where pp.fecha >= (date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima')
    and pp.puntos > 0
  group by e.id, e.nombre
  order by total desc
  limit 10;
$$;
revoke execute on function pipeline_ranking_hoy() from public;
grant execute on function pipeline_ranking_hoy() to authenticated;
