-- ⛔ NO APLICADA A PRODUCCIÓN — a propósito, 25-ago-2026. LEER ESTO ANTES DE APLICARLA.
--
-- Está escrita, revisada y con su prueba, pero NO se aplicó contra `scilb`. Falta una pieza, y sin
-- ella esta migración reintroduce exactamente el defecto que la `0085` vino a cerrar:
--
--   C-3 hace que un día con una hora estimada DEJE DE CORTAR la liquidación (hoy queda `sin_dato`
--   y la corta, nombrando la fecha). Eso es lo que pidió el administrador y está bien — PERO el
--   detalle de la liquidación todavía NO nombra las horas estimadas. O sea: se pagaría un día cuya
--   hora inventó la máquina, y quien firma el pago no lo vería en el momento de firmarlo. Lo vería
--   sólo si entra aparte a la pantalla de asistencia.
--
--   La `0085` existe justamente porque un día a medio declarar antes se pagaba en silencio, y era
--   el único camino del sistema que pagaba de menos sin avisar. Aplicar esta migración sin que el
--   detalle de la liquidación diga «esta hora la puso el sistema» sería volver a abrir esa puerta,
--   ahora del otro lado (pagando de más, o pagando algo que nadie declaró).
--
-- QUÉ FALTA, EXACTAMENTE: que el detalle de una liquidación —`/sueldos/liquidaciones`, la vista de
-- una liquidación cerrada y su comprobante— nombre los días con `entrada_estimada` o
-- `salida_estimada` en true. Cuando eso esté, esta migración se aplica y se corre su prueba.
--
-- Está commiteada igual, en vez de quedarse suelta, porque el código ya está revisado y perderlo
-- sería peor. El estado también está anotado en docs/pendientes-negocio.md.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 0097_huellero_relleno_estimado_y_falta.sql — rellena lo que falta con el horario contratado
-- (marcado como estimado) y declara falta automática cuando no hay ninguna marca, con un freno
-- para el día que falla el equipo.
--
-- Implementa docs/superpowers/specs/asistencias/2026-08-25-huellero-decide-por-horario-design.md
-- §3, C-3 y C-4 (ítems B-5 y B-6 de la hoja de ruta del 25-ago). Sigue a la 0096 (C-1 horario +
-- C-2 doble marca), que dejó las columnas `entrada_estimada`/`salida_estimada` ya creadas.
--
-- ZONA CRÍTICA (no-negociable 1). Acá es donde un día deja de cortar la liquidación (C-3) y donde
-- aparece la falta automática (C-4), que cuesta dos días de sueldo (RN-09). Se aplica y se mira
-- con el administrador antes de la primera liquidación que use datos derivados por esta regla
-- (spec §7).
--
-- QUÉ CAMBIA, sin re-derivar ni una fila ya escrita (spec §4):
--
--   C-3. Cuando falta un extremo (entrada o salida) y HAY horario contratado, la función lo
--   completa con la hora del turno, marca la bandera `entrada_estimada`/`salida_estimada`
--   correspondiente en `true`, dice el motivo en `obs`, y la condición pasa a 'trabajado' — ya no
--   hay un dato ausente, hay uno propuesto y marcado como tal. Sin horario contratado no se
--   estima nada: sigue en 'sin_dato' como hasta ahora (no se inventa una hora sin contra qué
--   compararla).
--
--   C-4. Cero marcas en un día con turno contratado pasa a ser 'falta' — pero con freno: si en
--   esa misma fecha hay MÁS de `huellero_falta_auto_max_personas` (🆕, default 2) personas con
--   turno contratado y cero marcas, no se declara falta a NINGUNA — parece una caída del equipo,
--   no faltas individuales, y esas filas quedan en 'sin_dato' con el motivo en `obs` para que el
--   administrador las resuelva a mano.
--
--   ⚠️ NOTA DE DISEÑO IMPORTANTE, para quien retome esto — ver también docs/pendientes-negocio.md.
--   `huellero_derivar_asistencia` es por (empleado, fecha) y sólo se invoca —desde
--   `huellero_registrar_marcas`— para quien SÍ dejó alguna marca ese día. El freno de C-4
--   necesita lo contrario: contar, PARA UNA FECHA, a cuántas personas con turno contratado no les
--   llegó ni una marca. Ese conteo no cabe en una función que arranca sabiendo el empleado, así
--   que C-4 se implementa en una función NUEVA y separada, `huellero_declarar_faltas_del_dia
--   (p_fecha date)`, que recorre todos los empleados de esa fecha. Nada la llama todavía: un día
--   sin ninguna marca no aparece en NINGÚN lote del colector (no hay marcas que lo mencionen), así
--   que no hay forma de dispararla desde `huellero_registrar_marcas` — hace falta un disparador
--   que mire el calendario, no las marcas (un cron diario para «ayer», o un botón manual). Cuál de
--   los dos y con qué hora Perú es una decisión de negocio que no está tomada; queda anotada, no
--   improvisada.
--
-- QUÉ NO CAMBIA: `0084_huellero_respeta_dato_humano` sigue intacta — ninguna hora de autor humano
-- se pisa, ni siquiera para estimarla (probado en la prueba de esta migración, caso 9).
--
-- Idempotente: `create or replace` sobre las dos funciones, `insert ... on conflict do nothing`.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).
--
-- Prueba: packages/db/pruebas/0097_huellero_relleno_estimado_y_falta.prueba.sql

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) El parámetro nuevo del freno (C-4)
--
--    DEFAULT 2: ELEGIDO por el implementador, no confirmado por el administrador. Sale de que las
--    faltas reales son individuales y las caídas del equipo son colectivas — dos personas
--    faltando el mismo día es normal, once no lo es nunca. Anotado en docs/pendientes-negocio.md.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values ('huellero_falta_auto_max_personas', '2')
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) La derivación: agrega C-3 (relleno estimado) sobre lo que dejó la 0096 (C-1 + C-2)
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
  v_horario_ini     time;
  v_horario_fin     time;
  v_marcas_dia      time[];
  v_j               int;
  v_m_h             time;
  v_tramos          time[][];
  v_ent             time;
  v_sal             time;
  v_ent_estimada    boolean;   -- C-3: esta pasada rellenó la entrada con el horario, no con una marca
  v_sal_estimada    boolean;   -- C-3: ídem para la salida
  v_horas           numeric;
  v_n_tramos        int;
  v_turno           text;
  v_i               int;
  v_fila            asistencias%rowtype;
  v_nueva_ent       time;
  v_nueva_sal       time;
  v_nueva_ent_est   boolean;
  v_nueva_sal_est   boolean;
  v_final_ent       time;
  v_final_sal       time;
  v_final_ent_est   boolean;
  v_final_sal_est   boolean;
  v_obs_extra       text;
  m                 record;
  v_filas           uuid[];
  v_turnos          text[];
  v_abierto         time := null;
  v_ultimo          time := null;
  v_ultima          time := null;
