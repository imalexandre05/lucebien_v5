-- 0159_puntualidad_automatica.sql — la nota de puntualidad sale sola de la asistencia, en base 20.
--
-- Spec: docs/superpowers/specs/evaluaciones/2026-10-18-puntualidad-automatica-design.md
-- Prueba: packages/db/pruebas/0159_puntualidad_automatica.prueba.sql   ZONA CRÍTICA (verificador antes de mergear).
--
-- `create or replace` de private.evaluacion_componentes_datos con el cuerpo EXACTO de la 0132 más:
--   * `tardanza` = 20 × puntuales / debidos (default 'proporcion'; 'minutos' = fórmula anterior);
--   * cuatro claves de detalle (puntualidadModo/Debidos/Puntuales/Tardanzas).
-- No cambia ninguna otra clave ni `puntosTotal`. Firma, security definer y permisos intactos.
-- Parámetro nuevo en `config`: eval_puntualidad_modo (default 'proporcion'). Idempotente.

insert into config (clave, valor) values ('eval_puntualidad_modo', 'proporcion') on conflict (clave) do nothing;

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
  -- 🆕 (0159) Puntualidad por proporción. DEFAULT inventado, anotado en docs/pendientes-negocio.md y
  -- editable en /configuración: eval_puntualidad_modo = 'proporcion' (default) | 'minutos'.
  modo as (
    select case when (select valor from config where clave = 'eval_puntualidad_modo') = 'minutos'
                then 'minutos' else 'proporcion' end as v
  ),
  -- Días con turno contratado dentro del ciclo y hasta hoy (hora Perú), salvo los marcados sin_dato
  -- (nadie cargó el dato: no se castiga lo que no se sabe).
  puntual_debidos as (
    select count(*) as n
    from generate_series(p_desde::timestamp, least(p_hasta, (now() at time zone 'America/Lima')::date)::timestamp, interval '1 day') g
    where exists (
            select 1 from sueldo_acuerdos a
            join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
            where a.empleado_id = p_empleado and g::date between a.fecha_inicio and a.fecha_fin
              and t.dia_semana = extract(isodow from g))
      and not exists (
            select 1 from asistencias s
            where s.empleado_id = p_empleado and s.fecha = g::date and s.condicion = 'sin_dato')
  ),
  -- Tardanza = misma regla del sueldo (RN-08): pasa la tolerancia y no está justificada.
  puntual_tard as (
    select count(*) filter (where diff_min is not null and not justificada and diff_min > (select v from tol)) as tardanzas,
           count(*) filter (where not (diff_min is not null and not justificada and diff_min > (select v from tol))) as puntuales
    from dias_diff
  ),
  inc as (
    select coalesce(sum(puntos_penalidad), 0) as descuento
    from incidencias where responsable_id = p_empleado and fecha between p_desde and p_hasta
  ),
  pipe as (
    select coalesce(sum(puntos), 0) as total
    from pipeline_puntos
    where empleado_id = p_empleado
      and (fecha at time zone 'America/Lima')::date between p_desde and p_hasta
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
  ),
  -- 🆕 (0095, spec puntos-como-moneda §5) — pts_actividad_cumplida: default 1, mismo criterio de
  -- coalesce que div/tol arriba, con `nullif` por si el administrador la deja vacía desde
  -- /configuracion en vez de borrar la fila (ver el comentario grande al principio del archivo).
  cfg_act as (
    select coalesce(nullif((select valor from config where clave = 'pts_actividad_cumplida'), '')::numeric, 1) as v
  ),
  -- 🆕 pts_por_sol_vendido: a propósito SIN default. `v` queda null tanto si la fila no existe como
  -- si existe vacía — ese `is null` es lo que decide puntosVentas = 0 y alimenta ventasSinTasa.
  tasa_venta as (
    select nullif((select valor from config where clave = 'pts_por_sol_vendido'), '') as v
  ),
  -- 🆕 Todas las filas de sueldo_ventas del período, sin filtrar por tipo ('venta'/'alquiler') ni
  -- por si ya se liquidaron: acá es "trabajo hecho que da puntos", no el mismo filtro que arma una
  -- liquidación nueva (ese vive en sueldo_entrada, 0073/0093, y sí excluye lo ya liquidado).
  ventas as (
    select coalesce(sum(monto), 0) as total, count(*) as cantidad
    from sueldo_ventas
    where empleado_id = p_empleado and fecha between p_desde and p_hasta
  ),
  -- 🆕 sum(calificacion) sobre la MISMA cte `acts` de arriba (spec: "la CTE existe, reusala") — no
  -- se filtra por categoría: cada actividad calificada del turno cuenta, tal como ya la ve `acts`.
  -- 🆕 (0132) Nota vigente (último examen) de cada capacitación COMPLETADA de la persona como nueva con
  -- cierre dentro del ciclo; se promedia. Cancelada o en curso no cuentan. Sin ninguna → null (manual).
  exa as (
    select avg(n.nota) as promedio, count(*) as cantidad
    from (
      select (select x.nota from capacitacion_examenes x
               where x.capacitacion_id = c.id order by x.fecha desc, x.created_at desc limit 1) as nota
      from capacitaciones c
      where c.nuevo_id = p_empleado and c.estado = 'completada'
        and c.cierre between p_desde and p_hasta
    ) n
    where n.nota is not null
  ),
  desglose as (
    select
      coalesce((select sum(calificacion) from acts), 0) * (select v from cfg_act)          as actividades,
      case when (select v from tasa_venta) is null then 0::numeric
           else (select total from ventas) * (select v from tasa_venta)::numeric
      end                                                                                   as ventas
  )
  select jsonb_build_object(
    'operaciones',      round((select operaciones from cats), 2),
    'software',         round((select software from cats), 2),
    'limpieza',         round((select limpieza from cats), 2),
    'tardanza',
      case when (select v from modo) = 'proporcion' and (select n from puntual_debidos) > 0
           then round(20.0 * least((select puntuales from puntual_tard), (select n from puntual_debidos))
                      / (select n from puntual_debidos), 2)
           else greatest(0, 20 - floor((select min from tard) / (select v from div)))
      end,
    'puntualidadModo',       (select v from modo),
    'puntualidadDebidos',    (select n from puntual_debidos),
    'puntualidadPuntuales',  (select puntuales from puntual_tard),
    'puntualidadTardanzas',  (select tardanzas from puntual_tard),
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
    'bonusVentas',      0,
    -- 🆕 (0132) examenes: null si no hay capacitación cerrada en el ciclo (entrada manual).
    'examenes',         round((select promedio from exa), 2),
    'examenesCantidad', (select cantidad from exa),
    -- 🆕 (0095) — puntos como moneda, spec §2 C-1.
    'puntosActividades', round((select actividades from desglose), 2),
    'puntosVentas',      round((select ventas from desglose), 2),
    'ventasSinTasa',     (select v from tasa_venta) is null and (select cantidad from ventas) > 0,
    'puntosTotal',       round(
                            (select total from pipe) + (select puntos from extr)
                            + (select actividades from desglose) + (select ventas from desglose)
                            - (select descuento from inc)
                          , 2)
  );
$$;
