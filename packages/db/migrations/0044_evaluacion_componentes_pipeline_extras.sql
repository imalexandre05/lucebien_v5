-- 0044_evaluacion_componentes_pipeline_extras.sql — el ledger de movimientos por usuario (Fase 3
-- del plan de mejora) debe incluir TAMBIÉN pipeline y extras, no solo reportes/asistencias/incidencias.
-- No existe una fórmula de negocio confirmada para convertir puntos de pipeline o soles de extras
-- a la escala /20 de un componente — eso se lo pedimos al responsable del proyecto, no se inventa
-- aquí. Por ahora se agregan como DATOS INFORMATIVOS adicionales (no afectan la nota calculada);
-- el admin los ve al lado de los componentes editables y los pondera con su propio criterio.
-- Idempotente (create or replace, misma firma).

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
  ),
  pipe as (
    select coalesce(sum(puntos), 0) as total
    from pipeline_puntos
    where empleado_id = p_empleado and fecha::date between p_desde and p_hasta
  ),
  extr as (
    select coalesce(sum(re.monto_total), 0) as total, count(*) as cantidad
    from reporte_extras re
    join reportes r on r.id = re.reporte_id
    where re.registrado_por_id = p_empleado and r.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'operaciones',      round((select operaciones from cats), 2),
    'software',         round((select software from cats), 2),
    'limpieza',         round((select limpieza from cats), 2),
    'tardanza',         greatest(0, 20 - floor((select min from tard) / (select v from div))),
    'descuento',        (select descuento from inc),
    'puntosPipeline',   round((select total from pipe), 2),
    'extrasMonto',      round((select total from extr), 2),
    'extrasCantidad',   (select cantidad from extr)
  );
$$;

revoke execute on function evaluacion_componentes(uuid, date, date) from public, anon;
grant execute on function evaluacion_componentes(uuid, date, date) to authenticated;
