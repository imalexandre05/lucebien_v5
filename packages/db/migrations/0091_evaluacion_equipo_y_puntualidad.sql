-- 0091_evaluacion_equipo_y_puntualidad.sql — el turno se evalúa como equipo, y la puntualidad se
-- mide contra el horario contratado, no contra una columna que nadie llena.
--
-- Implementa docs/superpowers/specs/evaluaciones/2026-08-24-equipo-y-puntualidad-design.md §2
-- (C-1 y C-2).
--
-- QUÉ CAMBIA, EN DOS PUNTOS:
--   C-1) `reps` deja de exigir `encargado_id = p_empleado` y suma también a quien aparece en
--        `reporte_trabajadores` de ese turno: los puntos de limpieza/software/operaciones son del
--        equipo entero, no sólo de quien encargó. Verificado contra la base: los únicos dos
--        encargados que existen son los dos administradores, así que para las nueve personas de
--        ventas esos tres componentes —30 % de la nota— salían en cero siempre. `reporte_extras`
--        NO se toca — sigue siendo individual (Alexander, 24-ago-2026: «lo único individual en los
--        reportes son los puntos extras»).
--   C-2) `tard` deja de sumar `asistencias.minutos_tardanza` —columna que nadie escribe, vale 0 en
--        las 1.118 filas de la base— y pasa a medir día por día contra el horario contratado
--        (`sueldo_acuerdo_turnos`), con la misma tolerancia que ya usa el motor de sueldos
--        (`config.sueldo_tolerancia_minutos`, RN-08 de packages/core/src/sueldos.ts — no se inventa
--        una tolerancia distinta para la evaluación). Un día con `tardanza_justificada` no suma
--        minutos, mismo criterio que el motor. Un día sin acuerdo vigente esa fecha, o sin turno
--        contratado ese día de la semana, no aporta minutos.
--
-- DÓNDE VIVE EL CUERPO. `evaluacion_componentes(uuid, date, date)` en el schema `public` es, desde
-- la 0067 (P-02), sólo el portero de permisos: valida quién pregunta y delega en
-- `private.evaluacion_componentes_datos`, que es la función renombrada de la 0032/0044/0053/0057 —
-- ahí es donde vive el cuerpo real, y ahí es donde esta migración reemplaza. `public.
-- evaluacion_componentes` no se toca: sigue siendo el mismo envoltorio `security definer` con su
-- propio guard de permisos (admin, o la propia persona).
--
-- `language sql stable security definer set search_path = public` se conserva tal cual estaba: no
-- se afloja.
--
-- Idempotente: `create or replace function` ya lo es. No cambia la firma ni el schema, así que los
-- `revoke`/`grant` de la 0067 sobre `private.evaluacion_componentes_datos` siguen valiendo sin
-- repetirlos acá.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).
--
-- Esta migración NO agrega ninguna tabla ni parámetro de negocio nuevo: reusa
-- `config.sueldo_tolerancia_minutos`, que ya existe desde la 0072 con default '10' — el mismo
-- default que trae `ParametrosSueldo` en packages/core/src/sueldos.ts:135, reusado acá como
-- fallback defensivo si la fila de config llegara a faltar (mismo patrón que ya usaba esta función
-- para `eval_tardanza_min_por_punto`, CTE `div`).
--
-- Prueba: packages/db/pruebas/0091_evaluacion_equipo_y_puntualidad.prueba.sql
--   bash tools/probar-migracion.sh 0091

create or replace function private.evaluacion_componentes_datos(p_empleado uuid, p_desde date, p_hasta date)
  returns jsonb language sql stable security definer set search_path = public
