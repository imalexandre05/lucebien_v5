-- auditoria-puntos.sql — ¿alguien escribió puntos o historial por fuera de las RPC?
--
-- SÓLO LECTURA: una sola sentencia `select`. No hace insert, update, delete ni DDL, y no necesita
-- permisos de escritura. Se puede correr con el rol de sólo lectura o con `execute_sql`.
--
-- POR QUÉ EXISTE. Hasta la migración 0115, `puntos_rw` (pipeline_puntos) y `hist_rw`
-- (prenda_historial) eran `FOR ALL`: cualquier sesión podía insertar, editar o borrar por la API
-- directa. Esa migración cierra el hueco hacia adelante; esto mira hacia atrás: lista lo que se ve
-- raro en lo ya escrito (docs/superpowers/specs/pipeline/2026-10-05-puntos-solo-rpc-design.md §4).
-- Ticket imalexandre05/lucebien-tablero#36. LO CORRE LA SESIÓN MAESTRA CONTRA PRODUCCIÓN, no la
-- rama que lo escribió: aquí sólo se probó contra un Postgres local con datos sintéticos.
--
-- CÓMO LEERLO. Devuelve UNA tabla; la columna `seccion` dice qué es cada fila:
--   A_sin_historial      un punto sin fila de historial que lo respalde (misma prenda, misma etapa,
--                        mismo empleado, ±5 min). Los puntos del rechazo se buscan por el historial
--                        del rechazo (la fila de historial va a nombre de quien rechazó, el punto
--                        va a nombre del culpable): ver `motivo`.
--   B_fuera_de_rango     puntos mayores que el peso máximo configurado para la etapa (config.pts_*;
--                        si la clave no existe, 1: es lo que usa la RPC), o con el signo cambiado
--                        (positivo en un rechazo, negativo fuera de un rechazo).
--   C_duplicado          el mismo empleado/prenda/etapa/puntos repetido, sea cual sea la distancia
--                        en el tiempo (tras un deshacer el punto se borra: no debería haber dos).
--   F_rechazo_sin_negativo  una fila de historial «Rechazado → X» sin su punto `X_rechazo`: ninguna RPC
--                        borra negativos, así que si falta, alguien lo borró (o no había culpable).
--   D_prenda_inexistente puntos sin prenda (`pasada_id` nulo, o que no existe en prenda_pasada;
--                        la FK impide lo segundo, pero se comprueba igual).
--   F_rechazo_sin_negativo  historial de rechazo sin su punto negativo (el abuso de borrar el castigo).
--   E_total_mes          total por empleado y mes (hora de Perú) para compararlo con lo que se
--                        liquidó; `filas_sospechosas` y `puntos_sospechosos` dicen cuánto de ese
--                        total cae en A–D.
--
-- LÍMITES QUE HAY QUE TENER PRESENTES (para no leer un falso positivo como un fraude):
--   · Los puntos que vienen del sistema viejo (ETL del SQLite) no tienen historial: caen en A. Se
--     separan con `desde` (abajo): pon allí la fecha del corte a Postgres para mirar sólo lo
--     posterior. Por defecto mira todo.
--   · Si el administrador cambió un `pts_*` en /configuracion, los puntos viejos pueden superar el
--     peso actual sin que nadie haya escrito nada raro (B). Mira `puntos` contra `peso_max`.
--   · Una fila sospechosa NO es una prueba: es la lista de dónde mirar. El historial puede
--     faltar porque `pipeline_deshacer` lo agrega pero el punto fue borrado, etc. Cada fila trae
--     el detalle para revisarla.
--   · NO detecta (límites conocidos): un par punto+historial falsificado juntos; una media pieza
--     inflada al peso entero; puntos inflados antes de que se SUBIERA un pts_*. E_total_mes agrupa por
--     mes calendario de Lima, mientras el pago usa el ciclo de liquidación y la fecha en UTC de la
--     sesión (0091/0095): los puntos de 19:00-24:00 del último día no van a cuadrar al céntimo.
--   · No dice QUIÉN escribió: la API directa no deja rastro de la sesión. Los pagos ya hechos con
--     un punto dudoso se revisan a mano con el dueño.

