-- 0117_pago_por_puntos.sql — pago por puntos sobre la meta mensual (dos parámetros, vacíos).
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-05-pago-por-puntos-design.md §3 (ticket
-- imalexandre05/lucebien-tablero#10). Plan: docs/superpowers/plans/2026-10-05-pago-por-puntos.md.
-- ZONA CRÍTICA (cadena del sueldo, no-negociable 1): no se aplica a ninguna base sin la revisión
-- del verificador y la aprobación de Alexander.
--
-- QUÉ HACE
--   1) Dos claves nuevas en `config`, VACÍAS: `sueldo_puntos_meta_mensual` y `sueldo_soles_por_punto`.
--      Vacío = desactivado: con cualquiera de las dos vacía el motor no paga nada por puntos y la
--      liquidación no muestra la línea. La meta la fija el dueño después de un mes de uso, mirando
--      el promedio real (decisión del 05-oct-2026): no se inventa ningún número (no-negociable 5).
--   2) `private.sueldo_parametros_config()` — las lee y las entrega como `puntosMetaMensual` y
--      `solesPorPunto`. Cuerpo de la 0078 sin otro cambio que dos líneas en el mapa.
--   3) `private.sueldo_puntos_periodo(empleado, desde, hasta)` — wrapper de
--      `evaluacion_componentes_datos(...)->>'puntosTotal'`. HACE FALTA porque la 0067 le quitó
--      el EXECUTE a `authenticated` a esa función (nadie ve la nota de otro, no-negociable 3) y
--      `sueldo_entrada` corre como quien la llama. El wrapper es SECURITY DEFINER pero exige
--      `private.app_es_admin()` adentro: un no-admin recibe PERMISO, igual que en `sueldo_entrada`.
--   4) `public.sueldo_entrada(uuid,date,date)` — cuerpo de la 0098 sin otro cambio que la clave
--      `puntosPeriodo` en la entrada (los puntos del MISMO rango que se liquida; `null` mientras
--      el pago por puntos esté apagado).

