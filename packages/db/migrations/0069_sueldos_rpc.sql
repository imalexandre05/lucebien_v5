-- 0069_sueldos_rpc.sql — Las tres RPC del sistema de sueldos.
--
-- Implementa docs/superpowers/specs/sueldos/SPEC-esquema-sueldos.md §8. La 0068 dejó las tablas;
-- esta deja las tres operaciones: armar la entrada del motor, cerrar una liquidación y anularla.
--
-- ZONA CRÍTICA (no-negociable 1 y 3): esto arma y congela el pago de una persona real.
--
-- Todas son `security invoker` con `set search_path = public`: la RLS del actor decide el alcance.
-- Y todas abren con un guard explícito igual, aunque sean invoker. El precedente contrario está
-- vivo en este repo: evaluacion_componentes era `security definer`, concedida a `authenticated` y
-- sin ningún chequeo interno, hasta que la 0067 le puso un portero.
--
-- Errores con el prefijo 'CODIGO:mensaje', que el repo de TypeScript ya sabe parsear.
-- Y `revoke execute ... from public, anon` después de cada una: sin eso, cualquier anónimo la
-- llama por /rest/v1/rpc.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 0) El check que faltaba en asistencias
--    Un día declarado 'trabajado' sin hora de entrada es un día que el motor lee como FALTA
--    (sueldos.ts:569) y cobra dos días de sueldo. La columna condicion decía una cosa y las horas
--    otra, y ganaban las horas.
--    Seguro de aplicar: las 13 filas que hay están todas en 'sin_dato'.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'asistencias_trabajado_chk') then
    alter table asistencias add constraint asistencias_trabajado_chk
      check (condicion <> 'trabajado' or (hora_entrada is not null and hora_salida is not null));
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Lectura de los 13 parámetros globales (spec §5)
--
--    Tres trampas verificadas, todas de dinero:
--    a) Number('') es 0 y es finito: una fila con el valor en blanco NO cae al default con un
--       cast ingenuo. Y en sueldos eso es plata — montoMinimoComision = 0 comisiona todas las
--       boletas, y toleranciaMinutos = 0 convierte cada minuto en tardanza. En blanco → default.
--    b) Basura ("diez", "10 min") NO cae al default: corta. Un parámetro de sueldo ilegible es un
--       problema real, y el motor ya eligió fallar ruidosamente antes que liquidar a ciegas.
--    c) Boolean('false') es true. El booleano se lee comparando contra 'false' explícito.
--
--    Devuelve SÓLO las claves que existen y tienen valor: resolverParametros() del core aplica los
--    defaults, y una clave con null no pisa nada (sueldos.ts:123).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.sueldo_parametros_config()
  returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  r      record;
  v_txt  text;
  salida jsonb := '{}'::jsonb;
  -- clave de config → clave camelCase de ParametrosSueldo
  mapa constant jsonb := jsonb_build_object(
    'sueldo_tolerancia_minutos',       'toleranciaMinutos',
    'sueldo_tardanzas_libres',         'tardanzasLibres',
    'sueldo_penalidad_tardanza',       'penalidadTardanza',
    'sueldo_valor_almuerzo',           'valorAlmuerzo',
    'sueldo_horas_minimas_almuerzo',   'horasMinimasAlmuerzo',
    'sueldo_valor_capacitacion',       'valorCapacitacion',
    'sueldo_bono_meta_semanal',        'bonoMetaSemanal',
    'sueldo_factor_meta',              'factorMeta',
    'sueldo_pct_comision',             'pctComision',
    'sueldo_monto_minimo_comision',    'montoMinimoComision',
    'sueldo_dias_descuento_por_falta', 'diasDescuentoPorFalta',
    'sueldo_meta_por_hora',            'metaPorHora'
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
-- 2) sueldo_entrada(acuerdo) — arma la EntradaLiquidacion que consume el motor
--
--    Las claves salen en camelCase porque las consume packages/core/src/sueldos.ts tal cual.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function sueldo_entrada(p_acuerdo uuid)
  returns jsonb language plpgsql stable security invoker set search_path = public as $fn$
