-- 0033_reportes_evaluar_admin.sql — ajuste de reportes_evaluar:
--  · admin/dueño puede evaluar cualquier reporte (override; útil para supervisión y testing).
--  · para el resto se mantiene la regla del viejo (el evaluador no puede ser del turno),
--    con un mensaje claro.

create or replace function reportes_evaluar(p_id text, p_calificaciones jsonb)
  returns int language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_pun int;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from reportes where id = p_id) then
    raise exception 'Reporte % no encontrado', p_id;
  end if;
  if not app_es_admin()
     and exists (select 1 from reporte_trabajadores where reporte_id = p_id and empleado_id = v_actor) then
    raise exception 'No puedes evaluar este reporte: estuviste en el turno (el evaluador debe ser externo).';
  end if;

  update reporte_actividades ra
  set calificacion = (c->>'cal')::numeric,
      obs_eval     = coalesce(c->>'obs', '')
  from jsonb_array_elements(p_calificaciones) c
  where ra.reporte_id = p_id and ra.cod = c->>'cod';

  select coalesce(round(sum(peso * calificacion) / nullif(sum(peso), 0) * 100), 0)::int
    into v_pun
  from reporte_actividades where reporte_id = p_id;

  update reportes
  set evaluado = true, evaluador_id = v_actor, puntaje_eval = v_pun, puntaje = v_pun, bloqueado = false
  where id = p_id;

  return v_pun;
end;
$$;