-- ORDEN DE DESPLIEGUE (no-negociable 4): aplicar la 0110 (hora Perú de los puntos, PR #45) ANTES de
-- ENCENDER el pago. Con la 0117 sola los puntos se cuentan por día UTC y los ganados entre las
-- 19:00 y las 23:59 de Perú del último día del tramo caerían en el tramo siguiente. Apagado no
-- importa: nada se paga por puntos.
--
-- QUÉ NO HACE
--   · No amplía `sueldo_acuerdos_parametros_chk`: pactar estos dos valores por contrato lo resuelve
--     el ticket #20 (congelar parámetros al crear el contrato). Mientras tanto se leen como los
--     demás, desde `/configuracion`.
--   · No toca `evaluacion_componentes_datos` (la 0110 del PR #45 la cambia a hora Perú; esta
--     migración sólo la llama, así que toma esa corrección cuando entre, en cualquier orden).
--   · No toca `sueldo_liquidacion_cerrar` (PR #44, 0111). Como `puntosPeriodo` viaja dentro de la
--     entrada, la comparación «datos actuales» de ese cierre también detecta un cambio de puntos.
--
-- Idempotente: los insert llevan `on conflict do nothing`; las funciones son `create or replace`
-- (conservan el ACL ya puesto; los revoke/grant se repiten sin fallar).
--
-- Prueba: packages/db/pruebas/0117_pago_por_puntos.prueba.sql

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Las dos claves, vacías
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('sueldo_puntos_meta_mensual', ''),
  ('sueldo_soles_por_punto',     '')
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) La lectura de los parámetros globales — dos líneas más en el mapa (cuerpo de la 0078)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.sueldo_parametros_config()
  returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  r      record;
  v_txt  text;
  salida jsonb := '{}'::jsonb;
  -- clave de config → clave camelCase de ParametrosSueldo
  mapa constant jsonb := jsonb_build_object(
    'sueldo_tolerancia_minutos',         'toleranciaMinutos',
    'sueldo_tardanzas_libres',           'tardanzasLibres',
    'sueldo_penalidad_tardanza',         'penalidadTardanza',
    'sueldo_valor_almuerzo',             'valorAlmuerzo',
    'sueldo_horas_minimas_almuerzo',     'horasMinimasAlmuerzo',
    'sueldo_valor_capacitacion',         'valorCapacitacion',
    'sueldo_bono_meta_semanal',          'bonoMetaSemanal',
    'sueldo_factor_meta',                'factorMeta',
    'sueldo_pct_comision',               'pctComision',
    'sueldo_monto_minimo_comision',      'montoMinimoComision',
    'sueldo_dias_descuento_por_falta',   'diasDescuentoPorFalta',
    'sueldo_meta_por_hora',              'metaPorHora',
    'sueldo_factor_hora_fuera_contrato', 'factorHoraFueraContrato',
    'sueldo_pausa_minima_minutos',       'pausaMinimaMinutos',
    -- 0117: pago por puntos. Vacías por defecto = desactivado (en blanco cae al default del core,
    -- que es null). Las dos tienen que estar definidas para que se pague algo.
    'sueldo_puntos_meta_mensual',        'puntosMetaMensual',
    'sueldo_soles_por_punto',            'solesPorPunto'
  );
begin
  for r in
    select c.clave, trim(coalesce(c.valor, '')) as valor
    from config c
    where mapa ? c.clave
  loop
    continue when r.valor = '';   -- en blanco = "no configurado" = default del core

    if r.valor !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'CONFIG:el parámetro "%" tiene que ser un número y dice "%"', r.clave, r.valor;
    end if;

    salida := salida || jsonb_build_object(mapa ->> r.clave, r.valor::numeric);
  end loop;

  -- El booleano, aparte: 'false' es false y CUALQUIER otro texto es true, igual que el control de
  -- la UI. Un `to_jsonb(valor::boolean)` reventaría con 'si' o con '0'.
  select trim(coalesce(valor, '')) into v_txt from config where clave = 'sueldo_meta_semanal_fija';
  if coalesce(v_txt, '') <> '' then
    salida := salida || jsonb_build_object('metaSemanalFija', v_txt <> 'false');
  end if;

  return salida;
end;
$fn$;

revoke execute on function private.sueldo_parametros_config() from public, anon;
grant  execute on function private.sueldo_parametros_config() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Los puntos del período, sólo para el administrador
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.sueldo_puntos_periodo(p_empleado uuid, p_desde date, p_hasta date)
  returns numeric language plpgsql stable security definer set search_path = public as $fn$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede liquidar';
  end if;
  return (private.evaluacion_componentes_datos(p_empleado, p_desde, p_hasta) ->> 'puntosTotal')::numeric;
end;
$fn$;

revoke execute on function private.sueldo_puntos_periodo(uuid, date, date) from public, anon;
grant  execute on function private.sueldo_puntos_periodo(uuid, date, date) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) sueldo_entrada — cuerpo de la 0098 + `puntosPeriodo`
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.sueldo_entrada(p_acuerdo uuid, p_desde date, p_hasta date)
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
  v_puntos   numeric;
  v_cfg      jsonb;
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
  select string_agg(to_char(d.dia, 'YYYY-MM-DD'), ', ' order by d.dia)
    into v_faltan
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

  if v_faltan is not null then
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
  select string_agg(t.fecha_txt, ', ' order by t.fecha_txt)
    into v_mixtos
  from (
    select to_char(s.fecha, 'YYYY-MM-DD') as fecha_txt
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between p_desde and p_hasta
    group by s.fecha
    having bool_or(s.condicion = 'sin_dato') and bool_or(s.condicion <> 'sin_dato')
  ) t;

  if v_mixtos is not null then
    raise exception 'DATO:hay tramos sin cerrar en %; ese día quedaría pagado a medias', v_mixtos;
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

  -- ── Los puntos del RANGO PEDIDO (migración 0117, pago por puntos) ─────────────────────────
  -- Es el `puntosTotal` de evaluacion_componentes_datos para el mismo empleado y el mismo rango,
  -- a través de private.sueldo_puntos_periodo (esa función es sólo de servicio y el wrapper
  -- exige administrador). NO se recalcula la suma aquí: una sola definición de «puntos».
  --
  -- SÓLO si el pago está activo (las dos claves definidas). Apagado viaja `null`: así la liquidación
  -- de hoy no depende de la configuración de la evaluación (un eval_tardanza_min_por_punto en 0 la
  -- haría fallar) y la clave no cambia entre cálculos, con lo que el cierre del PR #44 no se
  -- rechaza por puntos que no pagan nada.
  v_cfg := private.sueldo_parametros_config();
  if v_cfg ? 'puntosMetaMensual' and v_cfg ? 'solesPorPunto' then
    v_puntos := private.sueldo_puntos_periodo(a.empleado_id, p_desde, p_hasta);
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
    -- 0117: puntos del período para el «Bono por puntos». Viaja dentro de la entrada guardada de la
    -- liquidación, así el cierre que compara «datos actuales» también ve si cambiaron.
    'puntosPeriodo', v_puntos,
    -- Precedencia de la spec §5: default del core ← config global ← override del contrato.
    'parametros',   private.sueldo_parametros_config() || a.parametros
  );
end;
$function$;

comment on function public.sueldo_entrada(uuid, date, date) is
  'Arma la EntradaLiquidacion de packages/core/src/sueldos.ts para el TRAMO p_desde..p_hasta de un
   acuerdo (no necesariamente el acuerdo completo: 2026-08-24-liquidacion-por-tramos-design.md).
   Corta nombrando las fechas si algún día contratado quedó sin declarar, y corta también si el
   rango pedido se sale de los bordes del acuerdo o si p_hasta es anterior a p_desde. Desde la
   0098, cada día de asistencia/horasFueraDeContrato lleva además entradaEstimada/salidaEstimada
   (bool_or por fecha): true cuando la hora la propuso el sistema con el horario contratado
   (0096/0097) y no salió de una marca ni de una carga a mano. Desde la 0117 trae además
   `puntosPeriodo`: los puntos del mismo rango (evaluacion_componentes_datos, vía
   private.sueldo_puntos_periodo) para el «Bono por puntos» del motor.';
