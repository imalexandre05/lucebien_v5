-- 0093_liquidacion_por_tramos.sql — un acuerdo largo se liquida en varios tramos, no de una vez
--
-- Implementa docs/superpowers/specs/sueldos/2026-08-24-liquidacion-por-tramos-design.md §3,
-- C-1 y C-2. Decisión de negocio del §2 CONFIRMADA por Alexander el 24-ago-2026: `sueldo_pactado`
-- es la cuota de CADA liquidación (mensual o semanal, según `modalidad`), no el total del
-- contrato — ver el bloque "✅ CONFIRMADO" al final de esa sección.
--
-- QUÉ CAMBIA:
--   1) El índice que dejaba UNA sola liquidación viva por acuerdo se cambia por una restricción de
--      exclusión que sólo bloquea el SOLAPE de fechas: varios tramos del mismo acuerdo conviven.
--   2) `sueldo_entrada` deja de derivar el rango a liquidar de `fecha_inicio`/`fecha_fin` del
--      acuerdo: lo recibe como parámetro (`p_desde`/`p_hasta`), igual que ya hace
--      `evaluacion_componentes(p_empleado, p_desde, p_hasta)`.
--   3) (C-7, addendum F-2 de la revisión adversarial del 24-ago) `sueldo_liquidacion_cerrar` deja
--      de marcar el ACUERDO COMPLETO como 'liquidado' al cerrar cualquier tramo: sólo lo hace
--      cuando el tramo que se cierra llega hasta `fecha_fin` del acuerdo.
--
-- `packages/core/src/sueldos.ts` NO CAMBIA (spec §1, verificado antes de escribir esta migración):
-- `liquidarPeriodo()` ya recibe `fechaInicio`/`fechaFin` como parte de la entrada y nunca los
-- derivó del acuerdo — el core ni siquiera conoce la tabla `sueldo_acuerdos`. Lo mismo la columna
-- `sueldo_liquidaciones.periodo_desde`/`periodo_hasta` (separada de las del acuerdo desde la 0072)
-- y el trigger `sueldo_liq_coherente` (ya tolera un sub-rango, sólo rechaza que se salga de los
-- bordes del acuerdo). Ambos permanecen intactos.
--
-- Idempotente: se puede reaplicar sin fallar. El índice viejo se borra con `if exists`, la
-- restricción de exclusión nueva va envuelta en un `do $$ ... $$` que consulta `pg_constraint`,
-- `sueldo_entrada` es `create or replace function` sobre una firma nueva (además se hace `drop` de
-- la firma vieja de un solo parámetro: no hay ningún otro llamador que la necesite, así que no
-- queda un segundo overload muerto colgando del esquema), y `sueldo_liquidacion_cerrar` (C-7) es
-- `create or replace function` sobre la misma firma de siempre — no hace falta `drop` ni tocar
-- permisos.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5). Esta migración no agrega ninguno nuevo.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- C-1 — de "una liquidación viva por acuerdo" a "varias, mientras no se pisen"
--
--    El índice único parcial (`0072_sueldos_esquema.sql:370-371`) bloqueaba una segunda
--    liquidación viva SIN MIRAR FECHAS: daba lo mismo si el segundo tramo pisaba al primero o no,
--    ninguno de los dos entraba. La restricción de exclusión de abajo es el mismo patrón que ya
--    usa `sueldo_acuerdos_sin_solape` (0072:117-126) para los acuerdos entre sí — btree_gist ya
--    está habilitada desde esa misma migración, no hace falta volver a crearla.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop index if exists uq_sueldo_liq_acuerdo_vigente;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sueldo_liq_periodo_sin_solape') then
    alter table sueldo_liquidaciones add constraint sueldo_liq_periodo_sin_solape
      exclude using gist (
        acuerdo_id with =,
        daterange(periodo_desde, periodo_hasta, '[]') with &&
      ) where (estado <> 'anulada');
  end if;
end $$;

comment on constraint sueldo_liq_periodo_sin_solape on sueldo_liquidaciones is
  'Dos liquidaciones NO anuladas del mismo acuerdo no pueden compartir un día de calendario. Un
   acuerdo puede tener varias liquidaciones vivas (un tramo por mes o por semana, spec
   2026-08-24-liquidacion-por-tramos-design.md), siempre que sus períodos no se pisen. El choque lo
   resuelve la base, no la pantalla — mismo criterio que sueldo_acuerdos_sin_solape.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- C-2 — sueldo_entrada acepta el rango como parámetro, igual que evaluacion_componentes
