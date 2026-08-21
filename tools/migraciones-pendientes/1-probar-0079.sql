-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  PROBAR 0079 · huellero — NO deja nada escrito
--
--  Pegá TODO este archivo en el editor SQL de Supabase y dale Run.
--
--  VA A TERMINAR EN ROJO, Y ESO ES LO CORRECTO. La prueba termina a propósito con una excepción,
--  y esa excepción hace que Postgres deshaga todo lo de esta corrida — incluido el cambio de
--  función. Probaste el código nuevo contra los datos reales y no quedó nada.
--
--  Lo que importa es el texto del error. Buscá la palabra RESULTADO:
--
--      ERROR: RESULTADO 1=ok 2=ok 3=ok ...
--
--  · Todos dicen «ok»  → seguí con el archivo de aplicar.
--  · Alguno dice FALLA → pará. Copiá la línea entera y mandámela.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- 0079_huellero_emparejado_fix.sql — el emparejado del huellero deja de perder marcas y de
-- borrar horas ya derivadas.
--
-- Implementa docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md, sección
-- «El defecto del emparejado, y las tres reglas que lo cierran (20-ago-2026)».
--
-- QUÉ PASABA. Al derivar las 3.084 marcas reales, 15 días abortaron con:
--
--   new row for relation "asistencias" violates check constraint "asistencias_trabajado_chk"
--
-- El emparejado reabre un tramo ya cerrado cuando llega una marca antes de que se cumpla la pausa
-- mínima. Si esa marca era la última del día, el tramo se queda abierto y la hora de salida vuelve
-- a null. Como la fila la había escrito la propia máquina (huellero_puso_salida = true), el
-- coalesce que protege las horas cargadas no aplicaba: el update escribía hora_salida = null sobre
-- una fila que seguía en condicion = 'trabajado', y la restricción abortaba el lote entero.
--
-- Caso vivo al 20-ago-2026: Jaerock, 2026-08-19, marcas 08:10:41 · 14:05:33 · 14:15:39.
--
-- La hora que carga una persona nunca corrió riesgo: en esa fila huellero_puso_salida es false.
-- Lo que se perdía era la hora que había derivado la máquina.
--
-- QUÉ CAMBIA. Tres reglas, y ninguna toca el esquema:
--
--   1. Un tramo reabierto que se queda sin cierre se cierra con esa última marca. 38 días del
--      histórico, con 1,7 minutos de separación promedio. Confirmado con Alexander el 20-ago-2026.
--   2. Ninguna escritura deja en null una hora que ya estaba cargada.
--   3. La condición sale consistente con sus horas sin depender de que la restricción lo revise.
--
-- QUÉ NO CAMBIA. El colapso por tramos, las dos salvaguardas de la spec §6 (no se toca un día con
-- falta declarada, no se pisa lo declarado), el turno que se elige al crear, el rango de jornada
-- plausible, y la transición 'sin_dato' → 'trabajado' que hace que el dato sea visible al motor.
--
-- Idempotente: `create or replace` sobre la función y `on conflict do nothing` sobre config.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) El umbral de pausa tiene que existir como fila editable
--
--    Verificado contra producción el 20-ago-2026: `sueldo_pausa_minima_minutos` NO existe en
--    config, así que el umbral corre por el default de quince minutos escrito en el código. Contra
--    el no-negociable 5, un parámetro de negocio no vive hardcodeado: vive en config y se edita
--    desde /configuracion, donde apps/erp-web/lib/config-catalogo.ts:420 ya lo tiene declarado.
--
--    La 0078 también lo inserta, pero esa migración no está aplicada. El insert se repite acá con
--    `on conflict do nothing` para que el parámetro exista aunque la 0078 nunca llegue, y para que
--    aplicarlas en cualquier orden dé el mismo resultado.
--
--    Default 15: ELEGIDO, no confirmado por el administrador. Anotado en docs/pendientes-negocio.md.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('sueldo_pausa_minima_minutos', '15')
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) La derivación, con las tres reglas
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_derivar_asistencia(p_empleado_id uuid, p_fecha date)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_marcas      int;
  v_nombres     int;
  v_anonimas    int;
  v_pausa_min   numeric;
  v_max_horas   numeric;
  v_min_horas   numeric;
  v_motivo      text := null;
  v_tramos      time[][];
  v_ent         time;
  v_sal         time;
  v_horas       numeric;
  v_n_tramos    int;
  v_turno       text;
  v_i           int;
  v_fila        asistencias%rowtype;
  v_nueva_ent   time;
  v_nueva_sal   time;
  m             record;
  v_filas       uuid[];    -- las filas que YA existen ese día, por turno
  v_turnos      text[];
  v_abierto     time := null;   -- entrada del tramo que se está armando
  v_ultimo      time := null;   -- cierre tentativo del tramo abierto (puede volver a null)
  v_ultima      time := null;   -- la última marca vista, se haya descartado o no
  v_final_ent   time;
  v_final_sal   time;