with params as (
  select '2000-01-01'::timestamptz as desde        -- ← editar: inicio del periodo a auditar
),
pesos as (   -- peso máximo por etapa, tal como lo lee pipeline_avanzar (config.pts_*; 1 si falta)
  select e.etapa,
         coalesce(
           (select max(case when c.valor ~ '^[0-9]+(\.[0-9]+)?$' then c.valor::numeric end)
              from config c
             where c.clave = case when e.etapa = 'lavado' then c.clave else 'pts_' || e.etapa end
               and (e.etapa <> 'lavado' or c.clave like 'pts\_lavado\_%')),
           1) as peso_max
  from (values ('recepcion'), ('lavado'), ('empatado'), ('refaccion'), ('compostura'),
               ('planchado'), ('control_calidad')) as e(etapa)
),
base as (
  select p.id, p.empleado_id, p.pasada_id, p.etapa, p.puntos, p.detalle, p.fecha,
         e.nombre as empleado, pp.codigo as prenda,
         (p.etapa like '%\_rechazo') as es_rechazo,
         regexp_replace(p.etapa, '_rechazo$', '') as etapa_base
  from pipeline_puntos p
  join params on p.fecha >= params.desde
  left join empleados e     on e.id  = p.empleado_id
  left join prenda_pasada pp on pp.id = p.pasada_id
),
hallazgos as (
  -- A) sin historial que lo respalde
  select 'A_sin_historial'::text as seccion, b.id,
         case when b.es_rechazo
              then 'rechazo sin fila de historial «Rechazado → ' || b.etapa_base || '» (±5 min)'
              else 'sin fila de historial de ' || b.etapa || ' → siguiente (mismo empleado, ±5 min)'
         end as motivo
  from base b
  where not exists (
    select 1 from prenda_historial h
    where h.pasada_id = b.pasada_id
      and h.fecha between b.fecha - interval '5 minutes' and b.fecha + interval '5 minutes'
      and case when b.es_rechazo
               then h.etapa_nueva = b.etapa_base and h.obs like 'Rechazado%'
               else h.etapa_anterior = b.etapa and h.empleado_id = b.empleado_id
          end)
  union all
  -- B) fuera de rango o con el signo cambiado
  select 'B_fuera_de_rango', b.id,
         case
           when b.es_rechazo and b.puntos > 0 then 'rechazo con puntos positivos'
           when not b.es_rechazo and b.puntos < 0 then 'puntos negativos fuera de un rechazo'
           when pe.etapa is null then 'etapa «' || b.etapa || '» que la RPC no puntúa'
           when abs(b.puntos) > pe.peso_max then
             'puntos ' || b.puntos || ' > peso máximo ' || pe.peso_max || ' de ' || b.etapa_base
         end
  from base b
  left join pesos pe on pe.etapa = b.etapa_base
  where (b.es_rechazo and b.puntos > 0)
     or (not b.es_rechazo and b.puntos < 0)
     or pe.etapa is null
     or abs(b.puntos) > pe.peso_max
  union all
  -- C) duplicados: idénticos, o el mismo empleado/prenda/etapa/puntos repetido SIN importar el
  --    tiempo que pasó (una vez deshecho, el punto se borra: un repetido no debería existir)
  select 'C_duplicado', b.id,
         'otras ' || (select count(*) from base o
                       where o.id <> b.id and o.empleado_id = b.empleado_id
                         and o.pasada_id is not distinct from b.pasada_id
                         and o.etapa = b.etapa and o.puntos = b.puntos) || ' filas iguales (revisar fechas)'
  from base b
  where exists (
    select 1 from base o
    where o.id <> b.id and o.empleado_id = b.empleado_id
      and o.pasada_id is not distinct from b.pasada_id
      and o.etapa = b.etapa and o.puntos = b.puntos)
  union all
  -- D) sin prenda
  select 'D_prenda_inexistente', b.id,
         case when b.pasada_id is null then 'pasada_id nulo' else 'la prenda ' || b.pasada_id || ' no existe' end
  from base b
  where b.pasada_id is null or b.prenda is null
),
detalle as (
  select h.seccion, b.empleado, b.prenda, b.etapa, b.puntos, b.fecha,
         null::text as mes, null::bigint as filas, null::numeric as filas_sospechosas,
         null::numeric as puntos_sospechosos,
         h.motivo || coalesce(' · ' || nullif(b.detalle, ''), '') as motivo, b.id::text as id
  from hallazgos h join base b on b.id = h.id
),
faltantes as (   -- F) rechazo en el historial sin su punto negativo `<etapa>_rechazo`
  select 'F_rechazo_sin_negativo'::text as seccion, e.nombre as empleado, pp.codigo as prenda,
         h.etapa_nueva as etapa, null::numeric as puntos, h.fecha,
         null::text as mes, null::bigint as filas, null::numeric as filas_sospechosas,
         null::numeric as puntos_sospechosos,
         'historial «' || h.obs || '» sin punto ' || h.etapa_nueva || '_rechazo (ninguna RPC borra negativos; '
           || 'es legítimo si no había culpable o el peso era 0)' as motivo,
         h.id::text as id
  from prenda_historial h
  join params on h.fecha >= params.desde
  left join empleados e on e.id = h.empleado_id
  left join prenda_pasada pp on pp.id = h.pasada_id
  where h.obs like 'Rechazado%'
    and not exists (select 1 from pipeline_puntos p
                    where p.pasada_id = h.pasada_id and p.etapa = h.etapa_nueva || '_rechazo'
                      and p.fecha between h.fecha - interval '5 minutes' and h.fecha + interval '5 minutes')
),
sospechosa as (select distinct id from hallazgos),
totales as (
  select 'E_total_mes'::text as seccion, b.empleado || ' (' || left(b.empleado_id::text, 8) || ')' as empleado, null::text as prenda, null::text as etapa,
         sum(b.puntos) as puntos, null::timestamptz as fecha,
         to_char(date_trunc('month', b.fecha at time zone 'America/Lima'), 'YYYY-MM') as mes,
         count(*) as filas,
         count(s.id)::numeric as filas_sospechosas,
         coalesce(sum(b.puntos) filter (where s.id is not null), 0) as puntos_sospechosos,
         null::text as motivo, null::text as id
  from base b left join sospechosa s on s.id = b.id
  group by b.empleado_id, b.empleado, to_char(date_trunc('month', b.fecha at time zone 'America/Lima'), 'YYYY-MM')
)
select seccion, empleado, mes, prenda, etapa, puntos, fecha, filas, filas_sospechosas,
       puntos_sospechosos, motivo, id
from (
  select seccion, empleado, mes, prenda, etapa, puntos, fecha, filas, filas_sospechosas,
         puntos_sospechosos, motivo, id from detalle
  union all
  select seccion, empleado, mes, prenda, etapa, puntos, fecha, filas, filas_sospechosas,
         puntos_sospechosos, motivo, id from faltantes
  union all
  select seccion, empleado, mes, prenda, etapa, puntos, fecha, filas, filas_sospechosas,
         puntos_sospechosos, motivo, id from totales
) t
order by seccion, empleado, mes, fecha;