--
--    Firma nueva: (p_acuerdo uuid, p_desde date, p_hasta date). Sin default: verificado que hoy no
--    hay ningún otro llamador de esta RPC además de apps/erp-web/lib/sueldos-repo.ts, así que no
--    hay nada que mantener retrocompatible con la firma de un solo parámetro.
--
--    Reemplaza la versión vigente de 0085_sueldo_entrada_dia_mixto.sql. Lo que NO cambia respecto
--    de esa versión: el guard de permiso, el chequeo de acuerdo inexistente, el chequeo de horario
--    sin cargar, el control de "día sin declarar" y el de "día a medio declarar" (0085) en su
--    LÓGICA — sólo el RANGO que recorren pasa de ser el del acuerdo completo a ser el pedido. Y
--    tampoco cambia lo que consulta sueldo_acuerdo_turnos por día de la semana (el horario
--    contratado no depende de qué tramo se esté liquidando), ni a.modalidad/a.sueldo_pactado en la
--    salida: a.sueldo_pactado sigue siendo la cuota, se manda tal cual — es el motor
--    (packages/core/src/sueldos.ts), no esta función, quien la divide entre las horas del tramo.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop function if exists public.sueldo_entrada(uuid);

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
      'motivoJustificacion', motivo
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
    -- Precedencia de la spec §5: default del core ← config global ← override del contrato.
    'parametros',   private.sueldo_parametros_config() || a.parametros
  );
end;
$function$;

revoke execute on function public.sueldo_entrada(uuid, date, date) from public, anon;
grant  execute on function public.sueldo_entrada(uuid, date, date) to authenticated;

comment on function public.sueldo_entrada(uuid, date, date) is
  'Arma la EntradaLiquidacion de packages/core/src/sueldos.ts para el TRAMO p_desde..p_hasta de un
   acuerdo (no necesariamente el acuerdo completo: 2026-08-24-liquidacion-por-tramos-design.md).
   Corta nombrando las fechas si algún día contratado quedó sin declarar, y corta también si el
   rango pedido se sale de los bordes del acuerdo o si p_hasta es anterior a p_desde.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- C-7 (addendum F-2, revisión adversarial 24-ago-2026) — sueldo_liquidacion_cerrar YA NO marca el
-- ACUERDO COMPLETO como liquidado al cerrar CUALQUIER tramo
--
--    La spec original (§4, "Lo que esta spec NO hace") decía que esta función no necesitaba
--    cambios porque "ya opera por fila y por el período de la propia liquidación, no del acuerdo".
--    Cierto para el congelado y el sellado de movimientos/ventas — falso para esta única línea,
--    verificada en 0073_sueldos_rpc.sql:397: `update sueldo_acuerdos set estado = 'liquidado'
--    where id = l.acuerdo_id;`, sin condición de ningún tipo. Cerrar julio de un acuerdo de tres
--    meses marcaba el acuerdo ENTERO como 'liquidado', y `sueldo_acuerdos.estado <> 'liquidado'`
--    es el filtro que usa /sueldos/asistencia para decidir qué contratos muestra: el contrato
--    desaparecía de "Declarar asistencia" y agosto quedaba sin forma de cargarse — el acuerdo
--    inoperable después del primer tramo, lo opuesto de lo que pide esta spec.
--
--    Mismo cuerpo que la versión vigente (0073_sueldos_rpc.sql), UN SOLO cambio: el `update` sobre
--    `sueldo_acuerdos` sólo marca 'liquidado' cuando el tramo que se cierra LLEGA hasta el final
--    real del acuerdo. La firma no cambia (sigue siendo `(uuid)`): `create or replace function`
--    conserva los `revoke`/`grant` que ya tiene (0073_sueldos_rpc.sql:406-407), no hace falta
--    repetirlos.
--
--    `sueldo_liquidacion_anular` NO se toca: revertir a 'vigente' en cualquier anulación es la
--    dirección segura (reabrir de más nunca bloquea un pago, sólo lo deja editable antes de lo
--    estrictamente necesario).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function sueldo_liquidacion_cerrar(p_liquidacion uuid)
  returns jsonb language plpgsql volatile security invoker set search_path = public as $fn$