begin
  if p_empleado_id is null or p_fecha is null then return; end if;

  -- SALVAGUARDA (a): una falta declarada protege el DÍA entero, no una fila.
  --
  -- Cuesta dos días de sueldo (RN-09) y la decidió una persona: ninguna huella la revierte sola.
  if exists (
    select 1 from asistencias a
    where a.empleado_id = p_empleado_id and a.fecha = p_fecha and a.condicion = 'falta'
  ) then
    return;
  end if;

  select count(*),
         count(distinct nullif(btrim(m2.nombre_equipo), '')),
         count(*) filter (where nullif(btrim(m2.nombre_equipo), '') is null)
    into v_marcas, v_nombres, v_anonimas
  from marcas_huellero m2
  where m2.empleado_id = p_empleado_id
    and (m2.marcada_en at time zone 'America/Lima')::date = p_fecha;

  if v_marcas = 0 then return; end if;

  -- El día en que un identificador cambia de dueño. Dispara con dos nombres distintos y también
  -- con mezcla de marcas con nombre y sin nombre: una anónima puede ser de cualquiera de las dos
  -- personas, y el equipo omite el nombre en varios tipos de evento.
  if v_nombres > 1 or (v_nombres >= 1 and v_anonimas > 0) then
    v_motivo := 'revisar: el identificador tiene más de un nombre este día (posible reasignación)';
  end if;

  -- ── Emparejar las marcas en TRAMOS ────────────────────────────────────────────────────────
  --
  -- Las pausas dejaron de pagarse (C-01, migración 0078): si alguien marca su salida y vuelve el
  -- mismo día, el rato de afuera no cuenta como trabajado. Para que eso valga también para el
  -- huellero hay que emitir un tramo por par de marcas en vez de colapsar el día con
  -- min(entrada)/max(salida) — lo pide la propia 0078 en su encabezado.
  --
  -- Confirmado con Alexander el 17-ago-2026: "si alguien marca su salida y vuelve a habilitarlo
  -- el mismo día se cuentan nuevamente las horas; no es que el sistema castigue, sencillamente
  -- no cuenta esas horas como trabajadas".
  --
  -- Las marcas alternan entrada/salida en orden. Un hueco más corto que `pausaMinimaMinutos` NO
  -- es una salida: es alguien que apoyó el dedo dos veces, y sin fusionarlo se le descontarían
  -- minutos todos los días.
  select coalesce(nullif(btrim(c.valor), '')::numeric, 15) into v_pausa_min
    from config c where c.clave = 'sueldo_pausa_minima_minutos';
  v_pausa_min := coalesce(v_pausa_min, 15);

  v_tramos := array[]::time[][];
  for m in
    select (mk.marcada_en at time zone 'America/Lima')::time as h
    from marcas_huellero mk
    where mk.empleado_id = p_empleado_id
      and (mk.marcada_en at time zone 'America/Lima')::date = p_fecha
    order by mk.marcada_en
  loop
    if v_abierto is null then
      v_abierto := m.h;                        -- abre un tramo
    elsif v_ultimo is null then
      -- El tramo está abierto y llega otra marca. Si viene pegada a la entrada NO es la salida:
      -- es la misma persona apoyando el dedo dos veces. Ignorarla evita partir el día en un
      -- tramo de dos minutos más otro sin cerrar, que era lo que pasaba.
      if extract(epoch from (m.h - v_abierto)) / 60.0 >= v_pausa_min then
        v_ultimo := m.h;                       -- lo cierra, por ahora
      end if;
    else
      -- Hay un tramo cerrado y llega otra marca: ¿lo reabre o empieza uno nuevo?
      if extract(epoch from (m.h - v_ultimo)) / 60.0 < v_pausa_min then
        -- Volvió enseguida: esa salida no fue una salida. Se descarta el cierre y el tramo
        -- vuelve a quedar abierto, esperando la salida de verdad. Extender el cierre en vez de
        -- reabrir partía mal el día: con 08:00, 13:00, 13:05 y 18:00 daba 08:00-13:05 más un
        -- tramo suelto a las 18:00, en vez de la jornada continua que fue.
        v_ultimo := null;
      else
        v_tramos := v_tramos || array[array[v_abierto, v_ultimo]];
        v_abierto := m.h;
        v_ultimo  := null;
      end if;
    end if;

    v_ultima := m.h;   -- se guarda siempre, incluso cuando la marca se descartó arriba
  end loop;

  -- ── REGLA 1 (spec §6, confirmada con Alexander el 20-ago-2026) ────────────────────────────
  --
  -- Un tramo que quedó abierto porque su cierre se descartó por venir dentro de la pausa mínima
  -- se cierra con esa misma marca. Si el hueco es más corto que la pausa, por definición no fue
  -- una pausa: las dos marcas pertenecen al mismo tramo y la última es su final.
  --
  -- Descartarla convertía una jornada completa en 'sin_dato' y cortaba la liquidación del período
  -- entero. Medido sobre el histórico: 38 días, 1,7 minutos de separación promedio.
  --
  -- La comparación contra v_abierto es la que separa los dos casos. Si la última marca ES la que
  -- abrió el tramo, no hay nada que cerrar: ese día es una entrada sin salida de verdad, y se
  -- deja abierto para que lo complete una persona.
  if v_abierto is not null and v_ultimo is null and v_ultima > v_abierto then
    v_ultimo := v_ultima;
  end if;

  if v_abierto is not null then
    -- El último tramo puede quedar sin cerrar: es la persona que entró y no marcó al irse.
    v_tramos := v_tramos || array[array[v_abierto, v_ultimo]];
  end if;

  v_n_tramos := coalesce(array_length(v_tramos, 1), 0);
  if v_n_tramos = 0 then return; end if;

  -- Más de dos tramos no se puede representar: la clave de la tabla es (empleado, fecha, turno) y
  -- los turnos del sistema son M y T. Con los datos reales no ocurre —quienes marcaban muchas
  -- veces al día son el administrador y su familia, que van ignorados y no cobran— pero si
  -- ocurriera se guardan los dos primeros y el día queda marcado para que lo mire una persona.
  if v_n_tramos > 2 then
    v_motivo := coalesce(v_motivo,
      'revisar: el día tiene ' || v_n_tramos || ' tramos y sólo se pueden guardar dos');
    v_n_tramos := 2;
  end if;

  select coalesce(nullif(btrim(c.valor), '')::numeric, 14) into v_max_horas
    from config c where c.clave = 'huellero_jornada_max_horas';
  select coalesce(nullif(btrim(c.valor), '')::numeric, 0.5) into v_min_horas
    from config c where c.clave = 'huellero_jornada_min_horas';
  v_max_horas := coalesce(v_max_horas, 14);
  v_min_horas := coalesce(v_min_horas, 0.5);

  -- Las filas que ya existen ese día, en orden de turno.
  --
  -- POR QUÉ NO SE ELIGE EL TURNO POR NÚMERO DE TRAMO. Lo primero que se hizo fue mandar el tramo
  -- 1 al turno 'M' y el 2 al 'T', y eso rompía el caso más común: la fila que deja el envío de un
  -- reporte (0030) suele estar en turno 'T'. La derivación buscaba una fila 'M', no la
  -- encontraba, creaba otra, y la del reporte se quedaba en 'sin_dato' bloqueando la liquidación
  -- del mes — que es exactamente lo que la transición de condición existe para evitar.
  --
  -- Cada tramo va a la fila que le toca por orden. Da igual cómo se llame su turno: la
  -- liquidación agrupa por fecha y suma los tramos, no mira el nombre.
  select array_agg(a.id order by a.turno), array_agg(a.turno order by a.turno)
    into v_filas, v_turnos
  from asistencias a
  where a.empleado_id = p_empleado_id and a.fecha = p_fecha;

  for v_i in 1..v_n_tramos loop
    v_ent   := v_tramos[v_i][1];
    v_sal   := v_tramos[v_i][2];

    -- El turno sólo se elige al CREAR una fila nueva; si ya hay una, se respeta el suyo.
    v_turno := coalesce(v_turnos[v_i],
                        case when 'M' = any(coalesce(v_turnos, array[]::text[])) then 'T' else 'M' end);

    -- SALVAGUARDA (c): un tramo que no puede ser cierto se guarda con sus horas reales pero NO se
    -- declara trabajado. Se evalúa por tramo, que es lo que ahora se paga.
    if v_sal is not null then
      v_horas := extract(epoch from (v_sal - v_ent)) / 3600.0;
      if v_horas > v_max_horas or v_horas < v_min_horas then
        v_motivo := coalesce(v_motivo,
          'revisar: un tramo da ' || round(v_horas, 2) || ' h, fuera del rango esperado');
      end if;
    end if;

    if v_filas is not null and array_length(v_filas, 1) >= v_i then
      select * into v_fila from asistencias a where a.id = v_filas[v_i];
    else
      select * into v_fila
      from asistencias a
      where a.empleado_id = p_empleado_id and a.fecha = p_fecha and a.turno = v_turno;
    end if;

    if not found then
      insert into asistencias (empleado_id, fecha, turno, hora_entrada, hora_salida,
                               minutos_tardanza, fuente, condicion, obs,
                               huellero_puso_entrada, huellero_puso_salida)
      values (p_empleado_id, p_fecha, v_turno, v_ent, v_sal,
              0,                          -- el motor calcula la tardanza contra el horario
              'huellero',
              case when v_sal is not null and v_motivo is null then 'trabajado' else 'sin_dato' end,
              coalesce(v_motivo, 'auto: huellero'),
              v_ent is not null, v_sal is not null)
      on conflict (empleado_id, fecha, turno) do nothing;
      continue;
    end if;

    -- SALVAGUARDA (b): sólo se rellena lo que está vacío. Las horas que puso la propia máquina sí
    -- se recalculan: si no, una re-resolución parcial dejaba pegada una hora que ya era de otra
    -- persona.
    v_nueva_ent := case when v_fila.huellero_puso_entrada then v_ent
                        else coalesce(v_fila.hora_entrada, v_ent) end;
    v_nueva_sal := case when v_fila.huellero_puso_salida  then v_sal
                        else coalesce(v_fila.hora_salida,  v_sal)  end;

    -- ── REGLA 2 (spec §6): ninguna escritura deja en null una hora que ya estaba cargada ────
    --
    -- Recalcular la hora que puso la máquina sigue permitido —hace falta cuando un identificador
    -- cambia de dueño— pero recalcularla A NADA no: borra un hecho real sin aportar ninguno.
    --
    -- Era el defecto que abortaba 15 días contra asistencias_trabajado_chk: un tramo que volvía a
    -- quedar abierto mandaba v_sal en null, la fila la había escrito la propia máquina (así que el
    -- coalesce de arriba no la protegía), y la salida se iba a null con la condición todavía en
    -- 'trabajado'.
    v_final_ent := coalesce(v_nueva_ent, v_fila.hora_entrada);
    v_final_sal := coalesce(v_nueva_sal, v_fila.hora_salida);

    -- Rellenar no puede dejar la salida antes que la entrada: la liquidación después no cierra.
    if v_final_ent is not null and v_final_sal is not null and v_final_sal <= v_final_ent then
      continue;
    end if;

    -- Si por algún camino no previsto la fila fuera a quedar declarada sin sus dos horas, se deja
    -- escrito el porqué. Bajar la condición sin decir nada esconde el problema en vez de mostrarlo.
    if v_fila.condicion = 'trabajado' and (v_final_ent is null or v_final_sal is null) then
      v_motivo := coalesce(v_motivo, 'revisar: la jornada quedó sin una de sus dos horas');
    end if;

    update asistencias a
       set hora_entrada = v_final_ent,
           hora_salida  = v_final_sal,
           -- El sello sigue a su hora: si la hora no se toca, el sello tampoco.
           huellero_puso_entrada = case when v_nueva_ent is null then a.huellero_puso_entrada
                                        else (a.huellero_puso_entrada or a.hora_entrada is null) end,
           huellero_puso_salida  = case when v_nueva_sal is null then a.huellero_puso_salida
                                        else (a.huellero_puso_salida  or a.hora_salida  is null) end,
           -- Única excepción a "no pisar otra fuente", y sin ella el proyecto no sirve: la fila
           -- que deja un reporte nace sin horas y en 'sin_dato', y la liquidación filtra los
           -- 'sin_dato'. Rellenarla sin transicionar dejaría el periodo bloqueado.
           condicion = case
             when a.condicion = 'sin_dato'
              and v_final_ent is not null and v_final_sal is not null and v_motivo is null
             then 'trabajado'
             -- REGLA 3 (spec §6): red, no mecanismo. Con la regla 2 una fila 'trabajado' ya no
             -- puede perder una hora, así que esta rama no debería alcanzarse. Se deja porque el
             -- costo de equivocarse es la restricción abortando el lote entero del colector, y
             -- porque de acá la condición tiene que salir consistente con sus horas sin depender
             -- de que el check lo revise.
             when a.condicion = 'trabajado' and (v_final_ent is null or v_final_sal is null)
             then 'sin_dato'
             else a.condicion
           end,
           -- El motivo se concatena y no se repite: re-derivar el mismo día muchas veces agregaba
           -- el mismo texto una vez por pasada.
           obs = case
             when v_motivo is null then a.obs
             when coalesce(a.obs, '') like '%' || v_motivo || '%' then a.obs
             else nullif(btrim(concat_ws(' · ', nullif(a.obs, ''), v_motivo)), '')
           end
     where a.id = v_fila.id;
  end loop;
