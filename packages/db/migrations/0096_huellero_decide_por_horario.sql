-- 0096_huellero_decide_por_horario.sql — el emparejado usa el horario contratado para resolver
-- una marca suelta, y separa el doble toque de la pausa real.
--
-- Implementa docs/superpowers/specs/asistencias/2026-08-25-huellero-decide-por-horario-design.md
-- §3, C-1, C-2 y C-5 (ítems B-2 a B-4 de la hoja de ruta del 25-ago). C-3 (relleno estimado) y
-- C-4 (falta automática con freno) van en la 0097: tocan qué se declara y qué se paga, y se
-- aplican y se miran con el administrador aparte (spec §7 «orden de implementación»).
--
-- ZONA CRÍTICA (no-negociable 1). huellero_derivar_asistencia es la puerta por la que entra el
-- 98,8 % de las filas de `asistencias`, y la asistencia es la base de la liquidación.
--
-- QUÉ CAMBIA, sin re-derivar ni una fila ya escrita (spec §4 — las ~1.105 filas existentes quedan
-- exactamente como están; esto vale para lo que se derive desde que se aplique):
--
--   C-1. La función resuelve el turno contratado del día — `sueldo_acuerdos` vigente para la
--   fecha (a lo sumo uno, lo garantiza `sueldo_acuerdos_sin_solape`) + `sueldo_acuerdo_turnos` de
--   ese día de la semana — y saca la hora de inicio más temprana y la de fin más tardía. Se usa
--   SÓLO cuando queda una marca suelta —un tramo con un solo lado—: se asigna al extremo del
--   turno que tenga más cerca. Si el día cierra en tramos pares, o no hay horario contratado,
--   nada cambia: no se inventa un horario (RN-17 sigue con su propio tratamiento).
--
--   C-2. La doble marca («8:00 y 8:01, se queda el más temprano») necesitaba un umbral MÁS CHICO
--   que la pausa de 15 minutos: los dos casos —doble toque y «salió y volvió»— caían en la misma
--   ventana y se pisaban, y en el CIERRE la regla vieja hacía lo contrario de lo pedido (cerraba
--   con la marca más tardía). Se agrega `huellero_doble_marca_minutos` (default 2) y se aplica
--   ANTES de armar los tramos, así la regla vale igual en la apertura y en el cierre. La pausa
--   real (`sueldo_pausa_minima_minutos`) sigue decidiendo igual entre 2 y 15 minutos — sin cambios.
--
--   C-5. `packages/core/src/huellero.ts` (`decidirAsistencia`) se borra en este commit, aparte de
--   esta migración (spec §3 C-5). Prometía un «test de paridad» contra este SQL que nunca existió,
--   y ya se había separado del modelo real (no tenía tramos ni pausa mínima — el modelo que la
--   0079 reemplazó). El emparejado del huellero vive SÓLO acá, en SQL: es lo único que corre en
--   producción, y mantener dos implementaciones de la misma regla en dos lenguajes es lo que
--   produjo la divergencia que este cambio cierra.
--
-- Las dos columnas `*_estimada` se agregan en esta migración para que la 0097 sólo toque la
-- función (spec §3 C-3): hasta que se aplique la 0097 quedan siempre en `false`, porque nada las
-- escribe todavía.
--
-- Idempotente: `create or replace` sobre la función, `add column if not exists`,
-- `insert ... on conflict do nothing`.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. `asistencias` ya la tiene
--     (0025) y esta migración no la toca.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).
--
-- Prueba: packages/db/pruebas/0096_huellero_decide_por_horario.prueba.sql

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Las dos columnas que distinguen «esta hora salió de una huella» de «el sistema la propuso»
--
--    `huellero_puso_entrada`/`salida` (0075) dicen «la máquina escribió esta hora», y eso es
--    cierto también para una hora que salió de una marca real. Falta la distinción más fina que
--    pide la spec §3 C-3: si la hora es una marca, o si el sistema la inventó porque no hubo
--    marca. Van acá aunque su lógica de escritura llegue en la 0097, para que esa migración sólo
--    toque la función.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table asistencias add column if not exists entrada_estimada boolean not null default false;
alter table asistencias add column if not exists salida_estimada  boolean not null default false;