declare
  a          record;
  v_faltan   text;
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

  if not exists (select 1 from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo) then
    raise exception 'DATO:el acuerdo no tiene horario cargado; sin horas contratadas no hay nada que liquidar';
  end if;

  -- ── El control que evita liquidar faltas inventadas ──────────────────────────────────────
  -- Todo día del periodo que caiga en un día con turno contratado tiene que tener su fila de
  -- asistencia DECLARADA. 'sin_dato' no cuenta: significa que nadie cargó nada, y mandarlo al
  -- motor con la hora en null lo convertiría en una falta de dos días de sueldo.
  select string_agg(to_char(d.dia, 'YYYY-MM-DD'), ', ' order by d.dia)
    into v_faltan
  from generate_series(a.fecha_inicio, a.fecha_fin, interval '1 day') as d(dia)
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

  -- ── El horario contratado ────────────────────────────────────────────────────────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'diaSemana',  t.dia_semana,
           'horaInicio', to_char(t.hora_inicio, 'HH24:MI'),
           'horaFin',    to_char(t.hora_fin,    'HH24:MI')
         ) order by t.dia_semana, t.hora_inicio), '[]'::jsonb)
    into v_horario
  from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo;

  -- ── La asistencia, colapsada a un par ingreso/salida por día ─────────────────────────────
  -- El grano de la tabla es (empleado, fecha, turno) y el motor quiere un solo par por fecha.
  -- El colapso va en la LECTURA para no tocar la clave que ya usan los reportes y el huellero.
  -- Con el horario real de LuceBien (09:00-13:00 + 13:00-20:00, contiguo) es exacto; un turno
  -- partido con hueco pagaría el hueco, y por eso está anotado en docs/pendientes-negocio.md.
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
      exists (
        select 1 from sueldo_acuerdo_turnos t
        where t.acuerdo_id = p_acuerdo and t.dia_semana = extract(isodow from s.fecha)
      )                                                  as contratado
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between a.fecha_inicio and a.fecha_fin
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

  -- ── Las ventas del periodo que todavía no consumió ninguna liquidación ───────────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha',    to_char(v.fecha, 'YYYY-MM-DD'),
           'monto',    v.monto,
           'tipo',     v.tipo,
           'tiendaId', v.sede_cod
         ) order by v.fecha), '[]'::jsonb)
    into v_ventas
  from sueldo_ventas v
  where v.empleado_id = a.empleado_id
    and v.fecha between a.fecha_inicio and a.fecha_fin
    and v.liquidacion_id is null;

  -- Los nulls NO se quitan: `horaIngreso: null` ES la declaración de una falta (sueldos.ts:569
  -- lee `== null`), y quien abra este snapshot dentro de un año tiene que verlo.
  return jsonb_build_object(
    'acuerdoId',     a.id,
    'empleadoId',    a.empleado_id,
    'fechaInicio',   to_char(a.fecha_inicio, 'YYYY-MM-DD'),
    'fechaFin',      to_char(a.fecha_fin,    'YYYY-MM-DD'),
    'modalidad',     a.modalidad,
    'sueldoPactado', a.sueldo_pactado,
    'horario',       v_horario,
    'asistencia',    v_asist,
    'horasFueraDeContrato', v_fuera,
    'ventas',        v_ventas,
    'almuerzoHabilitadoPorAdmin', a.almuerzo_habilitado,
    -- Los tres tipos de PLATA van como lista; los dos de CONTEO van como número. Es la distinción
    -- que la 0068 hizo excluyente con sueldo_mov_unidad_chk.
    'adelantos',    private.sueldo_movimientos_lista(a.empleado_id, a.fecha_inicio, a.fecha_fin, 'adelanto'),
    'reportes',     private.sueldo_movimientos_lista(a.empleado_id, a.fecha_inicio, a.fecha_fin, 'reporte'),
    'bonosExtras',  private.sueldo_movimientos_lista(a.empleado_id, a.fecha_inicio, a.fecha_fin, 'bono_extra'),
    'almuerzosEntregados', private.sueldo_movimientos_conteo(a.empleado_id, a.fecha_inicio, a.fecha_fin, 'almuerzo_entregado'),
    'personasCapacitadas', private.sueldo_movimientos_conteo(a.empleado_id, a.fecha_inicio, a.fecha_fin, 'capacitacion'),
    -- Precedencia de la spec §5: default del core ← config global ← override del contrato.
    'parametros',   private.sueldo_parametros_config() || a.parametros
  );
end;
$fn$;

-- Dos helpers para no repetir la misma consulta cinco veces. Van en `private` porque nadie los
-- llama de afuera.
create or replace function private.sueldo_movimientos_lista(
  p_empleado uuid, p_desde date, p_hasta date, p_tipo text)
  returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha',  to_char(m.fecha, 'YYYY-MM-DD'),
           'motivo', m.motivo,
           'monto',  m.monto
         ) order by m.fecha), '[]'::jsonb)
  from sueldo_movimientos m
  where m.empleado_id = p_empleado
    and m.fecha between p_desde and p_hasta
    and m.tipo = p_tipo
    and m.liquidacion_id is null;
$fn$;

