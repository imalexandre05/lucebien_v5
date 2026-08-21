-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  PROBAR 0078 · las pausas no se pagan — NO deja nada escrito
--
--  Pegá TODO este archivo en el editor SQL de Supabase y dale Run.
--
--  VA A TERMINAR EN ROJO, Y ESO ES LO CORRECTO. La prueba termina a propósito con una excepción,
--  y esa excepción hace que Postgres deshaga todo lo de esta corrida. Buscá la palabra RESULTADO:
--
--      ERROR: RESULTADO 1=ok 2=ok 3=ok ...
--
--  · Todos dicen «ok»  → seguí con 7-aplicar-0078.sql.
--  · Alguno dice FALLA → pará. Copiá la línea entera y mandámela.
--
--  NOTA: esta prueba le presta la identidad de un administrador a la transacción, porque
--  `sueldo_entrada()` sólo deja liquidar al administrador y el editor SQL corre sin usuario
--  logueado. El préstamo dura lo que dura la transacción y se deshace con ella.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- 0078_tramos_asistencia_pausas.sql — las pausas dejan de pagarse (RN-05).
--
-- Implementa docs/superpowers/specs/sueldos/SPEC-cambios-reglas-2026-08-17.md C-01, camino A.
--
-- QUÉ CAMBIA, EN UNA LÍNEA: `sueldo_entrada` deja de colapsar el día con min(entrada)/max(salida)
-- y emite los TRAMOS. El motor los suma y descuenta los huecos.
--
-- QUÉ **NO** CAMBIA: el esquema. `asistencias` ya tiene clave (empleado_id, fecha, turno) desde la
-- 0001, así que un día con dos filas —turno 'M' y turno 'T'— ya era representable. Lo que colapsaba
-- el día era la LECTURA, no la tabla. Camino A no necesita columna nueva.
--
-- POR QUÉ NO ROMPE NADA HOY. Con el horario real de LuceBien (09:00-13:00 + 13:00-20:00, contiguo)
-- la suma de los tramos y el min/max dan las mismas 11 horas. Un día con una sola fila es un tramo,
-- y un tramo se suma solo. Lo único que cambia de número es el día que tiene un hueco de verdad —
-- que es exactamente lo que se pidió.
--
-- LO QUE FALTA DEL OTRO LADO: el huellero todavía escribe UNA fila por día (0075). Mientras siga
-- así, sus días llegan acá como un tramo único y C-01 no ocurre para ellos. Tienen que emparejar
-- las marcas de a dos y escribir una fila por par, cada una con su propio `turno`.
--
-- Idempotente: las funciones son `create or replace`, el check se rehace y el insert lleva
-- `on conflict do nothing`.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) `pausaMinimaMinutos` — el umbral que separa "se fue" de "marcó dos veces"
--
--    Sin umbral, dos marcas a las 09:00 y 09:02 parten el día en dos tramos y le descuentan dos
--    minutos a alguien todos los días. Default 15: ELEGIDO, no confirmado por el administrador
--    (no-negociable 5, anotado en docs/pendientes-negocio.md). Editable desde /configuración.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('sueldo_pausa_minima_minutos', '15')
on conflict (clave) do nothing;

-- Lista blanca de sueldo_acuerdos.parametros: pasa de 15 a 16 claves. Un check no se amplía, se
-- reemplaza. Quitarle las 16 conocidas al jsonb tiene que dejarlo vacío.
alter table sueldo_acuerdos drop constraint if exists sueldo_acuerdos_parametros_chk;

alter table sueldo_acuerdos add constraint sueldo_acuerdos_parametros_chk check (
  jsonb_typeof(parametros) = 'object'
  and parametros - array[
    'toleranciaMinutos', 'tardanzasLibres', 'penalidadTardanza', 'valorAlmuerzo',
    'horasMinimasAlmuerzo', 'valorCapacitacion', 'bonoMetaSemanal', 'metaSemanal',
    'factorMeta', 'metaSemanalFija', 'pctComision', 'montoMinimoComision',
    'diasDescuentoPorFalta', 'metaPorHora', 'factorHoraFueraContrato', 'pausaMinimaMinutos'
  ] = '{}'::jsonb
);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) La lectura de los parámetros globales — una línea más en el mapa
--
--    Copia de la 0077. Las tres trampas que documenta la 0073 siguen aplicando y por eso el cuerpo
--    no se toca: en blanco cae al default, la basura corta con CONFIG:, y el booleano se compara
--    contra 'false' explícito.
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
    'sueldo_pausa_minima_minutos',       'pausaMinimaMinutos'
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
-- 3) sueldo_entrada — emite tramos en vez de colapsar el día
--
--    Copia de la 0073 con un solo bloque distinto: el de la asistencia. Todo lo demás —el permiso,
--    el control de días sin declarar, el horario, las ventas, la precedencia de parámetros— queda
--    igual y por eso no se vuelve a comentar acá.
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
    -- que la 0072 hizo excluyente con sueldo_mov_unidad_chk.
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


-- Prueba de la migración 0078_tramos_asistencia_pausas.sql
--
-- Lo único que esta migración tiene que garantizar del lado de la base es que `sueldo_entrada`
-- EMITA los tramos. La suma, el orden y el umbral de pausa viven en el core y ya tienen sus tests
-- (packages/core/src/sueldos.test.ts, describe «RN-05 — suma de tramos continuos»). Duplicarlos acá
-- sería tener dos verdades sobre la misma regla.
--
-- El modo de fallar que importa: la función se reemplaza sin la línea de `tramos`, el motor recibe
-- sólo el par de punta a punta, sigue liquidando sin romperse y **paga las pausas**. Nadie se
-- entera hasta que alguien compare una boleta a mano.
--
-- SE DESCARTA SOLA. Todo vive en un bloque que termina lanzando una excepción con el resultado:
-- eso aborta la transacción y no queda ni una fila.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0078
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  emp    uuid;
  acu    uuid;
  ent    jsonb;
  dia    jsonb;
  p      jsonb;
  r      text := '';