comment on column asistencias.entrada_estimada is
  'true cuando la hora de entrada NO salió de una marca: la propuso el sistema a partir del
   horario contratado porque faltó la marca real (spec asistencias/2026-08-25-huellero-decide-
   por-horario-design.md §3 C-3, lógica de escritura en la migración 0097). false en todo lo
   demás, incluida cualquier fila de antes de esa migración. Se apaga sola cuando una persona
   escribe la hora a mano (asistencias-repo.ts) o cuando llega la marca real.';
comment on column asistencias.salida_estimada is
  'Lo mismo para la hora de salida. Son dos columnas y no una porque un día puede tener una
   entrada real y una salida estimada, o al revés.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) El parámetro nuevo de la doble marca (C-2)
--
--    DEFAULT 2: ELEGIDO por el implementador, no confirmado por el administrador. Es el umbral
--    más chico que resuelve el caso que él nombró («8:00 y 8:01») sin comerse la pausa real de 15
--    minutos. Anotado en docs/pendientes-negocio.md.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values ('huellero_doble_marca_minutos', '2')
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) La derivación: C-1 (horario contratado) + C-2 (doble marca, ventana separada de la pausa)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_derivar_asistencia(p_empleado_id uuid, p_fecha date)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_marcas          int;
  v_nombres         int;
  v_anonimas        int;
  v_pausa_min       numeric;
  v_doble_marca_min numeric;
  v_max_horas       numeric;
  v_min_horas       numeric;
  v_motivo          text := null;
  v_horario_ini     time;             -- C-1: hora de inicio más temprana del turno contratado
  v_horario_fin     time;             -- C-1: hora de fin más tardía del turno contratado
  v_marcas_dia      time[];           -- C-2: marcas del día ya deduplicadas por doble toque
  v_j               int;
  v_m_h             time;
  v_tramos          time[][];
  v_ent             time;
  v_sal             time;
  v_horas           numeric;
  v_n_tramos        int;
  v_turno           text;
  v_i               int;
  v_fila            asistencias%rowtype;
  v_nueva_ent       time;
  v_nueva_sal       time;
  m                 record;
  v_filas           uuid[];    -- las filas que YA existen ese día, por turno
  v_turnos          text[];
  v_abierto         time := null;   -- entrada del tramo que se está armando
  v_ultimo          time := null;   -- cierre tentativo del tramo abierto (puede volver a null)
  v_ultima          time := null;   -- la última marca vista, se haya descartado o no
  v_final_ent       time;
  v_final_sal       time;
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

  -- ── C-1 (spec §3): el horario contratado de ESE día, si existe ───────────────────────────
  --
  -- El acuerdo vigente para la fecha (a lo sumo uno, lo garantiza `sueldo_acuerdos_sin_solape`) y
  -- sus turnos de ese día de la semana. De ahí salen dos horas: la más temprana de inicio y la
  -- más tardía de fin. Sin acuerdo o sin turno ese día, las dos quedan en null y todo lo que
  -- sigue se comporta EXACTAMENTE como antes de esta migración — no se inventa un horario.
  select min(t.hora_inicio), max(t.hora_fin)
    into v_horario_ini, v_horario_fin
  from sueldo_acuerdos ac
  join sueldo_acuerdo_turnos t on t.acuerdo_id = ac.id
  where ac.empleado_id = p_empleado_id
    and p_fecha between ac.fecha_inicio and ac.fecha_fin
    and t.dia_semana = extract(isodow from p_fecha);

  -- ── C-2 (spec §3): colapsar el doble toque ANTES de armar los tramos ─────────────────────
  --
  -- Por qué acá y no dentro del emparejado de siempre: la pausa de 15 minutos ya descartaba una
  -- marca pegada a la ENTRADA, pero en el CIERRE hacía lo contrario de lo que pidió el
  -- administrador — con 8:00pm y 8:01pm al final del día, el tramo se cerraba con la ÚLTIMA marca
  -- (8:01), no con la primera (regla REGLA 1 de la 0079, pensada para otro caso). Deduplicar
  -- antes de emparejar hace que la regla del doble toque valga igual en la apertura y en el
  -- cierre, sin tocar la pausa real: sigue siendo `sueldo_pausa_minima_minutos`, sin cambios,
  -- decidiendo entre 2 y 15 minutos.
  select coalesce(nullif(btrim(c.valor), '')::numeric, 2) into v_doble_marca_min
    from config c where c.clave = 'huellero_doble_marca_minutos';
  v_doble_marca_min := coalesce(v_doble_marca_min, 2);

  v_marcas_dia := array[]::time[];
  for m in
    select (mk.marcada_en at time zone 'America/Lima')::time as h
    from marcas_huellero mk
    where mk.empleado_id = p_empleado_id
      and (mk.marcada_en at time zone 'America/Lima')::date = p_fecha
    order by mk.marcada_en
  loop
    if array_length(v_marcas_dia, 1) is null
       or extract(epoch from (m.h - v_marcas_dia[array_length(v_marcas_dia, 1)])) / 60.0
          >= v_doble_marca_min
    then
      v_marcas_dia := v_marcas_dia || m.h;
    end if;
    -- Si está más cerca que el umbral: se descarta. La marca anterior —la más temprana— manda.
  end loop;

  select coalesce(nullif(btrim(c.valor), '')::numeric, 15) into v_pausa_min
    from config c where c.clave = 'sueldo_pausa_minima_minutos';
  v_pausa_min := coalesce(v_pausa_min, 15);

  -- ── Emparejar las marcas (ya deduplicadas por C-2) en TRAMOS ──────────────────────────────
  --
  -- Mismo emparejado de la 0079 (pausa mínima, REGLA 1 incluida), sólo que ahora recorre
  -- `v_marcas_dia` en vez de volver a consultar `marcas_huellero`: la deduplicación de C-2 ya
  -- pasó y no se vuelve a tocar acá.
  v_tramos := array[]::time[][];
  for v_j in 1 .. coalesce(array_length(v_marcas_dia, 1), 0) loop
    v_m_h := v_marcas_dia[v_j];
    if v_abierto is null then
      v_abierto := v_m_h;                        -- abre un tramo
    elsif v_ultimo is null then
      if extract(epoch from (v_m_h - v_abierto)) / 60.0 >= v_pausa_min then
        v_ultimo := v_m_h;                       -- lo cierra, por ahora
      end if;
    else
      if extract(epoch from (v_m_h - v_ultimo)) / 60.0 < v_pausa_min then
        v_ultimo := null;                        -- volvió enseguida: se reabre
      else
        v_tramos := v_tramos || array[array[v_abierto, v_ultimo]];
        v_abierto := v_m_h;
        v_ultimo  := null;
      end if;
    end if;
    v_ultima := v_m_h;   -- se guarda siempre, incluso cuando la marca se descartó arriba
  end loop;

  -- REGLA 1 (0079): un tramo que quedó abierto porque su cierre se descartó por venir dentro de
  -- la pausa mínima se cierra con esa misma marca.
  if v_abierto is not null and v_ultimo is null and v_ultima > v_abierto then
    v_ultimo := v_ultima;
  end if;

  if v_abierto is not null then
    v_tramos := v_tramos || array[array[v_abierto, v_ultimo]];
  end if;

  v_n_tramos := coalesce(array_length(v_tramos, 1), 0);
  if v_n_tramos = 0 then return; end if;

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
  select array_agg(a.id order by a.turno), array_agg(a.turno order by a.turno)
    into v_filas, v_turnos
  from asistencias a
  where a.empleado_id = p_empleado_id and a.fecha = p_fecha;

  for v_i in 1..v_n_tramos loop
    v_ent := v_tramos[v_i][1];
    v_sal := v_tramos[v_i][2];

    -- ── C-1 (spec §3): la marca suelta se asigna al extremo del turno que tenga más cerca ────
    --
    -- Sólo puede quedar suelto el ÚLTIMO tramo del día: los anteriores se cierran siempre con
    -- las dos marcas dentro del bucle de arriba. Hasta hoy se asumía SIEMPRE que una marca suelta
    -- era una entrada sin su salida. Con horario contratado se compara la distancia de esa marca
    -- a la hora de inicio y a la hora de fin del turno: la que esté más cerca gana. Ejemplo de la
    -- spec: una marca a las 20:20 con turno 14:00–20:00 está a 20 min de la salida y a 6 h 20 de
    -- la entrada → es una salida, falta la entrada (no se rellena acá: eso es C-3, migración
    -- 0097 — acá sólo se decide a qué extremo pertenece).
    if v_sal is null and v_ent is not null and v_horario_ini is not null then
      if abs(extract(epoch from (v_ent - v_horario_fin)))
         < abs(extract(epoch from (v_ent - v_horario_ini)))
      then
        v_sal := v_ent;
        v_ent := null;
      end if;
      -- Empate o más cerca de la entrada: no se toca. Mismo comportamiento que antes de esta
      -- migración (la marca sigue siendo la entrada, falta la salida).
    end if;

    -- El turno sólo se elige al CREAR una fila nueva; si ya hay una, se respeta el suyo.
    v_turno := coalesce(v_turnos[v_i],
                        case when 'M' = any(coalesce(v_turnos, array[]::text[])) then 'T' else 'M' end);

    -- SALVAGUARDA (c): un tramo que no puede ser cierto se guarda con sus horas reales pero NO se
    -- declara trabajado. Con `v_ent` en null (C-1 reasignó la marca a salida) esto no dispara: la
    -- resta contra null da null y el `if` la trata como falso, así que no queda ningún motivo
    -- puesto por una hora que todavía no existe.
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
              -- Antes bastaba con mirar `v_sal`: `v_ent` siempre estaba puesto. Con C-1 un tramo
              -- puede quedar con la salida sola y la entrada en null, así que 'trabajado' exige
              -- las DOS — es lo que ya exigía `asistencias_trabajado_chk`, ahora explícito acá.
              case when v_ent is not null and v_sal is not null and v_motivo is null
                   then 'trabajado' else 'sin_dato' end,
              coalesce(v_motivo, 'auto: huellero'),
              v_ent is not null, v_sal is not null)
      on conflict (empleado_id, fecha, turno) do nothing;
      continue;
    end if;

    -- SALVAGUARDA (b): sólo se rellena lo que está vacío. Las horas que puso la propia máquina sí
    -- se recalculan.
    v_nueva_ent := case when v_fila.huellero_puso_entrada then v_ent
                        else coalesce(v_fila.hora_entrada, v_ent) end;
    v_nueva_sal := case when v_fila.huellero_puso_salida  then v_sal
                        else coalesce(v_fila.hora_salida,  v_sal)  end;

    -- REGLA 2 (0079): ninguna escritura deja en null una hora que ya estaba cargada.
    v_final_ent := coalesce(v_nueva_ent, v_fila.hora_entrada);
    v_final_sal := coalesce(v_nueva_sal, v_fila.hora_salida);

    -- Rellenar no puede dejar la salida antes que la entrada: la liquidación después no cierra.
    if v_final_ent is not null and v_final_sal is not null and v_final_sal <= v_final_ent then
      continue;
    end if;

    if v_fila.condicion = 'trabajado' and (v_final_ent is null or v_final_sal is null) then
      v_motivo := coalesce(v_motivo, 'revisar: la jornada quedó sin una de sus dos horas');
    end if;

    update asistencias a
       set hora_entrada = v_final_ent,
           hora_salida  = v_final_sal,
           huellero_puso_entrada = case when v_nueva_ent is null then a.huellero_puso_entrada
                                        else (a.huellero_puso_entrada or a.hora_entrada is null) end,
           huellero_puso_salida  = case when v_nueva_sal is null then a.huellero_puso_salida
                                        else (a.huellero_puso_salida  or a.hora_salida  is null) end,
           condicion = case
             when a.condicion = 'sin_dato'
              and v_final_ent is not null and v_final_sal is not null and v_motivo is null
             then 'trabajado'
             when a.condicion = 'trabajado' and (v_final_ent is null or v_final_sal is null)
             then 'sin_dato'
             else a.condicion
           end,
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
  'Marcas de un empleado en un día → filas de asistencia, una por tramo. Desde la 0096 usa el
   horario contratado (sueldo_acuerdo_turnos) para decidir a qué extremo pertenece una marca
   suelta (C-1) y colapsa el doble toque antes de emparejar, con un umbral propio y separado de
   la pausa real (C-2). No toca un día con falta declarada, no pisa horas cargadas, nunca deja en
   null una hora que ya estaba, y no declara trabajada una jornada imposible: la deja en sin_dato
   con el motivo para que la mire una persona. El emparejado del huellero vive SÓLO acá —
   packages/core/src/huellero.ts se borró en este commit (C-5): mantener dos implementaciones de
   la misma regla en dos lenguajes es lo que las hizo divergir sin que nada lo marcara.';