declare
  l           record;
  v_lineas    int;
  v_mov       int;   -- adelantos + reportes + bonos, que van como lista
  v_alm       int;   -- almuerzos entregados, que van como CONTEO
  v_cap       int;   -- personas capacitadas, ídem
  v_ven       int;
  v_esp_mov   int;
  v_esp_ven   int;
  v_sellados  int;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede cerrar una liquidación';
  end if;

  select * into l from sueldo_liquidaciones where id = p_liquidacion for update;
  if not found then
    raise exception 'DATO:la liquidación no existe o no es visible';
  end if;
  if l.estado <> 'borrador' then
    raise exception 'ESTADO:esta liquidación ya está %; sólo se cierra un borrador', l.estado;
  end if;
  if jsonb_typeof(l.resultado -> 'lineas') <> 'array' then
    raise exception 'DATO:el resultado guardado no tiene el desglose de líneas';
  end if;

  -- ── La carrera ───────────────────────────────────────────────────────────────────────────
  -- MovimientoAdmin no lleva id (sueldos.ts:180-184), así que el sellado va por rango: el mismo
  -- criterio con el que sueldo_entrada() los juntó. Si alguien cargó un adelanto entre el cálculo
  -- y el cierre, esa fila quedaría sellada SIN ESTAR en el snapshot que se paga. Se recuenta
  -- contra la entrada guardada y se corta si no coincide.
  v_esp_mov := jsonb_array_length(coalesce(l.entrada -> 'adelantos',   '[]'::jsonb))
             + jsonb_array_length(coalesce(l.entrada -> 'reportes',    '[]'::jsonb))
             + jsonb_array_length(coalesce(l.entrada -> 'bonosExtras', '[]'::jsonb));
  v_esp_ven := jsonb_array_length(coalesce(l.entrada -> 'ventas', '[]'::jsonb));

  select count(*) into v_mov from sueldo_movimientos m
  where m.empleado_id = l.empleado_id
    and m.fecha between l.periodo_desde and l.periodo_hasta
    and m.tipo in ('adelanto', 'reporte', 'bono_extra')
    and m.liquidacion_id is null;

  -- Los dos tipos de CONTEO se comparan por suma de cantidad, no por cantidad de filas: así es
  -- como el motor los recibió. Sin esto quedaba un agujero de la misma familia que el de arriba —
  -- el sellado toca los CINCO tipos, así que un almuerzo cargado entre el cálculo y el cierre se
  -- sellaba sin estar en el snapshot y sin que nada avisara.
  v_alm := private.sueldo_movimientos_conteo(l.empleado_id, l.periodo_desde, l.periodo_hasta, 'almuerzo_entregado');
  v_cap := private.sueldo_movimientos_conteo(l.empleado_id, l.periodo_desde, l.periodo_hasta, 'capacitacion');

  select count(*) into v_ven from sueldo_ventas v
  where v.empleado_id = l.empleado_id
    and v.fecha between l.periodo_desde and l.periodo_hasta
    and v.liquidacion_id is null;

  if v_mov <> v_esp_mov
     or v_ven <> v_esp_ven
     or v_alm <> coalesce((l.entrada ->> 'almuerzosEntregados')::int, 0)
     or v_cap <> coalesce((l.entrada ->> 'personasCapacitadas')::int, 0)
  then
    raise exception 'DESACTUALIZADA:los datos cambiaron desde que se calculó (movimientos % contra %, ventas % contra %, almuerzos % contra %, capacitaciones % contra %); volvé a calcular antes de cerrar',
      v_mov, v_esp_mov, v_ven, v_esp_ven,
      v_alm, coalesce((l.entrada ->> 'almuerzosEntregados')::int, 0),
      v_cap, coalesce((l.entrada ->> 'personasCapacitadas')::int, 0);
  end if;

  -- ── 1) Las líneas, desde el resultado congelado ──────────────────────────────────────────
  delete from sueldo_liquidacion_lineas where liquidacion_id = p_liquidacion;

  insert into sueldo_liquidacion_lineas (liquidacion_id, orden, grupo, concepto, detalle, regla, monto)
  select p_liquidacion,
         (ord - 1)::int,
         ln ->> 'grupo',
         ln ->> 'concepto',
         coalesce(ln ->> 'detalle', ''),
         coalesce(ln ->> 'regla', ''),
         (ln ->> 'monto')::numeric
  from jsonb_array_elements(l.resultado -> 'lineas') with ordinality as t(ln, ord);

  get diagnostics v_lineas = row_count;
  if v_lineas = 0 then
    raise exception 'DATO:el resultado guardado no tiene ninguna línea; no hay nada que congelar';
  end if;

  -- ── 2) El sellado, todavía en borrador ───────────────────────────────────────────────────
  -- Se sellan los CINCO tipos: los tres de plata y los dos de conteo. Todos fueron consumidos.
  update sueldo_movimientos set liquidacion_id = p_liquidacion
  where empleado_id = l.empleado_id
    and fecha between l.periodo_desde and l.periodo_hasta
    and liquidacion_id is null;
  get diagnostics v_sellados = row_count;

  update sueldo_ventas set liquidacion_id = p_liquidacion
  where empleado_id = l.empleado_id
    and fecha between l.periodo_desde and l.periodo_hasta
    and liquidacion_id is null;

  -- ── 3) Recién ahora, cerrar ──────────────────────────────────────────────────────────────
  update sueldo_liquidaciones
     set estado = 'cerrada', cerrada_en = now(), cerrada_por = auth.uid()
   where id = p_liquidacion;

  -- Addendum F-2: sólo pasa a 'liquidado' cuando el tramo que se cierra llega hasta el FINAL real
  -- del acuerdo (periodo_hasta >= fecha_fin). Antes no llevaba condición: cerrar cualquier tramo
  -- —el primero de tres— marcaba el acuerdo entero como liquidado y lo sacaba de "Declarar
  -- asistencia" antes de tiempo (spec addendum F-2).
  update sueldo_acuerdos
     set estado = 'liquidado'
   where id = l.acuerdo_id
     and l.periodo_hasta >= (select fecha_fin from sueldo_acuerdos where id = l.acuerdo_id);

  -- Se informa lo que REALMENTE se selló, no el subconjunto que se contó para la carrera: un
  -- número que no coincide con la base es peor que no informar nada.
  return jsonb_build_object('id', p_liquidacion, 'estado', 'cerrada', 'lineas', v_lineas,
                            'movimientosSellados', v_sellados, 'ventasSelladas', v_ven);
end;
$fn$;
