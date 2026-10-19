-- Release 2026-10-19: migraciones 0168 a 0170 en orden. Se aplica DESPUÉS de deploy/2026-10-18b.sql. Idempotente. Sin schema_migrations.
-- Generado de packages/db/migrations; no editar a mano.
begin;

-- ===== 0168_horario_acordado.sql =====
-- 0168_horario_acordado.sql — «Horario acordado ese día»: la tardanza se mide contra la hora acordada.
--
-- Spec: docs/superpowers/specs/asistencias/2026-10-19-horario-acordado-design.md (decisión del dueño n.º 1,
-- 19-oct-2026). Prueba: packages/db/pruebas/0168_horario_acordado.prueba.sql.   ZONA CRÍTICA (verificador antes de mergear).
--
-- Dos columnas nuevas en `asistencias` (nulas por defecto) y dos `create or replace` con el cuerpo EXACTO
-- vigente más una sola línea cada uno:
--   * `sueldo_entrada` (cuerpo de la 0166): emite `inicioAcordado` sólo en los días que lo tienen.
--   * `evaluacion_componentes_datos` (cuerpo de la 0159): `inicio_turno` = hora acordada del día si existe.
-- No cambia horas, tarifas ni faltas. Firmas, security definer y permisos intactos. Sin parámetros de
-- negocio nuevos. Idempotente.

alter table asistencias add column if not exists inicio_acordado time;
alter table asistencias add column if not exists motivo_acordado text;

do $$ begin
  alter table asistencias add constraint asistencias_motivo_acordado_largo
    check (motivo_acordado is null or char_length(motivo_acordado) <= 300);
exception when duplicate_object then null; end $$;

comment on column asistencias.inicio_acordado is
  'Hora de inicio acordada para ese día (0168): la tardanza se mide contra ella y no contra el horario contratado. Nula = sin acuerdo.';
comment on column asistencias.motivo_acordado is
  'Motivo opcional del horario acordado (0168), hasta 300 letras.';