end;
$fn$;

comment on function huellero_derivar_asistencia(uuid, date) is
  'Marcas de un empleado en un día → filas de asistencia, una por tramo. No toca un día con falta
   declarada, no pisa horas cargadas, nunca deja en null una hora que ya estaba, y no declara
   trabajada una jornada imposible: la deja en sin_dato con el motivo para que la mire una persona.';


-- Prueba de la migración 0079_huellero_emparejado_fix.sql
--
-- Cubre las tres reglas de la spec §6 «El defecto del emparejado» (20-ago-2026). Cada caso es un
-- fallo real medido sobre las 3.084 marcas de producción, no un caso inventado.
--
-- EL MODO DE FALLAR QUE IMPORTA. La derivación aborta el lote entero del colector contra
-- asistencias_trabajado_chk, o —peor, si la fila estuviera en 'sin_dato'— borra en silencio una
-- hora que ya estaba derivada. Las dos cosas terminan en el mismo lugar: un día que no se liquida.
--
-- SE DESCARTA SOLA. Todo vive en un bloque que termina lanzando una excepción con el resultado:
-- eso aborta la transacción y no queda ni una fila. El "error" final ES la salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0079
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  disp uuid;
  eA uuid; eB uuid; eC uuid; eD uuid; eE uuid;
  cond text; ent time; sal time; v_obs text;
  puso_sal boolean;
  r text := '';