begin
  if p_empleado_id is null or p_fecha is null then return; end if;

  -- SALVAGUARDA (a): una falta declarada protege el DÍA entero, no una fila.
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

  if v_marcas = 0 then return; end if;   -- cero marcas es C-4, y vive en otra función (ver arriba)

  if v_nombres > 1 or (v_nombres >= 1 and v_anonimas > 0) then
    v_motivo := 'revisar: el identificador tiene más de un nombre este día (posible reasignación)';
  end if;

  -- C-1 (0096): el horario contratado de ESE día, si existe.
  select min(t.hora_inicio), max(t.hora_fin)
    into v_horario_ini, v_horario_fin
  from sueldo_acuerdos ac
  join sueldo_acuerdo_turnos t on t.acuerdo_id = ac.id
  where ac.empleado_id = p_empleado_id
    and p_fecha between ac.fecha_inicio and ac.fecha_fin
    and t.dia_semana = extract(isodow from p_fecha);

  -- C-2 (0096): colapsar el doble toque ANTES de armar los tramos.
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
  end loop;

  select coalesce(nullif(btrim(c.valor), '')::numeric, 15) into v_pausa_min
    from config c where c.clave = 'sueldo_pausa_minima_minutos';
  v_pausa_min := coalesce(v_pausa_min, 15);

  v_tramos := array[]::time[][];
  for v_j in 1 .. coalesce(array_length(v_marcas_dia, 1), 0) loop
    v_m_h := v_marcas_dia[v_j];
    if v_abierto is null then
      v_abierto := v_m_h;
    elsif v_ultimo is null then
      if extract(epoch from (v_m_h - v_abierto)) / 60.0 >= v_pausa_min then
        v_ultimo := v_m_h;
      end if;
    else
      if extract(epoch from (v_m_h - v_ultimo)) / 60.0 < v_pausa_min then
        v_ultimo := null;
      else
        v_tramos := v_tramos || array[array[v_abierto, v_ultimo]];
        v_abierto := v_m_h;
        v_ultimo  := null;
      end if;
    end if;
    v_ultima := v_m_h;
  end loop;

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

  select array_agg(a.id order by a.turno), array_agg(a.turno order by a.turno)
    into v_filas, v_turnos
  from asistencias a
  where a.empleado_id = p_empleado_id and a.fecha = p_fecha;

  for v_i in 1..v_n_tramos loop
    v_ent := v_tramos[v_i][1];
    v_sal := v_tramos[v_i][2];
    v_ent_estimada := false;
    v_sal_estimada := false;

    -- C-1 (0096, sin cambios): la marca suelta se asigna al extremo del turno que tenga más cerca.
    if v_sal is null and v_ent is not null and v_horario_ini is not null then
      if abs(extract(epoch from (v_ent - v_horario_fin)))
         < abs(extract(epoch from (v_ent - v_horario_ini)))
      then
        v_sal := v_ent;
        v_ent := null;
      end if;
    end if;

    -- ── C-3 (spec §3): falta un extremo y hay horario contratado — se completa, marcado ──────
    -- como estimado.
    --
    -- `v_motivo` NO se toca acá a propósito: si se usara para esto bloquearía la transición a
    -- 'trabajado' de más abajo (exige `v_motivo is null`) y el día seguiría cortando la
    -- liquidación — justo lo que esta regla existe para dejar de hacer. El aviso se compone en
    -- `obs` más abajo, a partir de las banderas `*_estimada` YA CONFIRMADAS por el estado final
    -- (después de las salvaguardas de abajo), no acá: así nunca dice «estimado» sobre una hora
    -- que en realidad ganó una protegida por REGLA 2 (ver caso 9 de la prueba).
    if v_horario_ini is not null then
      if v_ent is null and v_sal is not null then
        v_ent := v_horario_ini;
        v_ent_estimada := true;
      elsif v_sal is null and v_ent is not null then
        v_sal := v_horario_fin;
        v_sal_estimada := true;
      end if;
    end if;
    -- Sin horario contratado, no se estima nada: sigue en sin_dato, igual que antes de esta
    -- migración — inventar una hora sin contra qué es adivinar, y adivinar en una asistencia es
    -- adivinar en un pago.

    v_turno := coalesce(v_turnos[v_i],
                        case when 'M' = any(coalesce(v_turnos, array[]::text[])) then 'T' else 'M' end);

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
                               huellero_puso_entrada, huellero_puso_salida,
                               entrada_estimada, salida_estimada)
      values (p_empleado_id, p_fecha, v_turno, v_ent, v_sal,
              0,
              'huellero',
              case when v_ent is not null and v_sal is not null and v_motivo is null
                   then 'trabajado' else 'sin_dato' end,
              coalesce(nullif(concat_ws(' · ', v_motivo,
                case when v_ent_estimada then
                  'estimado: no marcó la entrada, se completó con la hora del turno contratado' end,
                case when v_sal_estimada then
                  'estimado: no marcó la salida, se completó con la hora del turno contratado' end
              ), ''), 'auto: huellero'),
              v_ent is not null, v_sal is not null,
              v_ent_estimada, v_sal_estimada)
      on conflict (empleado_id, fecha, turno) do nothing;
      continue;
    end if;

    -- SALVAGUARDA (b): sólo se rellena lo que está vacío.
    v_nueva_ent := case when v_fila.huellero_puso_entrada then v_ent
                        else coalesce(v_fila.hora_entrada, v_ent) end;
    v_nueva_sal := case when v_fila.huellero_puso_salida  then v_sal
                        else coalesce(v_fila.hora_salida,  v_sal)  end;

    -- Las banderas *_estimada siguen EXACTAMENTE la misma prioridad que sus horas: si esta pasada
    -- recalcula la hora (porque la máquina ya la tenía, o porque estaba vacía), la bandera es la
    -- de esta pasada; si la hora protegida es la que ya había (humana o previamente estimada), la
    -- bandera es la que ya había.
    v_nueva_ent_est := case when v_fila.huellero_puso_entrada then v_ent_estimada
                            when v_fila.hora_entrada is not null then v_fila.entrada_estimada
                            else v_ent_estimada end;
    v_nueva_sal_est := case when v_fila.huellero_puso_salida then v_sal_estimada
                            when v_fila.hora_salida is not null then v_fila.salida_estimada
                            else v_sal_estimada end;

    -- REGLA 2 (0079): ninguna escritura deja en null una hora que ya estaba cargada.
    v_final_ent := coalesce(v_nueva_ent, v_fila.hora_entrada);
    v_final_sal := coalesce(v_nueva_sal, v_fila.hora_salida);
    v_final_ent_est := case when v_nueva_ent is not null then v_nueva_ent_est else v_fila.entrada_estimada end;
    v_final_sal_est := case when v_nueva_sal is not null then v_nueva_sal_est else v_fila.salida_estimada end;

    if v_final_ent is not null and v_final_sal is not null and v_final_sal <= v_final_ent then
      continue;
    end if;

    if v_fila.condicion = 'trabajado' and (v_final_ent is null or v_final_sal is null) then
      v_motivo := coalesce(v_motivo, 'revisar: la jornada quedó sin una de sus dos horas');
    end if;

    -- El aviso de «estimado» se arma con las banderas FINALES (post protección), no con las de
    -- esta pasada: si una hora humana protegida por REGLA 2 ganó, no hay nada que avisar sobre
    -- ella aunque esta pasada haya tanteado una estimación que terminó descartada.
    v_obs_extra := nullif(concat_ws(' · ', v_motivo,
      case when v_final_ent_est then
        'estimado: no marcó la entrada, se completó con la hora del turno contratado' end,
      case when v_final_sal_est then
        'estimado: no marcó la salida, se completó con la hora del turno contratado' end
    ), '');

    update asistencias a
       set hora_entrada = v_final_ent,
           hora_salida  = v_final_sal,
           entrada_estimada = v_final_ent_est,
           salida_estimada  = v_final_sal_est,
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
             when v_obs_extra is null then a.obs
             when coalesce(a.obs, '') like '%' || v_obs_extra || '%' then a.obs
             else nullif(btrim(concat_ws(' · ', nullif(a.obs, ''), v_obs_extra)), '')
           end
     where a.id = v_fila.id;
  end loop;