-- ═══ sueldo_entrada — cuerpo de la 0166 con `inicioAcordado` ═══════════════════════════════════
create or replace function public.sueldo_entrada(p_acuerdo uuid, p_desde date, p_hasta date, p_permitir_pendientes boolean default false)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  a          record;
  v_faltan   text;
  v_mixtos   text;
  v_horario  jsonb;
  v_asist    jsonb;
  v_fuera    jsonb;
  v_ventas   jsonb;
  v_meses    jsonb;
  v_par      jsonb;
  v_tard_dif int;
  v_pend     date[] := '{}';
  v_mix_f    date[];
  v_semanas  jsonb;   -- 0166: ventas y metas cargadas por semana
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede liquidar';
  end if;

  select * into a from sueldo_acuerdos where id = p_acuerdo;
  if not found then
    raise exception 'DATO:el acuerdo no existe o no es visible';
  end if;

  -- ── El rango pedido tiene que ser válido y caer DENTRO del acuerdo (C-2, spec §3) ───────────
  -- El trigger sueldo_liq_coherente (0072) ya lo comprobaría al insertar la liquidación, pero
  -- cortar acá, antes de armar todo el jsonb, da un mensaje mejor y más rápido — mismo criterio
  -- que ya usa esta función para sus otros cortes.
  if p_hasta < p_desde then
    raise exception 'DATO:el rango pedido no es válido: % es anterior a %', p_hasta, p_desde;
  end if;
  if p_desde < a.fecha_inicio or p_hasta > a.fecha_fin then
    raise exception 'DATO:el rango % a % se sale del acuerdo, que va de % a %',
      p_desde, p_hasta, a.fecha_inicio, a.fecha_fin;
  end if;

  if not exists (select 1 from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo) then
    raise exception 'DATO:el acuerdo no tiene horario cargado; sin horas contratadas no hay nada que liquidar';
  end if;

  -- ── El control que evita liquidar faltas inventadas ──────────────────────────────────────
  -- Todo día del RANGO PEDIDO (ya no del acuerdo completo: C-2) que caiga en un día con turno
  -- contratado tiene que tener su fila de asistencia DECLARADA. 'sin_dato' no cuenta: significa
  -- que nadie cargó nada, y mandarlo al motor con la hora en null lo convertiría en una falta de
  -- dos días de sueldo.
  select string_agg(to_char(d.dia, 'YYYY-MM-DD'), ', ' order by d.dia), array_agg(d.dia::date order by d.dia)
    into v_faltan, v_pend
  from generate_series(p_desde, p_hasta, interval '1 day') as d(dia)
  where exists (
          select 1 from sueldo_acuerdo_turnos t
          where t.acuerdo_id = p_acuerdo and t.dia_semana = extract(isodow from d.dia)
        )
    and not exists (
          select 1 from asistencias s
          where s.empleado_id = a.empleado_id
            and s.fecha = d.dia::date
            and s.condicion <> 'sin_dato'
        );

  -- 0160: en modo borrador (p_permitir_pendientes) no corta; los días quedan en v_pend y la
  -- asistencia que se manda al motor no los incluye. El cierre llama a la versión de 3 argumentos
  -- (estricta), así que nunca puede cerrar con días pendientes.
  v_pend := coalesce(v_pend, '{}');
  if v_faltan is not null and not p_permitir_pendientes then
    raise exception 'DATO:falta declarar la asistencia de %; ningún día contratado puede quedar sin cargar',
      v_faltan;
  end if;

  -- ── El control del día a medio declarar (0085) ───────────────────────────────────────────
  -- El de arriba mira si el día tiene ALGUNA fila declarada. Éste mira si le falta ALGUNA. Desde
  -- que el huellero escribe una fila por tramo, un día puede tener las dos cosas: la mañana
  -- emparejada y la tarde con la entrada puesta y la salida en null, esperando que alguien diga a
  -- qué hora se fue.
  --
  -- Sin este control ese día se armaba con un solo tramo y se liquidaba a medias sin avisar. Se
  -- corta acá, con el mismo prefijo `DATO:` que usa el resto, para que la pantalla lo muestre igual
  -- que a un día sin cargar y el administrador lo resuelva antes de pagar.
  --
  -- Se miran TODOS los días del RANGO PEDIDO con filas, contratados o no: un tramo trabajado fuera
  -- del horario pactado también se paga (RN-17), así que perderlo en silencio duele lo mismo.
  select string_agg(t.fecha_txt, ', ' order by t.fecha_txt), array_agg(t.fecha order by t.fecha)
    into v_mixtos, v_mix_f
  from (
    select s.fecha, to_char(s.fecha, 'YYYY-MM-DD') as fecha_txt
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between p_desde and p_hasta
    group by s.fecha
    having bool_or(s.condicion = 'sin_dato') and bool_or(s.condicion <> 'sin_dato')
  ) t;

  if v_mixtos is not null and not p_permitir_pendientes then
    raise exception 'DATO:hay tramos sin cerrar en %; ese día quedaría pagado a medias', v_mixtos;
  end if;

  if v_mixtos is not null then
    v_pend := v_pend || v_mix_f;
  end if;

  -- ── El horario contratado ────────────────────────────────────────────────────────────────
  -- No depende del tramo que se esté liquidando: sigue por acuerdo entero (C-2, "lo que NO cambia").
  select coalesce(jsonb_agg(jsonb_build_object(
           'diaSemana',  t.dia_semana,
           'horaInicio', to_char(t.hora_inicio, 'HH24:MI'),
           'horaFin',    to_char(t.hora_fin,    'HH24:MI')
         ) order by t.dia_semana, t.hora_inicio), '[]'::jsonb)
    into v_horario
  from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo;

  -- ── La asistencia, con los TRAMOS del día (RN-05, C-01) ─────────────────────────────
  -- El grano de la tabla es (empleado, fecha, turno) y cada fila con sus dos horas es un tramo
  -- continuo. Antes se colapsaban con min(entrada)/max(salida) y el hueco del medio se pagaba.
  --
  -- Acá NO se ordena, ni se fusiona, ni se aplica el umbral de pausa: eso vive entero en
  -- packages/core/src/sueldos.ts, en un solo lugar. Es la única forma de que un día cargado a mano
  -- por el administrador y un día derivado del huellero se paguen exactamente igual. Esta función
  -- entrega el dato crudo y nada más.
  --
  -- Se sigue emitiendo el par de punta a punta: la tardanza (RN-08) se mide contra el primer
  -- ingreso, y un snapshot guardado antes de esta migración tiene que seguir leyéndose igual.
  --
  -- Se separan los días CON turno contratado (asistencia) de los que no lo tienen
  -- (horasFueraDeContrato, RN-17): el motor los cobra distinto.
  with dias as (
    select
      s.fecha,
      min(s.hora_entrada)                                as entrada,
      max(s.hora_salida)                                 as salida,
      bool_or(s.condicion = 'falta')                     as es_falta,
      bool_or(s.tardanza_justificada)                    as tardanza_just,
      -- 0168: hora de inicio acordada ese día (cualquier tramo que la traiga vale para el día).
      max(s.inicio_acordado)                             as inicio_acordado,
      bool_or(s.falta_justificada)                       as falta_just,
      max(s.motivo_justificacion)                        as motivo,
      -- Migración 0098: si CUALQUIER tramo del día tiene la entrada o la salida puesta por el
      -- sistema (0096/0097), el día entero sale marcado — un día con dos tramos donde sólo uno
      -- está estimado no puede salir "limpio" sólo porque el otro tramo sí tiene marca real.
      bool_or(s.entrada_estimada)                        as entrada_estimada,
      bool_or(s.salida_estimada)                         as salida_estimada,
      -- Un tramo por fila. El `filter` deja fuera las filas sin ninguna de las dos horas: eso no
      -- es un tramo, es una declaración de falta o una fila que alguien creó y no completó.
      coalesce(jsonb_agg(jsonb_build_object(
        'ingreso', to_char(s.hora_entrada, 'HH24:MI'),
        'salida',  to_char(s.hora_salida,  'HH24:MI')
      ) order by s.hora_entrada nulls last, s.turno)
      filter (where s.hora_entrada is not null or s.hora_salida is not null), '[]'::jsonb) as tramos,
      exists (
        select 1 from sueldo_acuerdo_turnos t
        where t.acuerdo_id = p_acuerdo and t.dia_semana = extract(isodow from s.fecha)
      )                                                  as contratado
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between p_desde and p_hasta
      and s.condicion <> 'sin_dato'
      and not (s.fecha = any(v_pend))
    group by s.fecha
  ),
  filas as (
    select contratado, jsonb_build_object(
      'fecha',      to_char(fecha, 'YYYY-MM-DD'),
      -- Una falta se DECLARA con el ingreso en null. Si la condición dice 'falta', se manda null
      -- aunque haya quedado una hora suelta de una carga anterior.
      'horaIngreso', case when es_falta then null else to_char(entrada, 'HH24:MI') end,
      'horaSalida',  case when es_falta then null else to_char(salida,  'HH24:MI') end,
      -- Los tramos de un día declarado 'falta' no se emiten: una falta se declara con el ingreso
      -- en null, y mandar tramos además sería contradecirla con el dato de una carga anterior.
      'tramos',      case when es_falta then '[]'::jsonb else tramos end,
      'tardanzaJustificada', tardanza_just,
      'faltaJustificada',    falta_just,
      'motivoJustificacion', motivo,
      -- Migración 0098: mismo tratamiento que horaIngreso/horaSalida para un día 'falta' — la
      -- declaró una persona, así que no hay ninguna hora "estimada" que nombrar ese día.
      'entradaEstimada', case when es_falta then false else entrada_estimada end,
      'salidaEstimada',  case when es_falta then false else salida_estimada end
    -- 0168: la clave `inicioAcordado` SOLO sale en los días que la tienen. Así un borrador guardado antes
    -- de esta migración no queda «desactualizado» al cerrar (0111 compara la entrada entera).
    ) || case when inicio_acordado is not null
              then jsonb_build_object('inicioAcordado', to_char(inicio_acordado, 'HH24:MI'))
              else '{}'::jsonb end as fila, fecha
    from dias
  )
  select
    coalesce(jsonb_agg(fila order by fecha) filter (where contratado),     '[]'::jsonb),
    coalesce(jsonb_agg(fila order by fecha) filter (where not contratado), '[]'::jsonb)
    into v_asist, v_fuera
  from filas;

  -- ── Las ventas del RANGO PEDIDO que todavía no consumió ninguna liquidación ──────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha',    to_char(v.fecha, 'YYYY-MM-DD'),
           'monto',    v.monto,
           'tipo',     v.tipo,
           'tiendaId', v.sede_cod
         ) order by v.fecha), '[]'::jsonb)
    into v_ventas
  from sueldo_ventas v
  where v.empleado_id = a.empleado_id
    and v.fecha between p_desde and p_hasta
    and v.liquidacion_id is null;

  -- ── 0144: tardanzas de días de períodos cerrados que se trasladaron a este tramo ───────────
  select count(*)::int into v_tard_dif
  from sueldo_tardanzas_diferidas t
  where t.empleado_id = a.empleado_id
    and t.aplicada_en between p_desde and p_hasta;

  -- ── 0166: ventas y metas cargadas a mano por semana (decisión del dueño n.º 8) ─────────────
  -- Las semanas cuyo `desde` cae en el rango. Sólo viajan si hay alguna: sin carga manual el jsonb
  -- es el mismo de antes (regresión). Como el cierre compara esta función, cambiar una semana después
  -- del cálculo hace que el cierre responda DESACTUALIZADA.
  select jsonb_agg(jsonb_build_object(
           'desde',               to_char(w.desde, 'YYYY-MM-DD'),
           'hasta',               to_char(w.hasta, 'YYYY-MM-DD'),
           'totalBoletasMayores', w.total_boletas_mayores,
           'metaCumplida',        w.meta_cumplida,
           'montoVendido',        w.monto_vendido
         ) order by w.desde)
    into v_semanas
  from sueldo_ventas_semana w
  where w.empleado_id = a.empleado_id
    and w.desde between p_desde and p_hasta;

  -- ── Los puntos de los MESES DEL CONTRATO que cierran en el tramo (0126, spec §8.2) ─────────
  -- Un mes del contrato va del día de inicio al día anterior al mismo día del mes siguiente. Se
  -- calcula SIEMPRE desde fecha_inicio (ws_k = fecha_inicio + k meses): Postgres recorta a fin de
  -- mes (31-ene + 1 mes = 28-feb) y encadenar mes a mes derivaría el día. El mes k termina en
  -- we_k = ws_(k+1) − 1 y su último día efectivo es e_k = least(we_k, fin del contrato). Se paga,
  -- completo, en el tramo que contiene e_k; los demás tramos reciben `[]`.
  --
  -- «Activo» se decide con los parámetros EFECTIVOS DEL CONTRATO (los mismos que viajan en
  -- `parametros`): las dos claves numéricas. Un `null` del contrato (JSON null) gana a la
  -- configuración y apaga el pago aunque /configuracion esté encendida (§8.1). Apagado viaja
  -- `null`: la liquidación de hoy no depende de la evaluación y la clave no cambia entre cálculos.
  --
  -- Los puntos de cada mes son `puntosTotal` de evaluacion_componentes_datos, a través de
  -- private.sueldo_puntos_periodo (el wrapper exige administrador). Una sola definición de «puntos».
  v_par := private.sueldo_parametros_config() || a.parametros;
  if jsonb_typeof(v_par -> 'puntosMetaMensual') = 'number'
     and jsonb_typeof(v_par -> 'solesPorPunto') = 'number' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'desde',    to_char(m.ws, 'YYYY-MM-DD'),
             'hasta',    to_char(m.e,  'YYYY-MM-DD'),
             'hastaMes', to_char(m.we, 'YYYY-MM-DD'),
             'puntos',   private.sueldo_puntos_periodo(a.empleado_id, m.ws, m.e)
           ) order by m.ws), '[]'::jsonb)
      into v_meses
    from (
      select k.ws, k.we, least(k.we, a.fecha_fin) as e
      from (
        select (a.fecha_inicio + make_interval(months => g.k))::date as ws,
               (a.fecha_inicio + make_interval(months => g.k + 1))::date - 1 as we
        from generate_series(
               0,
               (extract(year from a.fecha_fin)::int - extract(year from a.fecha_inicio)::int) * 12
                 + (extract(month from a.fecha_fin)::int - extract(month from a.fecha_inicio)::int) + 1
             ) as g(k)
      ) k
      where k.ws <= a.fecha_fin
    ) m
    where m.e between p_desde and p_hasta;
  end if;

  -- Los nulls NO se quitan: `horaIngreso: null` ES la declaración de una falta (sueldos.ts:569
  -- lee `== null`), y quien abra este snapshot dentro de un año tiene que verlo.
  return case when v_semanas is null then '{}'::jsonb
              else jsonb_build_object('ventasSemanales', v_semanas) end
  || jsonb_build_object(
    'acuerdoId',     a.id,
    'empleadoId',    a.empleado_id,
    -- Antes eran a.fecha_inicio/a.fecha_fin (el acuerdo completo). Ahora son el TRAMO pedido: es
    -- lo que packages/core/src/sueldos.ts usa para diasDelPeriodo()/horasContratadas(), así que
    -- este es el cambio que hace que valorPorHora se calcule contra las horas del tramo, no las
    -- de todo el contrato (spec §2).
    'fechaInicio',   to_char(p_desde, 'YYYY-MM-DD'),
    'fechaFin',      to_char(p_hasta, 'YYYY-MM-DD'),
    'modalidad',     a.modalidad,
    'sueldoPactado', a.sueldo_pactado,
    'horario',       v_horario,
    'asistencia',    v_asist,
    'horasFueraDeContrato', v_fuera,
    'ventas',        v_ventas,
    'tardanzasDiferidas', v_tard_dif,
    'almuerzoHabilitadoPorAdmin', a.almuerzo_habilitado,
    -- Los tres tipos de PLATA van como lista; los dos de CONTEO van como número. Es la distinción
    -- que la 0072 hizo excluyente con sueldo_mov_unidad_chk. Los cinco, ahora acotados al TRAMO
    -- pedido (p_desde..p_hasta) y no al acuerdo completo: si no, liquidar julio y agosto por
    -- separado contaría el mismo adelanto, la misma venta consumida o el mismo almuerzo dos veces.
    'adelantos',    private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'adelanto'),
    'reportes',     private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'reporte'),
    'bonosExtras',  private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'bono_extra'),
    'almuerzosEntregados', private.sueldo_movimientos_conteo(a.empleado_id, p_desde, p_hasta, 'almuerzo_entregado'),
    'personasCapacitadas', private.sueldo_movimientos_conteo(a.empleado_id, p_desde, p_hasta, 'capacitacion'),
    -- 0126: puntos de cada mes del contrato que cierra en este tramo, para el «Bono por puntos».
    -- Reemplaza a `puntosPeriodo` (0117). Viaja dentro de la entrada guardada de la liquidación,
    -- así el cierre que compara «datos actuales» también ve si cambiaron.
    'puntosMeses',  v_meses,
    -- Precedencia de la spec §5: default del core ← config global ← override del contrato.
    'parametros',   private.sueldo_parametros_config() || a.parametros
  ) || case when cardinality(v_pend) > 0
            then jsonb_build_object('diasSinDeclarar',
                   (select jsonb_agg(to_char(x, 'YYYY-MM-DD') order by x) from (select distinct unnest(v_pend) as x) u))
            else '{}'::jsonb end;