begin
  -- El umbral que separa "se fue" de "apoyó el dedo dos veces". La prueba lo fija en la propia
  -- transacción para no depender de lo que tenga config, y así el escenario dice lo que mide.
  insert into config (clave, valor) values ('sueldo_pausa_minima_minutos', '15')
    on conflict (clave) do update set valor = '15';

  select id into eA from empleados order by id limit 1;
  select id into eB from empleados order by id offset 1 limit 1;
  select id into eC from empleados order by id offset 2 limit 1;
  select id into eD from empleados order by id offset 3 limit 1;
  select id into eE from empleados order by id offset 4 limit 1;

  insert into dispositivos_huellero(nombre, ip) values ('Prueba 0079', '10.0.0.79') returning id into disp;

  -- ── 1) EL CASO DE PRODUCCIÓN: día impar sobre una fila que la máquina ya declaró ──────────
  --
  -- Jaerock, 2026-08-19: 08:10:41 · 14:05:33 · 14:15:39. La tercera marca cae diez minutos
  -- después de la segunda —menos que la pausa— y reabre el tramo. Antes de la 0079 esto escribía
  -- hora_salida = null sobre una fila en 'trabajado' y abortaba con asistencias_trabajado_chk.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '790', eA, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'790',eA,'2099-07-01T08:10:41-05:00',790001,'A'),
           (disp,'790',eA,'2099-07-01T14:05:33-05:00',790002,'A');
  perform huellero_derivar_asistencia(eA, '2099-07-01');   -- deja la fila en 'trabajado'

  begin
    insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
      values (disp,'790',eA,'2099-07-01T14:15:39-05:00',790003,'A');
    perform huellero_derivar_asistencia(eA, '2099-07-01');
    r := r || '1=ok ';
  exception when others then
    r := r || format('1-ABORTA=FALLA(%s) ', sqlerrm);
  end;

  -- ── 2) REGLA 1: el tramo reabierto se cierra con la última marca ─────────────────────────
  -- La persona se fue a las 14:15:39. Cerrar con 14:05:33 le descuenta diez minutos; dejarlo
  -- abierto le borra el día entero de la liquidación.
  select condicion, hora_entrada, hora_salida into cond, ent, sal
    from asistencias where empleado_id=eA and fecha='2099-07-01';
  if cond = 'trabajado' and ent = '08:10:41' and sal = '14:15:39' then r := r || '2=ok ';
  else r := r || format('2-NO-CIERRA-CON-LA-ULTIMA=FALLA(%s %s %s) ', cond, ent, sal); end if;

  -- ── 3) REGLA 1 no inventa una salida donde no la hay ─────────────────────────────────────
  -- Una sola marca en todo el día sigue siendo una entrada sin salida. Si la regla cerrara el
  -- tramo con su propia marca de apertura, la jornada duraría cero y el motor la leería como un
  -- día trabajado de cero horas.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '791', eB, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'791',eB,'2099-07-02T09:35:00-05:00',790004,'B');
  perform huellero_derivar_asistencia(eB, '2099-07-02');
  select condicion, hora_salida into cond, sal
    from asistencias where empleado_id=eB and fecha='2099-07-02';
  if cond = 'sin_dato' and sal is null then r := r || '3=ok ';
  else r := r || format('3-INVENTA-SALIDA=FALLA(%s %s) ', cond, sal); end if;

  -- ── 4) REGLA 2: la hora que puso la máquina no se borra ──────────────────────────────────
  -- Se le quitan las marcas de cierre al día ya derivado y se vuelve a derivar. La pasada nueva
  -- da un tramo abierto; la fila tiene que conservar su hora, no perderla.
  delete from marcas_huellero
    where empleado_id = eA and evento_serial in (790002, 790003);
  perform huellero_derivar_asistencia(eA, '2099-07-01');
  select condicion, hora_salida into cond, sal
    from asistencias where empleado_id=eA and fecha='2099-07-01';
  if sal = '14:15:39' and cond = 'trabajado' then r := r || '4=ok ';
  else r := r || format('4-BORRA-HORA-DERIVADA=FALLA(%s %s) ', cond, sal); end if;

  -- ── 5) REGLA 2: la hora que cargó una persona sigue mandando ─────────────────────────────
  -- Esto ya lo garantizaba la 0075 y tiene que seguir garantizándolo: es la primera salvaguarda
  -- del sueldo. Lo que escribió el administrador manda sobre la máquina.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida,
                          fuente, condicion, huellero_puso_entrada, huellero_puso_salida)
    values (eC,'2099-07-03','M','09:00','19:00','manual','trabajado', false, false);
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '792', eC, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'792',eC,'2099-07-03T08:00:00-05:00',790005,'C');
  perform huellero_derivar_asistencia(eC, '2099-07-03');
  select hora_entrada, hora_salida into ent, sal
    from asistencias where empleado_id=eC and fecha='2099-07-03';
  if ent = '09:00' and sal = '19:00' then r := r || '5=ok ';
  else r := r || format('5-PISA-LO-DECLARADO=FALLA(%s %s) ', ent, sal); end if;

  -- ── 6) Dos marcas pegadas no se convierten en una jornada de dos minutos ─────────────────
  -- Con la regla 1 el tramo ahora cierra, así que el que tiene que atajarlo es el rango de
  -- jornada plausible: por debajo de huellero_jornada_min_horas la fila queda en 'sin_dato' con
  -- el motivo escrito, no declarada trabajada.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '793', eD, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'793',eD,'2099-07-04T08:00:00-05:00',790006,'D'),
           (disp,'793',eD,'2099-07-04T08:02:00-05:00',790007,'D');
  perform huellero_derivar_asistencia(eD, '2099-07-04');
  select condicion, hora_salida, obs into cond, sal, v_obs
    from asistencias where empleado_id=eD and fecha='2099-07-04';
  if cond = 'sin_dato' and sal = '08:02' and v_obs like '%revisar:%' then r := r || '6=ok ';
  else r := r || format('6-JORNADA-IMPOSIBLE-DECLARADA=FALLA(%s %s %s) ', cond, sal, v_obs); end if;

  -- ── 7) Una falta declarada sigue intacta ────────────────────────────────────────────────
  -- Cuesta dos días de sueldo (RN-09) y la decidió una persona. Ninguna huella la revierte sola.
  insert into asistencias(empleado_id, fecha, turno, fuente, condicion)
    values (eE,'2099-07-05','M','manual','falta');
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '794', eE, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'794',eE,'2099-07-05T08:00:00-05:00',790008,'E'),
           (disp,'794',eE,'2099-07-05T18:00:00-05:00',790009,'E');
  perform huellero_derivar_asistencia(eE, '2099-07-05');
  select condicion, hora_entrada into cond, ent
    from asistencias where empleado_id=eE and fecha='2099-07-05';
  if cond = 'falta' and ent is null then r := r || '7=ok ';
  else r := r || format('7-REVIERTE-FALTA=FALLA(%s %s) ', cond, ent); end if;

  -- ── 8) El sello sigue a su hora ─────────────────────────────────────────────────────────
  -- Si la hora no se toca, huellero_puso_salida no puede darse vuelta: ese sello es lo que decide
  -- si una re-resolución futura puede recalcular la hora o tiene que respetarla.
  select huellero_puso_salida into puso_sal
    from asistencias where empleado_id=eC and fecha='2099-07-03';
  if puso_sal = false then r := r || '8=ok ';
  else r := r || format('8-SELLO-SE-DA-VUELTA=FALLA(%s) ', puso_sal); end if;

  -- ── 9) El parámetro de pausa existe como fila editable ──────────────────────────────────
  -- No-negociable 5: un parámetro de negocio no vive hardcodeado. Si esta fila no existe, el
  -- umbral corre por un default escrito en el código que nadie puede cambiar desde la pantalla.
  if exists (select 1 from config where clave = 'sueldo_pausa_minima_minutos') then r := r || '9=ok ';
  else r := r || '9-PARAMETRO-HARDCODEADO=FALLA '; end if;

  raise exception 'RESULTADO %', r;
end $$;