end;
$fn$;

comment on function huellero_derivar_asistencia(uuid, date) is
  'Marcas de un empleado en un día → filas de asistencia, una por tramo. Usa el horario
   contratado para decidir a qué extremo pertenece una marca suelta (C-1, 0096) y colapsa el
   doble toque antes de emparejar (C-2, 0096). Desde la 0097, cuando falta un extremo y hay
   horario contratado lo completa marcándolo estimado y el día pasa a trabajado (C-3) — sin
   horario no estima nada. No toca un día con falta declarada, no pisa horas ni banderas de autor
   humano, nunca deja en null una hora que ya estaba, y no declara trabajada una jornada
   imposible. El cero-marcas (C-4) vive en huellero_declarar_faltas_del_dia, no acá.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Cero marcas es falta, con freno anti-caída del equipo (C-4)
--
--    POR QUÉ ES UNA FUNCIÓN APARTE Y NO PARTE DE huellero_derivar_asistencia. Esa función es por
--    (empleado, fecha) y sólo se invoca —desde huellero_registrar_marcas— para empleados que SÍ
--    dejaron alguna marca ese día. El freno de C-4 necesita lo contrario: contar, PARA UNA FECHA,
--    a cuántas personas con turno contratado NO les llegó ni una marca. Ese conteo no cabe en una
--    función que arranca sabiendo el empleado.
--
--    QUIÉN LA LLAMA. Todavía nadie en este commit — ver la nota de cabecera de esta migración y
--    docs/pendientes-negocio.md. Queda con guard de administrador y grant a `authenticated`, lista
--    para que el administrador la invoque (o para conectarla a un disparador) sin ser código
--    muerto: revocarla del todo la habría dejado sin ningún camino de llamada real, que es
--    exactamente el defecto que esta misma spec vino a limpiar en C-5.
--
--    QUÉ NO TOCA. Cualquier empleado con alguna marca ese día (lo procesa la otra función), con
--    una fila ya declarada 'trabajado'/'falta', o con CUALQUIER hora ya cargada —humana o
--    estimada— para esa fecha: ninguno de esos casos es "cero marcas sin nada encima", así que
--    ninguno se toca acá. Es la misma cautela de la 0084: no perder nunca un dato de autor humano.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_declarar_faltas_del_dia(p_fecha date)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_max        numeric;
  v_pendientes uuid[];
  v_n          int;
  v_frenado    boolean;
  v_obs        text;
  v_faltas     int := 0;
  emp          uuid;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede declarar faltas automáticas';
  end if;
  if p_fecha is null then
    raise exception 'DATO:falta la fecha';
  end if;

  select coalesce(nullif(btrim(c.valor), '')::numeric, 2) into v_max
    from config c where c.clave = 'huellero_falta_auto_max_personas';
  v_max := coalesce(v_max, 2);

  -- Con turno contratado ese día, cero marcas, y ninguna hora o declaración ya cargada. Cualquier
  -- rastro humano —una hora, un 'trabajado', una 'falta' ya declarada— saca al empleado de la
  -- lista antes de decidir nada: este freno sólo puede tocar un día completamente vacío.
  select array_agg(distinct ac.empleado_id) into v_pendientes
  from sueldo_acuerdos ac
  join sueldo_acuerdo_turnos t
    on t.acuerdo_id = ac.id and t.dia_semana = extract(isodow from p_fecha)
  where p_fecha between ac.fecha_inicio and ac.fecha_fin
    and not exists (
      select 1 from marcas_huellero m
      where m.empleado_id = ac.empleado_id
        and (m.marcada_en at time zone 'America/Lima')::date = p_fecha
    )
    and not exists (
      select 1 from asistencias a
      where a.empleado_id = ac.empleado_id
        and a.fecha = p_fecha
        and (a.condicion in ('trabajado', 'falta')
             or a.hora_entrada is not null or a.hora_salida is not null)
    );

  v_n := coalesce(array_length(v_pendientes, 1), 0);
  if v_n = 0 then
    return jsonb_build_object('personas', 0, 'faltas_declaradas', 0, 'frenado', false);
  end if;

  -- El freno (spec §3 C-4): once personas sin marcar el mismo día es el equipo caído, no once
  -- faltas. Las faltas reales son individuales; las caídas del equipo, colectivas.
  v_frenado := v_n > v_max;
  v_obs := case when v_frenado
    -- Empieza con «revisar:» a propósito: es el mismo marcador que ya usa el resto de esta
    -- función para «esto necesita que lo mire una persona», y es lo que hace que
    -- listarDiasPendientes() (apps/erp-web/lib/huellero-repo.ts) la muestre en la pantalla del
    -- huellero sin tener que tocar ese archivo.
    then 'revisar: varias personas sin marcas el mismo día: parece falla del equipo, no faltas'
    else 'auto: sin ninguna marca del huellero ese día'
  end;

  foreach emp in array v_pendientes loop
    insert into asistencias (empleado_id, fecha, turno, fuente, condicion, falta_justificada, obs)
    values (emp, p_fecha, 'M', 'huellero',
            case when v_frenado then 'sin_dato' else 'falta' end,
            false, v_obs)
    on conflict (empleado_id, fecha, turno) do update
       set condicion = case when v_frenado then 'sin_dato' else 'falta' end,
           obs = case
             when coalesce(asistencias.obs, '') like '%' || v_obs || '%' then asistencias.obs
             else nullif(btrim(concat_ws(' · ', nullif(asistencias.obs, ''), v_obs)), '')
           end
     -- Segunda red: si entre el select de arriba y este insert alguien declaró o cargó una hora,
     -- no se pisa. Sólo se escribe sobre lo que sigue completamente vacío.
     where asistencias.condicion = 'sin_dato'
       and asistencias.hora_entrada is null and asistencias.hora_salida is null;

    if not v_frenado then
      v_faltas := v_faltas + 1;
    end if;
  end loop;

  return jsonb_build_object('personas', v_n, 'faltas_declaradas', v_faltas, 'frenado', v_frenado);
end;
$fn$;

comment on function huellero_declarar_faltas_del_dia(date) is
  'Para una fecha: declara falta a quien tenía turno contratado y cero marcas del huellero, salvo
   que sean más de huellero_falta_auto_max_personas — ahí se frena, nadie pierde el día, y las
   filas quedan en sin_dato con el motivo para que el administrador las revise (spec
   asistencias/2026-08-25-huellero-decide-por-horario-design.md §3 C-4). Nunca toca una hora ya
   cargada ni una fila ya declarada. Nadie la llama todavía — ver la cabecera de esta migración y
   docs/pendientes-negocio.md.';

revoke execute on function huellero_declarar_faltas_del_dia(date) from public, anon;
grant  execute on function huellero_declarar_faltas_del_dia(date) to authenticated;
