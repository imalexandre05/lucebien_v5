-- 0113_evaluar_reporte_validado.sql — reportes_evaluar valida rango, estado y completitud
--
-- Implementa docs/superpowers/specs/reportes/2026-10-04-evaluar-reporte-validado-design.md.
-- Ticket imalexandre05/lucebien-tablero#38 (ítem reportes_evaluar).
--
-- Cuerpo idéntico a la 0081 §1.2 (SECURITY DEFINER, guard de sede, evaluador externo, fórmula de
-- puntaje_eval) salvo tres validaciones nuevas, todas ANTES de escribir nada:
--   1. cada `cal` es un número en [0, 1]      → 'DATO: calificación fuera de rango'
--   2. el reporte no estaba evaluado          → 'ESTADO: el reporte ya fue evaluado'
--      (cubre también no_evaluable; reabrir una evaluación es otra funcionalidad)
--   3. los `cod` de la llamada son exactamente los de reporte_actividades, sin repetir
--                                              → 'DATO: las calificaciones no coinciden con las
--                                                 actividades del reporte'
--      Motivo: reporte_actividades.calificacion tiene `default 1`, así que una actividad omitida
--      quedaba aprobada sin que nadie la mirara. Exigir todas no cambia la nota de ningún reporte
--      bien evaluado (la UI ya enviaba todas).
--
-- Sin pesos nuevos ni defaults de negocio inventados. Idempotente: `create or replace` y los mismos
-- grants de la 0081.

create or replace function reportes_evaluar(p_id text, p_calificaciones jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_sede   text;
  v_eval   boolean;
  v_noeval boolean;
  v_pun    int;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  -- `for update`: dos evaluadores simultáneos se serializan y el segundo ve 'ya evaluado'.
  select sede_cod, evaluado, coalesce(no_evaluable, false)
    into v_sede, v_eval, v_noeval
  from reportes where id = p_id for update;
  if not found then raise exception 'Reporte % no encontrado', p_id; end if;

  -- Reemplaza al using/with check de rep_rw, que esta función deja de tener encima al ser definer.
  if not (private.app_es_admin() or private.app_es_almacen()
          or v_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: el reporte % no es de una sede tuya', p_id;
  end if;

  if not private.app_es_admin()
     and exists (select 1 from reporte_trabajadores where reporte_id = p_id and empleado_id = v_actor) then
    raise exception 'No puedes evaluar este reporte: estuviste en el turno (el evaluador debe ser externo).';
  end if;

  if v_eval or v_noeval then
    raise exception 'ESTADO: el reporte ya fue evaluado';
  end if;

  if p_calificaciones is null or jsonb_typeof(p_calificaciones) <> 'array' then
    raise exception 'DATO: las calificaciones no coinciden con las actividades del reporte';
  end if;

  -- Rango: número JSON entre 0 y 1. Un null, un texto o una clave ausente no lo son.
  if exists (
    select 1 from jsonb_array_elements(p_calificaciones) c
    where jsonb_typeof(c->'cal') is distinct from 'number'
       or (c->>'cal')::numeric not between 0 and 1
  ) then
    raise exception 'DATO: calificación fuera de rango';
  end if;

  -- Completitud: mismo conjunto de códigos que las actividades del reporte, sin repetidos.
  if (select count(*) from jsonb_array_elements(p_calificaciones))
       <> (select count(distinct c->>'cod') from jsonb_array_elements(p_calificaciones) c)
     or exists (select 1 from jsonb_array_elements(p_calificaciones) c
                where not exists (select 1 from reporte_actividades ra
                                  where ra.reporte_id = p_id and ra.cod = c->>'cod'))
     or exists (select 1 from reporte_actividades ra
                where ra.reporte_id = p_id
                  and not exists (select 1 from jsonb_array_elements(p_calificaciones) c
                                  where c->>'cod' = ra.cod))
  then
    raise exception 'DATO: las calificaciones no coinciden con las actividades del reporte';
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

revoke execute on function reportes_evaluar(text, jsonb) from public, anon;
grant  execute on function reportes_evaluar(text, jsonb) to authenticated;
