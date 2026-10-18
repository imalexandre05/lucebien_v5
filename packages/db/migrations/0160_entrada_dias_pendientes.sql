-- 0160_entrada_dias_pendientes.sql — la entrada de liquidación puede armarse como borrador aunque
-- falten días por declarar.
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-18-liquidacion-borrador-dias-pendientes-design.md
-- Prueba: packages/db/pruebas/0160_entrada_dias_pendientes.prueba.sql   ZONA CRÍTICA (verificador antes de mergear).
--
-- Cuerpo EXACTO de public.sueldo_entrada de la 0144, con un cuarto argumento `p_permitir_pendientes`:
--   * false (el default, también cuando se llama con 3 argumentos): igual que hoy; corta con DATO. El
--     cierre (0111) la llama así, por lo que NUNCA puede cerrar una liquidación con días sin declarar.
--   * true: no corta; los días sin declarar y los de tramos a medias salen en `diasSinDeclarar` y
--     NO entran a `asistencia` (un día a medias no se paga a medias). La clave solo aparece si hay
--     pendientes: la entrada estricta no cambia ni un byte.
-- Idempotente.

-- La firma de 3 argumentos (0144) se reemplaza por la de 4 con default: una sola versión.
drop function if exists public.sueldo_entrada(uuid, date, date);

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
    ) as fila, fecha
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
  return jsonb_build_object(
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

-- Una sola firma (la 0127 prohíbe sobrecargas): las llamadas con 3 argumentos siguen siendo estrictas (default false).
revoke execute on function public.sueldo_entrada(uuid, date, date, boolean) from public, anon;
grant  execute on function public.sueldo_entrada(uuid, date, date, boolean) to authenticated;

comment on function public.sueldo_entrada(uuid, date, date, boolean) is
  '0160: entrada de liquidación de un tramo. Con p_permitir_pendientes=true arma un borrador y lista los días sin declarar en diasSinDeclarar; con false corta con DATO como siempre.';