end;

$function$;

-- ═══ evaluacion_componentes_datos — cuerpo de la 0159 con la hora acordada ═════════════════════
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
      -- 🆕 (0168) la hora acordada ese día manda sobre el inicio del turno contratado.
      coalesce(max(s.inicio_acordado), (
        select min(t.hora_inicio)
        from sueldo_acuerdos a
        join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
        where a.empleado_id = p_empleado
          and s.fecha between a.fecha_inicio and a.fecha_fin
          and t.dia_semana = extract(isodow from s.fecha)
      )) as inicio_turno
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
  -- Días con turno contratado dentro del ciclo y hasta hoy (hora Perú) cuya asistencia está DECLARADA
  -- (trabajado o falta) y sin ninguna fila sin_dato: un día sin cargar, sin fila o a medias no se
  -- castiga (mismo criterio que sueldo_entrada, 0160).
  puntual_debidos_f as (
    select g::date as fecha
    from generate_series(p_desde::timestamp, least(p_hasta, (now() at time zone 'America/Lima')::date)::timestamp, interval '1 day') g
    where exists (
            select 1 from sueldo_acuerdos a
            join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
            where a.empleado_id = p_empleado and g::date between a.fecha_inicio and a.fecha_fin
              and t.dia_semana = extract(isodow from g))
      and exists (
            select 1 from asistencias s
            where s.empleado_id = p_empleado and s.fecha = g::date and s.condicion <> 'sin_dato')
      and not exists (
            select 1 from asistencias s
            where s.empleado_id = p_empleado and s.fecha = g::date and s.condicion = 'sin_dato')
      -- Decisión del dueño (18-oct-2026): una falta justificada no baja la nota.
      and not exists (
            select 1 from asistencias s
            where s.empleado_id = p_empleado and s.fecha = g::date and s.condicion = 'falta' and s.falta_justificada)
  ),
  puntual_debidos as (select count(*) as n from puntual_debidos_f),
  -- Tardanza = misma regla del sueldo (RN-08): pasa la tolerancia y no está justificada. Solo cuentan
  -- los días debidos con turno: un día trabajado fuera de contrato no puede tapar una tardanza.
  puntual_tard as (
    select count(*) filter (where diff_min > (select v from tol) and not justificada) as tardanzas,
           count(*) filter (where not (diff_min > (select v from tol) and not justificada)) as puntuales
    from dias_diff
    where diff_min is not null and fecha in (select fecha from puntual_debidos_f)
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

-- ===== 0169_meta_periodo.sql =====
-- 0169_meta_periodo.sql — la meta del período que el administrador puede modificar (1.ª comisión).
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-meta-del-periodo-primera-comision-design.md (decisión del dueño n.º 2,
-- corregida el 19-oct-2026). Prueba: packages/db/pruebas/0169_meta_periodo.prueba.sql.   ZONA CRÍTICA (verificador antes de mergear).
--
-- Una tabla chica (una fila por persona y período) y `sueldo_entrada` (cuerpo de la 0168) con una clave más,
-- `metaPeriodoManual`, solo cuando hay fila. La regla vive en el core. Aún no está en producción. Idempotente.

create table if not exists sueldo_meta_periodo (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references empleados(id) on delete restrict,
  desde          date not null,
  hasta          date not null,
  meta           numeric(12,2) not null,
  creado_por     uuid references empleados(id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint sueldo_mp_meta_chk  check (meta >= 0),
  constraint sueldo_mp_rango_chk check (hasta >= desde),
  constraint sueldo_mp_unica     unique (empleado_id, desde, hasta)
);

comment on table sueldo_meta_periodo is
  'Meta del período puesta por el administrador (0169, decisión del dueño n.º 2): reemplaza la estimada (metaPorHora × horas trabajadas) para desbloquear la 1.ª comisión.';

alter table sueldo_meta_periodo enable row level security;
drop policy if exists sueldo_mp_select on sueldo_meta_periodo;
create policy sueldo_mp_select on sueldo_meta_periodo for select
  using (private.app_es_admin() or empleado_id = auth.uid());
drop policy if exists sueldo_mp_admin on sueldo_meta_periodo;
create policy sueldo_mp_admin on sueldo_meta_periodo for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- Lo pagado no se toca: un período cuyo último día cae en un pago cerrado no se carga, cambia ni borra.
create or replace function private.sueldo_mp_no_en_cerrado() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare r record;
begin
  for r in select * from (values (case when tg_op <> 'INSERT' then old.empleado_id end, case when tg_op <> 'INSERT' then old.hasta end),
                                 (case when tg_op <> 'DELETE' then new.empleado_id end, case when tg_op <> 'DELETE' then new.hasta end)) v(emp, d)
           where emp is not null loop
    if private.sueldo_estado_fecha(r.emp, r.d)->>'estado' = 'cerrado' then
      raise exception 'PERIODO_CERRADO:el período que termina el % ya está en un pago cerrado; no se puede cambiar', to_char(r.d, 'DD/MM/YYYY');
    end if;
  end loop;
  if tg_op = 'UPDATE' then new.actualizado_en := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;
revoke execute on function private.sueldo_mp_no_en_cerrado() from public, anon;

drop trigger if exists trg_sueldo_mp_no_en_cerrado on sueldo_meta_periodo;
create trigger trg_sueldo_mp_no_en_cerrado before insert or update or delete on sueldo_meta_periodo
  for each row execute function private.sueldo_mp_no_en_cerrado();

drop trigger if exists trg_audit_sueldo_meta_periodo on sueldo_meta_periodo;
create trigger trg_audit_sueldo_meta_periodo after insert or update or delete on sueldo_meta_periodo
  for each row execute function private.audit_log_trigger();

-- ═══ sueldo_entrada — cuerpo de la 0168 con `metaPeriodoManual` ═══════════════════════════════
create or replace function public.sueldo_entrada(p_acuerdo uuid, p_desde date, p_hasta date, p_permitir_pendientes boolean default false)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  a          record;
  v_faltan   text;
  v_mixtos   text;
  v_horario  jsonb;
  v_asist    jsonb;
  v_fuera    jsonb;
  v_ventas   jsonb;
  v_meses    jsonb;
  v_par      jsonb;
  v_tard_dif int;
  v_pend     date[] := '{}';
  v_mix_f    date[];
  v_semanas  jsonb;   -- 0166: ventas y metas cargadas por semana
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede liquidar';
  end if;

  select * into a from sueldo_acuerdos where id = p_acuerdo;
  if not found then
    raise exception 'DATO:el acuerdo no existe o no es visible';
  end if;

  -- ── El rango pedido tiene que ser válido y caer DENTRO del acuerdo (C-2, spec §3) ───────────
  -- El trigger sueldo_liq_coherente (0072) ya lo comprobaría al insertar la liquidación, pero
  -- cortar acá, antes de armar todo el jsonb, da un mensaje mejor y más rápido — mismo criterio
  -- que ya usa esta función para sus otros cortes.
  if p_hasta < p_desde then
    raise exception 'DATO:el rango pedido no es válido: % es anterior a %', p_hasta, p_desde;
  end if;
  if p_desde < a.fecha_inicio or p_hasta > a.fecha_fin then
    raise exception 'DATO:el rango % a % se sale del acuerdo, que va de % a %',
      p_desde, p_hasta, a.fecha_inicio, a.fecha_fin;
  end if;

  if not exists (select 1 from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo) then
    raise exception 'DATO:el acuerdo no tiene horario cargado; sin horas contratadas no hay nada que liquidar';
  end if;

  -- ── El control que evita liquidar faltas inventadas ──────────────────────────────────────
  -- Todo día del RANGO PEDIDO (ya no del acuerdo completo: C-2) que caiga en un día con turno
  -- contratado tiene que tener su fila de asistencia DECLARADA. 'sin_dato' no cuenta: significa
  -- que nadie cargó nada, y mandarlo al motor con la hora en null lo convertiría en una falta de
  -- dos días de sueldo.
  select string_agg(to_char(d.dia, 'YYYY-MM-DD'), ', ' order by d.dia), array_agg(d.dia::date order by d.dia)
    into v_faltan, v_pend
  from generate_series(p_desde, p_hasta, interval '1 day') as d(dia)
  where exists (
          select 1 from sueldo_acuerdo_turnos t
          where t.acuerdo_id = p_acuerdo and t.dia_semana = extract(isodow from d.dia)
        )
    and not exists (
          select 1 from asistencias s
          where s.empleado_id = a.empleado_id
            and s.fecha = d.dia::date
            and s.condicion <> 'sin_dato'
        );

  -- 0160: en modo borrador (p_permitir_pendientes) no corta; los días quedan en v_pend y la
  -- asistencia que se manda al motor no los incluye. El cierre llama a la versión de 3 argumentos
  -- (estricta), así que nunca puede cerrar con días pendientes.
  v_pend := coalesce(v_pend, '{}');
  if v_faltan is not null and not p_permitir_pendientes then
    raise exception 'DATO:falta declarar la asistencia de %; ningún día contratado puede quedar sin cargar',
      v_faltan;
  end if;

  -- ── El control del día a medio declarar (0085) ───────────────────────────────────────────
  -- El de arriba mira si el día tiene ALGUNA fila declarada. Éste mira si le falta ALGUNA. Desde
  -- que el huellero escribe una fila por tramo, un día puede tener las dos cosas: la mañana
  -- emparejada y la tarde con la entrada puesta y la salida en null, esperando que alguien diga a
  -- qué hora se fue.
  --
  -- Sin este control ese día se armaba con un solo tramo y se liquidaba a medias sin avisar. Se
  -- corta acá, con el mismo prefijo `DATO:` que usa el resto, para que la pantalla lo muestre igual
  -- que a un día sin cargar y el administrador lo resuelva antes de pagar.
  --
  -- Se miran TODOS los días del RANGO PEDIDO con filas, contratados o no: un tramo trabajado fuera
  -- del horario pactado también se paga (RN-17), así que perderlo en silencio duele lo mismo.
  select string_agg(t.fecha_txt, ', ' order by t.fecha_txt), array_agg(t.fecha order by t.fecha)
    into v_mixtos, v_mix_f
  from (
    select s.fecha, to_char(s.fecha, 'YYYY-MM-DD') as fecha_txt
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between p_desde and p_hasta
    group by s.fecha
    having bool_or(s.condicion = 'sin_dato') and bool_or(s.condicion <> 'sin_dato')
  ) t;

  if v_mixtos is not null and not p_permitir_pendientes then
    raise exception 'DATO:hay tramos sin cerrar en %; ese día quedaría pagado a medias', v_mixtos;
  end if;

  if v_mixtos is not null then
    v_pend := v_pend || v_mix_f;
  end if;

  -- ── El horario contratado ────────────────────────────────────────────────────────────────
  -- No depende del tramo que se esté liquidando: sigue por acuerdo entero (C-2, "lo que NO cambia").
  select coalesce(jsonb_agg(jsonb_build_object(
           'diaSemana',  t.dia_semana,
           'horaInicio', to_char(t.hora_inicio, 'HH24:MI'),
           'horaFin',    to_char(t.hora_fin,    'HH24:MI')
         ) order by t.dia_semana, t.hora_inicio), '[]'::jsonb)
    into v_horario
  from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo;

  -- ── La asistencia, con los TRAMOS del día (RN-05, C-01) ─────────────────────────────
  -- El grano de la tabla es (empleado, fecha, turno) y cada fila con sus dos horas es un tramo
  -- continuo. Antes se colapsaban con min(entrada)/max(salida) y el hueco del medio se pagaba.
  --
  -- Acá NO se ordena, ni se fusiona, ni se aplica el umbral de pausa: eso vive entero en
  -- packages/core/src/sueldos.ts, en un solo lugar. Es la única forma de que un día cargado a mano
  -- por el administrador y un día derivado del huellero se paguen exactamente igual. Esta función
  -- entrega el dato crudo y nada más.
  --
  -- Se sigue emitiendo el par de punta a punta: la tardanza (RN-08) se mide contra el primer
  -- ingreso, y un snapshot guardado antes de esta migración tiene que seguir leyéndose igual.
  --
  -- Se separan los días CON turno contratado (asistencia) de los que no lo tienen
  -- (horasFueraDeContrato, RN-17): el motor los cobra distinto.
  with dias as (
    select
      s.fecha,
      min(s.hora_entrada)                                as entrada,
      max(s.hora_salida)                                 as salida,
      bool_or(s.condicion = 'falta')                     as es_falta,
      bool_or(s.tardanza_justificada)                    as tardanza_just,
      -- 0168: hora de inicio acordada ese día (cualquier tramo que la traiga vale para el día).
      max(s.inicio_acordado)                             as inicio_acordado,
      bool_or(s.falta_justificada)                       as falta_just,
      max(s.motivo_justificacion)                        as motivo,
      -- Migración 0098: si CUALQUIER tramo del día tiene la entrada o la salida puesta por el
      -- sistema (0096/0097), el día entero sale marcado — un día con dos tramos donde sólo uno
      -- está estimado no puede salir "limpio" sólo porque el otro tramo sí tiene marca real.
      bool_or(s.entrada_estimada)                        as entrada_estimada,
      bool_or(s.salida_estimada)                         as salida_estimada,
      -- Un tramo por fila. El `filter` deja fuera las filas sin ninguna de las dos horas: eso no
      -- es un tramo, es una declaración de falta o una fila que alguien creó y no completó.
      coalesce(jsonb_agg(jsonb_build_object(
        'ingreso', to_char(s.hora_entrada, 'HH24:MI'),
        'salida',  to_char(s.hora_salida,  'HH24:MI')
      ) order by s.hora_entrada nulls last, s.turno)
      filter (where s.hora_entrada is not null or s.hora_salida is not null), '[]'::jsonb) as tramos,
      exists (
        select 1 from sueldo_acuerdo_turnos t
        where t.acuerdo_id = p_acuerdo and t.dia_semana = extract(isodow from s.fecha)
      )                                                  as contratado
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between p_desde and p_hasta
      and s.condicion <> 'sin_dato'
      and not (s.fecha = any(v_pend))
    group by s.fecha
  ),
  filas as (
    select contratado, jsonb_build_object(
      'fecha',      to_char(fecha, 'YYYY-MM-DD'),
      -- Una falta se DECLARA con el ingreso en null. Si la condición dice 'falta', se manda null
      -- aunque haya quedado una hora suelta de una carga anterior.
      'horaIngreso', case when es_falta then null else to_char(entrada, 'HH24:MI') end,
      'horaSalida',  case when es_falta then null else to_char(salida,  'HH24:MI') end,
      -- Los tramos de un día declarado 'falta' no se emiten: una falta se declara con el ingreso
      -- en null, y mandar tramos además sería contradecirla con el dato de una carga anterior.
      'tramos',      case when es_falta then '[]'::jsonb else tramos end,
      'tardanzaJustificada', tardanza_just,
      'faltaJustificada',    falta_just,
      'motivoJustificacion', motivo,
      -- Migración 0098: mismo tratamiento que horaIngreso/horaSalida para un día 'falta' — la
      -- declaró una persona, así que no hay ninguna hora "estimada" que nombrar ese día.
      'entradaEstimada', case when es_falta then false else entrada_estimada end,
      'salidaEstimada',  case when es_falta then false else salida_estimada end
    -- 0168: la clave `inicioAcordado` SOLO sale en los días que la tienen. Así un borrador guardado antes
    -- de esta migración no queda «desactualizado» al cerrar (0111 compara la entrada entera).
    ) || case when inicio_acordado is not null
              then jsonb_build_object('inicioAcordado', to_char(inicio_acordado, 'HH24:MI'))
              else '{}'::jsonb end as fila, fecha
    from dias
  )
  select
    coalesce(jsonb_agg(fila order by fecha) filter (where contratado),     '[]'::jsonb),
    coalesce(jsonb_agg(fila order by fecha) filter (where not contratado), '[]'::jsonb)
    into v_asist, v_fuera
  from filas;

  -- ── Las ventas del RANGO PEDIDO que todavía no consumió ninguna liquidación ──────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha',    to_char(v.fecha, 'YYYY-MM-DD'),
           'monto',    v.monto,
           'tipo',     v.tipo,
           'tiendaId', v.sede_cod
         ) order by v.fecha), '[]'::jsonb)
    into v_ventas
  from sueldo_ventas v
  where v.empleado_id = a.empleado_id
    and v.fecha between p_desde and p_hasta
    and v.liquidacion_id is null;

  -- ── 0144: tardanzas de días de períodos cerrados que se trasladaron a este tramo ───────────
  select count(*)::int into v_tard_dif
  from sueldo_tardanzas_diferidas t
  where t.empleado_id = a.empleado_id
    and t.aplicada_en between p_desde and p_hasta;

  -- ── 0166: ventas y metas cargadas a mano por semana (decisión del dueño n.º 8) ─────────────
  -- Las semanas cuyo `desde` cae en el rango. Sólo viajan si hay alguna: sin carga manual el jsonb
  -- es el mismo de antes (regresión). Como el cierre compara esta función, cambiar una semana después
  -- del cálculo hace que el cierre responda DESACTUALIZADA.
  select jsonb_agg(jsonb_build_object(
           'desde',               to_char(w.desde, 'YYYY-MM-DD'),
           'hasta',               to_char(w.hasta, 'YYYY-MM-DD'),
           'totalBoletasMayores', w.total_boletas_mayores,
           'metaCumplida',        w.meta_cumplida,
           'montoVendido',        w.monto_vendido
         ) order by w.desde)
    into v_semanas
  from sueldo_ventas_semana w
  where w.empleado_id = a.empleado_id
    and w.desde between p_desde and p_hasta;

  -- ── Los puntos de los MESES DEL CONTRATO que cierran en el tramo (0126, spec §8.2) ─────────
  -- Un mes del contrato va del día de inicio al día anterior al mismo día del mes siguiente. Se
  -- calcula SIEMPRE desde fecha_inicio (ws_k = fecha_inicio + k meses): Postgres recorta a fin de
  -- mes (31-ene + 1 mes = 28-feb) y encadenar mes a mes derivaría el día. El mes k termina en
  -- we_k = ws_(k+1) − 1 y su último día efectivo es e_k = least(we_k, fin del contrato). Se paga,
  -- completo, en el tramo que contiene e_k; los demás tramos reciben `[]`.
  --
  -- «Activo» se decide con los parámetros EFECTIVOS DEL CONTRATO (los mismos que viajan en
  -- `parametros`): las dos claves numéricas. Un `null` del contrato (JSON null) gana a la
  -- configuración y apaga el pago aunque /configuracion esté encendida (§8.1). Apagado viaja
  -- `null`: la liquidación de hoy no depende de la evaluación y la clave no cambia entre cálculos.
  --
  -- Los puntos de cada mes son `puntosTotal` de evaluacion_componentes_datos, a través de
  -- private.sueldo_puntos_periodo (el wrapper exige administrador). Una sola definición de «puntos».
  v_par := private.sueldo_parametros_config() || a.parametros;
  if jsonb_typeof(v_par -> 'puntosMetaMensual') = 'number'
     and jsonb_typeof(v_par -> 'solesPorPunto') = 'number' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'desde',    to_char(m.ws, 'YYYY-MM-DD'),
             'hasta',    to_char(m.e,  'YYYY-MM-DD'),
             'hastaMes', to_char(m.we, 'YYYY-MM-DD'),
             'puntos',   private.sueldo_puntos_periodo(a.empleado_id, m.ws, m.e)
           ) order by m.ws), '[]'::jsonb)
      into v_meses
    from (
      select k.ws, k.we, least(k.we, a.fecha_fin) as e
      from (
        select (a.fecha_inicio + make_interval(months => g.k))::date as ws,
               (a.fecha_inicio + make_interval(months => g.k + 1))::date - 1 as we
        from generate_series(
               0,
               (extract(year from a.fecha_fin)::int - extract(year from a.fecha_inicio)::int) * 12
                 + (extract(month from a.fecha_fin)::int - extract(month from a.fecha_inicio)::int) + 1
             ) as g(k)
      ) k
      where k.ws <= a.fecha_fin
    ) m
    where m.e between p_desde and p_hasta;
  end if;

  -- Los nulls NO se quitan: `horaIngreso: null` ES la declaración de una falta (sueldos.ts:569
  -- lee `== null`), y quien abra este snapshot dentro de un año tiene que verlo.
  return case when v_semanas is null then '{}'::jsonb
              else jsonb_build_object('ventasSemanales', v_semanas) end
  -- 0169: la meta del período que puso el administrador. La clave SOLO sale si hay fila: así un borrador
  -- guardado antes de esta migración no queda «desactualizado» al cerrar (0111 compara la entrada entera).
  -- Marca de regla: un borrador guardado antes de esta migración no la trae, y el cierre (0111) lo marca
  -- «desactualizado» en vez de cerrarlo con la meta vieja.
  || jsonb_build_object('reglaMetaPeriodo', 2)
  || coalesce((select jsonb_build_object('metaPeriodoManual', m.meta) from sueldo_meta_periodo m
                where m.empleado_id = a.empleado_id and m.desde = p_desde and m.hasta = p_hasta), '{}'::jsonb)
  || jsonb_build_object(
    'acuerdoId',     a.id,
    'empleadoId',    a.empleado_id,
    -- Antes eran a.fecha_inicio/a.fecha_fin (el acuerdo completo). Ahora son el TRAMO pedido: es
    -- lo que packages/core/src/sueldos.ts usa para diasDelPeriodo()/horasContratadas(), así que
    -- este es el cambio que hace que valorPorHora se calcule contra las horas del tramo, no las
    -- de todo el contrato (spec §2).
    'fechaInicio',   to_char(p_desde, 'YYYY-MM-DD'),
    'fechaFin',      to_char(p_hasta, 'YYYY-MM-DD'),
    'modalidad',     a.modalidad,
    'sueldoPactado', a.sueldo_pactado,
    'horario',       v_horario,
    'asistencia',    v_asist,
    'horasFueraDeContrato', v_fuera,
    'ventas',        v_ventas,
    'tardanzasDiferidas', v_tard_dif,
    'almuerzoHabilitadoPorAdmin', a.almuerzo_habilitado,
    -- Los tres tipos de PLATA van como lista; los dos de CONTEO van como número. Es la distinción
    -- que la 0072 hizo excluyente con sueldo_mov_unidad_chk. Los cinco, ahora acotados al TRAMO
    -- pedido (p_desde..p_hasta) y no al acuerdo completo: si no, liquidar julio y agosto por
    -- separado contaría el mismo adelanto, la misma venta consumida o el mismo almuerzo dos veces.
    'adelantos',    private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'adelanto'),
    'reportes',     private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'reporte'),
    'bonosExtras',  private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'bono_extra'),
    'almuerzosEntregados', private.sueldo_movimientos_conteo(a.empleado_id, p_desde, p_hasta, 'almuerzo_entregado'),
    'personasCapacitadas', private.sueldo_movimientos_conteo(a.empleado_id, p_desde, p_hasta, 'capacitacion'),
    -- 0126: puntos de cada mes del contrato que cierra en este tramo, para el «Bono por puntos».
    -- Reemplaza a `puntosPeriodo` (0117). Viaja dentro de la entrada guardada de la liquidación,
    -- así el cierre que compara «datos actuales» también ve si cambiaron.
    'puntosMeses',  v_meses,
    -- Precedencia de la spec §5: default del core ← config global ← override del contrato.
    'parametros',   private.sueldo_parametros_config() || a.parametros
  ) || case when cardinality(v_pend) > 0
            then jsonb_build_object('diasSinDeclarar',
                   (select jsonb_agg(to_char(x, 'YYYY-MM-DD') order by x) from (select distinct unnest(v_pend) as x) u))
            else '{}'::jsonb end;
