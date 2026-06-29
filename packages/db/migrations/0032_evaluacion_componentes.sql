-- 0032_evaluacion_componentes.sql — auto-cálculo de componentes de la nota mensual desde la data.
-- Regla confirmada: cuentan los reportes donde el empleado fue ENCARGADO y que ya están EVALUADOS
-- (solo ahí las calificaciones son reales). Mapeo de categorías del viejo:
--   limpieza = cat 'IND' (incluye las zonas OL_) · software = cod AS*/BS* · operaciones = cod AT*/BT*.
-- Cada componente = avg(calificacion 0..1) × 20 (escala /20). tardanza = max(0, 20 − floor(min/div)),
-- div configurable (config.eval_tardanza_min_por_punto). descuento = Σ puntos_penalidad de incidencias.
-- SECURITY DEFINER (agrega cross-data; lo corre admin). Se suma al lote 0029 diferido.

create or replace function evaluacion_componentes(p_empleado uuid, p_desde date, p_hasta date)
  returns jsonb language sql stable security definer set search_path = public
as $$
  with reps as (
    select id from reportes
    where encargado_id = p_empleado and evaluado and fecha between p_desde and p_hasta
  ),
  acts as (
    select a.cod, a.cat, a.calificacion
    from reporte_actividades a
    join reps r on r.id = a.reporte_id
    where a.calificacion is not null
  ),
  cats as (
    select
      coalesce(avg(calificacion) filter (where cat = 'IND'), 0) * 20            as limpieza,
      coalesce(avg(calificacion) filter (where cod ~ '^(AS|BS)'), 0) * 20       as software,
      coalesce(avg(calificacion) filter (where cod ~ '^(AT|BT)'), 0) * 20       as operaciones
    from acts
  ),
  div as (
    select coalesce((select valor::numeric from config where clave = 'eval_tardanza_min_por_punto'), 15) as v
  ),
  tard as (
    select coalesce(sum(minutos_tardanza), 0) as min
    from asistencias where empleado_id = p_empleado and fecha between p_desde and p_hasta
  ),
  inc as (
    select coalesce(sum(puntos_penalidad), 0) as descuento
    from incidencias where responsable_id = p_empleado and fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'operaciones', round((select operaciones from cats), 2),
    'software',    round((select software from cats), 2),
    'limpieza',    round((select limpieza from cats), 2),
    'tardanza',    greatest(0, 20 - floor((select min from tard) / (select v from div))),
    'descuento',   (select descuento from inc)
  );
$$;

revoke execute on function evaluacion_componentes(uuid, date, date) from public, anon;
grant execute on function evaluacion_componentes(uuid, date, date) to authenticated;