begin
  -- PRESTAR LA IDENTIDAD DE UN ADMINISTRADOR, SÓLO PARA ESTA TRANSACCIÓN.
  --
  -- `sueldo_entrada()` tiene portero: sólo el administrador puede liquidar. Eso está bien y es lo
  -- que protege el sueldo. Pero el editor SQL de Supabase corre sin usuario logueado —`auth.uid()`
  -- devuelve null— así que la prueba moría con «PERMISO: sólo el administrador puede liquidar»
  -- antes de comprobar una sola cosa.
  --
  -- `is_local = true` ata el préstamo a esta transacción: la excepción con la que termina el bloque
  -- lo deshace junto con todo lo demás. No queda ninguna conexión del pool con identidad prestada,
  -- que es lo único que haría de esto un problema de seguridad y no una comodidad de prueba.
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',
      (select id::text from empleados where rol in ('admin', 'dueno') order by id limit 1)
    )::text,
    true
  );

  select id into emp from empleados order by id limit 1;

  -- Un acuerdo de un solo lunes, con el turno partido de LuceBien.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado)
    values (emp, '2099-03-02', '2099-03-02', 'mensual', 600, 'borrador')  -- 2099-03-02 es lunes
    returning id into acu;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (acu, 1, '09:00', '13:00'), (acu, 1, '15:00', '20:00');

  -- Dos filas del mismo día: dos tramos, con una pausa de dos horas en el medio.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion)
    values (emp, '2099-03-02', 'M', '09:00', '13:00', 'manual', 'trabajado'),
           (emp, '2099-03-02', 'T', '15:00', '20:00', 'manual', 'trabajado');

  ent := sueldo_entrada(acu);
  dia := ent -> 'asistencia' -> 0;

  -- ── 1) El día emite DOS tramos, no uno ───────────────────────────────────────────────────
  if jsonb_array_length(dia -> 'tramos') = 2 then r := r || '1=ok ';
  else r := r || format('1-NO-EMITE-TRAMOS=FALLA(%s) ', coalesce(dia ->> 'tramos', 'ausente')); end if;

  -- ── 2) Los tramos salen ordenados por hora de entrada ────────────────────────────────────
  -- El core los ordena igual, pero que salgan ordenados hace legible el snapshot que queda
  -- guardado para siempre en sueldo_liquidaciones.entrada.
  if (dia -> 'tramos' -> 0 ->> 'ingreso') = '09:00' and (dia -> 'tramos' -> 1 ->> 'ingreso') = '15:00'
  then r := r || '2=ok ';
  else r := r || format('2-DESORDENADOS=FALLA(%s) ', dia ->> 'tramos'); end if;

  -- ── 3) Se sigue emitiendo el par de punta a punta ────────────────────────────────────────
  -- La tardanza (RN-08) se mide contra el primer ingreso, y un snapshot viejo tiene que seguir
  -- leyéndose. Si esto desaparece, todo día pasa a leerse como falta: dos días de sueldo cada uno.
  if (dia ->> 'horaIngreso') = '09:00' and (dia ->> 'horaSalida') = '20:00' then r := r || '3=ok ';
  else r := r || format('3-SIN-PAR=FALLA(%s %s) ', dia ->> 'horaIngreso', dia ->> 'horaSalida'); end if;

  -- ── 4) Un día declarado 'falta' no emite tramos ──────────────────────────────────────────
  -- Una falta se declara con el ingreso en null. Mandar tramos además la contradiría con el dato
  -- de una carga anterior, y el motor pagaría horas de un día que la persona no vino.
  update asistencias set condicion = 'falta' where empleado_id = emp and fecha = '2099-03-02' and turno = 'T';
  ent := sueldo_entrada(acu);
  dia := ent -> 'asistencia' -> 0;
  if jsonb_array_length(dia -> 'tramos') = 0 and dia -> 'horaIngreso' = 'null'::jsonb then r := r || '4=ok ';
  else r := r || format('4-FALTA-CON-TRAMOS=FALLA(%s) ', dia::text); end if;

  -- ── 5) El umbral de pausa llega al motor ─────────────────────────────────────────────────
  -- Sin él, dos marcas a las 09:00 y 09:02 parten el día y descuentan dos minutos todos los días.
  p := ent -> 'parametros';
  if (p ->> 'pausaMinimaMinutos')::numeric = 15 then r := r || '5=ok ';
  else r := r || format('5-UMBRAL-NO-LLEGA=FALLA(%s) ', coalesce(p ->> 'pausaMinimaMinutos', 'ausente')); end if;

  -- ── 6) Se puede pactar otro umbral por contrato ──────────────────────────────────────────
  update sueldo_acuerdos set parametros = '{"pausaMinimaMinutos": 30}'::jsonb where id = acu;
  ent := sueldo_entrada(acu);
  if (ent -> 'parametros' ->> 'pausaMinimaMinutos')::numeric = 30 then r := r || '6=ok ';
  else r := r || format('6-OVERRIDE-NO-PISA=FALLA(%s) ', ent -> 'parametros' ->> 'pausaMinimaMinutos'); end if;

  raise exception 'RESULTADO %', r;
end $$;