as $$
  with reps as (
    -- C-1: cualquiera que trabajó el turno lo suma, no sólo quien lo encargó.
    select r.id
    from reportes r
    where r.evaluado
      and r.fecha between p_desde and p_hasta
      and (
        r.encargado_id = p_empleado
        or exists (
          select 1 from reporte_trabajadores rt
          where rt.reporte_id = r.id and rt.empleado_id = p_empleado
        )
      )
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
  -- C-2: la tolerancia es la MISMA que usa el motor de sueldos para decidir si un ingreso cuenta
  -- como tardanza (RN-08). No se inventa una tolerancia distinta para la evaluación.
  tol as (
    select coalesce((select valor::numeric from config where clave = 'sueldo_tolerancia_minutos'), 10) as v
  ),
  -- Un día por fila, con la entrada MÁS TEMPRANA entre todos los tramos de asistencia de ese día
  -- (mismo criterio que sueldo_entrada, migración 0085: `min(s.hora_entrada)` colapsa el día para
  -- que un día partido en tramos se mida contra su primer ingreso). Y, aparte, el inicio del turno
  -- contratado más temprano de ese mismo día de la semana, tomado del acuerdo que cubre esa fecha
  -- — a lo sumo uno, gracias a la restricción de exclusión `sueldo_acuerdos_sin_solape`.
  dias_trabajados as (
    select
      s.fecha,
      min(s.hora_entrada)             as entrada,
      bool_or(s.tardanza_justificada) as justificada,
      (
        select min(t.hora_inicio)
        from sueldo_acuerdos a
        join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
        where a.empleado_id = p_empleado
          and s.fecha between a.fecha_inicio and a.fecha_fin
          and t.dia_semana = extract(isodow from s.fecha)
      ) as inicio_turno
    from asistencias s
    where s.empleado_id = p_empleado
      and s.fecha between p_desde and p_hasta
      and s.condicion = 'trabajado'
    group by s.fecha
  ),
  -- La diferencia se calcula una sola vez, en minutos, restando dos `time` (da un `interval`) y
  -- extrayendo sus segundos — así no hay que multiplicar un `interval` por un `numeric`, operación
  -- ambigua en Postgres. Los minutos que se acumulan son contra la hora PACTADA, no contra la
  -- ajustada por tolerancia: la tolerancia decide si el día cuenta, no cuánto pesa.
  dias_diff as (
    select
      fecha, justificada,
      case when entrada is not null and inicio_turno is not null
           then (extract(epoch from (entrada - inicio_turno)) / 60.0)::numeric
           else null
      end as diff_min
    from dias_trabajados
  ),
  tard as (
    select coalesce(sum(
      case
        -- Un día sin acuerdo vigente o sin turno contratado ese día de la semana llega acá con
        -- diff_min en null (la subconsulta de inicio_turno no encontró fila) y no aporta minutos.
        when diff_min is not null and not justificada and diff_min > (select v from tol)
        then diff_min
        else 0
      end
    ), 0) as min
    from dias_diff
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
  -- Los extras NO se tocan: siguen siendo de quien los registró, no de todo el equipo.
  extr as (
    select coalesce(sum(re.monto_total), 0) as total, count(*) as cantidad,
           coalesce(sum(re.puntos_total), 0) as puntos
    from reporte_extras re
    join reportes r on r.id = re.reporte_id
    where re.registrado_por_id = p_empleado and r.fecha between p_desde and p_hasta
  ),
  val as (
    select
      avg(integridad)::numeric as integridad, avg(respeto)::numeric as respeto,
      avg(honestidad)::numeric as honestidad, avg(amabilidad)::numeric as amabilidad,
      avg(relacion)::numeric as relacion, avg(actitud)::numeric as actitud,
      count(*) as cantidad
    from evaluaciones_valores
    where evaluado_id = p_empleado and mes = to_char(p_desde, 'YYYY-MM')
  )
  select jsonb_build_object(
    'operaciones',      round((select operaciones from cats), 2),
    'software',         round((select software from cats), 2),
    'limpieza',         round((select limpieza from cats), 2),
    'tardanza',         greatest(0, 20 - floor((select min from tard) / (select v from div))),
    'descuento',        (select descuento from inc),
    'puntosPipeline',   round((select total from pipe), 2),
    'extrasMonto',      round((select total from extr), 2),
    'extrasCantidad',   (select cantidad from extr),
    'extrasPuntos',     round((select puntos from extr), 2),
    'valores',
      case when (select cantidad from val) > 0 then
        round((
          ( coalesce((select integridad from val), 0) + coalesce((select respeto from val), 0)
          + coalesce((select honestidad from val), 0) + coalesce((select amabilidad from val), 0)
          + coalesce((select relacion from val), 0)   + coalesce((select actitud from val), 0)
          ) / 6.0 / 5 * 20
        ), 1)
      else null end,
    'valoresCantidad',  (select cantidad from val),
    'bonusVentas',      0
  );
$$;

