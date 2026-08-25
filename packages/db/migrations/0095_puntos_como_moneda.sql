-- 0095_puntos_como_moneda.sql — la nota mensual pasa a leerse desde los puntos acumulados, no de
-- un promedio ponderado de siete componentes.
--
-- Implementa docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-design.md §8.1.
--
-- QUÉ CAMBIA, EN DOS PUNTOS:
--
--   1) `evaluaciones_mensuales` suma dos columnas para poder distinguir cómo se calculó cada
--      evaluación sin recalcular las viejas (spec §2 C-5):
--        · metodo text not null default 'ponderado' — las filas existentes quedan tal cual
--          ('ponderado'), las nuevas se guardan como 'puntos'.
--        · puntos_total numeric, nullable — nulo en las viejas, el total del período en las nuevas.
--      NINGUNA fila existente se recalcula ni se toca: el default cubre exactamente lo que ya hay.
--
--   2) `private.evaluacion_componentes_datos(p_empleado, p_desde, p_hasta)` — la versión viva desde
--      la 0091 (grepeado el nombre contra las 94 migraciones anteriores antes de tocar nada: nadie
--      más la envolvió, renombró ni movió de schema desde entonces) — suma tres claves nuevas al
--      jsonb que ya devolvía, sin quitar ni cambiar ninguna de las que ya estaban:
--        · puntosActividades — sum(calificacion) de la MISMA CTE `acts` que ya arma la función,
--          por `pts_actividad_cumplida` (nuevo parámetro, default provisional 1 — spec §5).
--        · puntosVentas — sum(sueldo_ventas.monto) del período, por `pts_por_sol_vendido` (nuevo
--          parámetro, a propósito SIN default numérico — spec §4, no se inventa cuánto vale una
--          venta). Con la clave vacía o sin sembrar, da exactamente 0.
--        · ventasSinTasa — true sólo cuando la persona SÍ tuvo ventas en el período Y la tasa está
--          vacía/sin sembrar. La pantalla la usa para el aviso de la spec §4 en vez de mostrar una
--          nota que calla que hubo ventas sin contar.
--        · puntosTotal — pipeline + extras + actividades + ventas − descuento(incidencias). Puede
--          dar negativo (una persona con más incidencias que trabajo): el corte a 0 no vive acá,
--          vive en notaDesdePuntos() del core (packages/core/src/evaluaciones.ts), igual que
--          'descuento' ya viajaba sin aplicarse solo antes de esta migración.
--      `public.evaluacion_componentes` — el envoltorio de permisos de la 0067 — NO se toca: sigue
--      siendo el mismo `security definer` que valida quién pregunta y delega. Esta migración
--      reemplaza únicamente el cuerpo en `private`.
--
--   Ninguno de los dos parámetros nuevos (`pts_actividad_cumplida`, `pts_por_sol_vendido`) se
--   siembra como fila de `config` acá: viven sólo en el catálogo de código
--   (apps/erp-web/lib/config-catalogo.ts), mismo criterio que ya usan `eval_tardanza_min_por_punto`
--   y `sueldo_tolerancia_minutos` en esta misma función (`div`/`tol` arriba) — si la fila no
--   existe, el `coalesce` cae al default; si el administrador la guarda desde /configuracion,
--   recién ahí se crea la fila. No hay ningún cálculo hoy que dependa de que exista de antemano.
--
-- SOBRE LA CLAVE VACÍA (crítico, ya nos quemamos con esto — docs/aprendizajes.md «Confiar en
-- Number(valor) para leer config»). `pts_por_sol_vendido` se siembra vacía a propósito: ni una fila
-- en `config`, o una fila con `valor = ''`. El patrón que ya usa esta función para `div`/`tol`
-- (`coalesce((select valor::numeric from config where clave = '...'), default)`) sólo cubre "la
-- fila no existe" — si existiera con `valor = ''`, `''::numeric` explota con "invalid input syntax"
-- en vez de devolver 0. Acá se usa `nullif(valor, '')` ANTES de castear, así "no existe" y "existe
-- vacía" caen al mismo `is null`, que es justo lo que además necesita `ventasSinTasa`. Un valor no
-- vacío pero no numérico (basura real) SÍ corta con error al castear — es intencional, es el otro
-- lado de la misma regla: "vacío cae al default; basura corta con error".
--
-- Idempotente: `create or replace function` ya lo es, y `add column if not exists` también.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio. (Esta migración no crea tablas ni toca RLS: sólo
--     agrega columnas a una tabla que ya tiene sus policies, y reemplaza el cuerpo de una función
--     `private` cuyos grants ya puso la 0067 — no hace falta repetirlos, `create or replace
--     function` conserva el ACL del objeto existente.)
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5). Los 7 parámetros nuevos de esta migración están
--     anotados ahí, junto con las dos preguntas abiertas del techo de sugerirMontoPago (core,
--     packages/core/src/pagos.ts) y de cuánto vale una venta.
--
-- Prueba: packages/db/pruebas/0095_puntos_como_moneda.prueba.sql
--   bash tools/probar-migracion.sh 0095

-- ── 1) evaluaciones_mensuales: metodo + puntos_total ────────────────────────────────────────────
alter table evaluaciones_mensuales add column if not exists metodo text not null default 'ponderado';
alter table evaluaciones_mensuales add column if not exists puntos_total numeric;

comment on column evaluaciones_mensuales.metodo is
  'Cómo se calculó esta evaluación: ''ponderado'' (siete componentes × sus pesos, hasta el
   24-ago-2026) o ''puntos'' (desde la 0095: la nota se lee de puntos_total con notaDesdePuntos()).
   Las evaluaciones ya guardadas NUNCA se recalculan ni cambian de método.';
comment on column evaluaciones_mensuales.puntos_total is
  'El total de puntos del período (pipeline + extras + actividades + ventas − incidencias) que
   produjo nota_final, sólo para metodo = ''puntos''. Nulo en las evaluaciones ''ponderado''.';

-- ── 2) private.evaluacion_componentes_datos: + puntosActividades / puntosVentas / ventasSinTasa /
--       puntosTotal ────────────────────────────────────────────────────────────────────────────
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
    'bonusVentas',      0,
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