create or replace function private.sueldo_movimientos_conteo(
  p_empleado uuid, p_desde date, p_hasta date, p_tipo text)
  returns int language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(m.cantidad), 0)::int
  from sueldo_movimientos m
  where m.empleado_id = p_empleado
    and m.fecha between p_desde and p_hasta
    and m.tipo = p_tipo
    and m.liquidacion_id is null;
$fn$;

revoke execute on function private.sueldo_movimientos_lista(uuid, date, date, text)  from public, anon;
revoke execute on function private.sueldo_movimientos_conteo(uuid, date, date, text) from public, anon;
grant  execute on function private.sueldo_movimientos_lista(uuid, date, date, text)  to authenticated, service_role;
grant  execute on function private.sueldo_movimientos_conteo(uuid, date, date, text) to authenticated, service_role;

revoke execute on function sueldo_entrada(uuid) from public, anon;
grant  execute on function sueldo_entrada(uuid) to authenticated;

comment on function sueldo_entrada(uuid) is
  'Arma la EntradaLiquidacion de packages/core/src/sueldos.ts para un acuerdo. Corta nombrando las
   fechas si algún día contratado quedó sin declarar: un día sin cargar NO es una falta.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) sueldo_liquidacion_cerrar(liquidacion) — congela el pago
--
--    Un solo parámetro: el borrador ya tiene entrada, parametros_usados y resultado (son not null,
--    los escribió la Server Action después de correr liquidarPeriodo() EN EL SERVIDOR). Las líneas
--    salen de resultado->'lineas'. Un parámetro menos es una forma menos de que el navegador
--    influya en un pago.
--
--    ORDEN OBLIGATORIO, y no es libre: líneas → sellar → cerrar. Si cerrara primero, el trigger
--    sueldo_sellado_inmutable de la 0068 la bloquearía a ella misma, porque sólo se puede sellar
--    contra una liquidación en 'borrador'.
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

  update sueldo_acuerdos set estado = 'liquidado' where id = l.acuerdo_id;

  -- Se informa lo que REALMENTE se selló, no el subconjunto que se contó para la carrera: un
  -- número que no coincide con la base es peor que no informar nada.
  return jsonb_build_object('id', p_liquidacion, 'estado', 'cerrada', 'lineas', v_lineas,
                            'movimientosSellados', v_sellados, 'ventasSelladas', v_ven);
end;
$fn$;

revoke execute on function sueldo_liquidacion_cerrar(uuid) from public, anon;
grant  execute on function sueldo_liquidacion_cerrar(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) sueldo_liquidacion_anular(liquidacion, motivo) — el único camino para deshacer
--
--    Una liquidación cerrada no se recalcula nunca: se anula y se emite una nueva. Acá también el
--    orden importa, al revés que en cerrar(): anular PRIMERO y soltar los sellos DESPUÉS. Mientras
--    la liquidación siga 'cerrada', el trigger no deja tocar ninguna fila sellada.
--
--    Soltar los sellos no es un detalle: si quedaran pegados, la reemisión no descontaría el
--    adelanto y la persona cobraría de más exactamente ese monto.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function sueldo_liquidacion_anular(p_liquidacion uuid, p_motivo text)
  returns jsonb language plpgsql volatile security invoker set search_path = public as $fn$
declare
  l     record;
  v_mov int;
  v_ven int;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede anular una liquidación';
  end if;

  if coalesce(length(trim(p_motivo)), 0) = 0 then
    raise exception 'DATO:hace falta el motivo de la anulación; sin motivo se pierde el rastro';
  end if;

  select * into l from sueldo_liquidaciones where id = p_liquidacion for update;
  if not found then
    raise exception 'DATO:la liquidación no existe o no es visible';
  end if;
  if l.estado <> 'cerrada' then
    raise exception 'ESTADO:esta liquidación está %; sólo se anula una cerrada', l.estado;
  end if;

  update sueldo_liquidaciones
     set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(),
         anulada_motivo = trim(p_motivo)
   where id = p_liquidacion;

  update sueldo_movimientos set liquidacion_id = null where liquidacion_id = p_liquidacion;
  get diagnostics v_mov = row_count;

  update sueldo_ventas set liquidacion_id = null where liquidacion_id = p_liquidacion;
  get diagnostics v_ven = row_count;

  -- El acuerdo vuelve a estar disponible para reemitir.
  update sueldo_acuerdos set estado = 'vigente'
   where id = l.acuerdo_id and estado = 'liquidado';

  return jsonb_build_object('id', p_liquidacion, 'estado', 'anulada',
                            'movimientosLiberados', v_mov, 'ventasLiberadas', v_ven);
end;
$fn$;

revoke execute on function sueldo_liquidacion_anular(uuid, text) from public, anon;
grant  execute on function sueldo_liquidacion_anular(uuid, text) to authenticated;