end;

$function$;

-- ===== 0170_renovar_contrato.sql =====
-- 0170_renovar_contrato.sql — «Renovar» un contrato: borrador copiado que se activa solo.
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-renovar-contrato-design.md (decisión del dueño n.º 3, 19-oct-2026).
-- Prueba: packages/db/pruebas/0170_renovar_contrato.prueba.sql.   ZONA CRÍTICA (verificador antes de mergear).
--
-- No toca la cadena del sueldo ni ninguna función existente: una columna, dos funciones nuevas y un cron.
-- Defaults inventados (anotados en docs/pendientes-negocio.md): el contrato nuevo dura los mismos meses
-- (si el actual es de meses completos) o los mismos días; la renovación espera a que el anterior deje de estar
-- vigente. Idempotente.

alter table sueldo_acuerdos add column if not exists renueva_a uuid references sueldo_acuerdos(id) on delete set null;

comment on column sueldo_acuerdos.renueva_a is
  'De qué contrato viene esta renovación (0170). Solo un borrador con este dato se activa solo; uno sin él, nunca.';

create index if not exists idx_sueldo_acuerdos_renueva_a on sueldo_acuerdos(renueva_a) where renueva_a is not null;

-- ═══ Renovar: crea el borrador copiando el contrato ═════════════════════════════════════════════
create or replace function sueldo_acuerdo_renovar(p_acuerdo uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  a        sueldo_acuerdos%rowtype;
  v_ini    date;
  v_fin    date;
  v_meses  int;
  v_nuevo  uuid;
  c        sueldo_acuerdo_cambios%rowtype;
  v_mod    text;
  v_cada   int;
  v_cuota  numeric;
  v_tarifa numeric;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede renovar un contrato';
  end if;

  select * into a from sueldo_acuerdos where id = p_acuerdo for update;
  if not found then
    raise exception 'DATO:ese contrato no existe';
  end if;
  if a.estado = 'borrador' then
    raise exception 'ESTADO:un contrato en borrador no se renueva; actívalo primero';
  end if;
  if exists (select 1 from sueldo_acuerdos n where n.empleado_id = a.empleado_id and n.fecha_inicio > a.fecha_fin) then
    raise exception 'ESTADO:este contrato ya tiene uno que lo sigue; edita ese';
  end if;

  -- Frecuencia y cuota o tarifa VIGENTES al final del contrato (0120/0121): la última fila de cambios con
  -- desde <= fecha_fin; sin cambios, las del contrato. Una tarifa nula en el cambio sigue la anterior.
  select * into c from sueldo_acuerdo_cambios where acuerdo_id = a.id and desde <= a.fecha_fin order by desde desc limit 1;
  v_mod    := coalesce(c.modalidad, a.modalidad);
  v_cada   := case when c.id is not null then c.cada_dias else a.cada_dias end;
  v_tarifa := case when c.id is not null then coalesce(c.tarifa_hora, a.tarifa_hora) else a.tarifa_hora end;
  v_cuota  := case when v_tarifa is not null then 0 when c.id is not null then c.sueldo_pactado else a.sueldo_pactado end;

  v_ini := a.fecha_fin + 1;
  -- Meses completos (1-oct a 31-oct → 1 mes): el nuevo dura lo mismo. Si no, los mismos días.
  v_meses := (extract(year from age(a.fecha_fin + 1, a.fecha_inicio)) * 12
              + extract(month from age(a.fecha_fin + 1, a.fecha_inicio)))::int;
  if v_meses >= 1 and (a.fecha_inicio + make_interval(months => v_meses))::date = a.fecha_fin + 1 then
    v_fin := (v_ini + make_interval(months => v_meses))::date - 1;
  else
    v_fin := v_ini + (a.fecha_fin - a.fecha_inicio);
  end if;

  -- Reutiliza la 0167/0149: mismo contrato + horario atómicos y mismas validaciones.
  v_nuevo := sueldo_acuerdo_guardar(
    null,
    jsonb_build_object(
      'empleado_id',         a.empleado_id,
      'fecha_inicio',        v_ini,
      'fecha_fin',           v_fin,
      'modalidad',           v_mod,
      'cada_dias',           v_cada,
      'sueldo_pactado',      v_cuota,
      'tarifa_hora',         v_tarifa,
      'escala',              a.escala,
      'almuerzo_habilitado', a.almuerzo_habilitado,
      'parametros',          a.parametros,
      'creado_por',          auth.uid()
    ),
    coalesce((select jsonb_agg(jsonb_build_object(
                'dia_semana',  t.dia_semana,
                'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
                'hora_fin',    to_char(t.hora_fin, 'HH24:MI'),
                'lugar',       t.lugar) order by t.dia_semana, t.hora_inicio)
              from sueldo_acuerdo_turnos t where t.acuerdo_id = a.id), '[]'::jsonb)
  );

  update sueldo_acuerdos set renueva_a = a.id where id = v_nuevo;
  return v_nuevo;
end;
$fn$;

comment on function sueldo_acuerdo_renovar(uuid) is
  'Crea en borrador el contrato que sigue a p_acuerdo, copiando frecuencia, cuota o tarifa, escala, almuerzo, parámetros y horario (0170). Solo admin.';
revoke execute on function sueldo_acuerdo_renovar(uuid) from public, anon;
grant  execute on function sueldo_acuerdo_renovar(uuid) to authenticated;

-- ═══ Activar: el borrador renovado pasa a vigente cuando llega su día ═══════════════════════════
-- Corre por cron (sin sesión). Solo activa si la persona NO tiene otro contrato vigente: nunca dos.
create or replace function sueldo_renovaciones_activar(p_hoy date default null)
  returns int
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Lima')::date);
  r     record;
  v_n   int := 0;
begin
  for r in
    select n.id, n.empleado_id
    from sueldo_acuerdos n
    where n.estado = 'borrador' and n.renueva_a is not null and n.fecha_inicio <= v_hoy
    order by n.fecha_inicio
  loop
    if not exists (select 1 from sueldo_acuerdos o where o.empleado_id = r.empleado_id and o.id <> r.id and o.estado = 'vigente') then
      update sueldo_acuerdos set estado = 'vigente' where id = r.id and estado = 'borrador';
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$fn$;

comment on function sueldo_renovaciones_activar(date) is
  'Pasa a vigente los borradores renovados cuyo inicio ya llegó, solo si la persona no tiene otro vigente (0170). Lo llama el cron; hora Perú.';
revoke execute on function sueldo_renovaciones_activar(date) from public, anon, authenticated;
grant  execute on function sueldo_renovaciones_activar(date) to service_role;

-- Cron diario 00:10 hora Perú (05:10 UTC). Solo si la base tiene pg_cron (en local no).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sueldo-renovaciones-activar', '10 5 * * *', 'select sueldo_renovaciones_activar();');
  end if;
end $$;

commit;
