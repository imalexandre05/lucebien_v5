-- 0163_huellero_marca_extremo_cercano.sql — cada marca suelta va a la entrada o salida más cercana
-- de cualquier turno del día; lo que falta queda «Pendiente de resolver» (sin estimar); y una RPC
-- para volver a leer las marcas de un rango.
--
-- Implementa docs/superpowers/specs/asistencias/2026-10-18-huellero-marca-extremo-cercano-design.md
-- (decisión del dueño n.º 3, 18-oct-2026). Enmienda C-1 y C-3 de la spec del 25-ago (0096/0097).
--
-- ZONA CRÍTICA (no-negociable 1): la asistencia es la base del pago por horas.
--
-- QUÉ CAMBIA (sin re-derivar nada al aplicarse):
--   R1. La marca suelta se compara con los extremos de TODOS los turnos del día, no sólo con el
--       inicio más temprano y el fin más tardío.
--   R2. Ya no se completa el lado que falta con la hora del horario (se retira C-3): la fila queda
--       'sin_dato' con `obs` «pendiente: falta la hora de entrada|salida».
--   R3. Una hora puesta por la máquina se vacía si esta pasada pone esa misma marca del otro lado.
--   R4. huellero_rederivar(empleado, desde, hasta): vuelve a leer los días con marcas, salta los
--       que caen en un pago cerrado. Sólo administrador.
--
-- QUÉ NO CAMBIA: C-2 (doble toque), C-4 (huellero_declarar_faltas_del_dia), la salvaguarda de un
-- día con falta, las horas de autor humano (0084), las filas ya escritas y lo ya pagado.
--
-- Idempotente: `create or replace` y revoke/grant.
--
-- Prueba: packages/db/pruebas/0163_huellero_marca_extremo_cercano.prueba.sql

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) La derivación (cuerpo de la 0097 con R1, R2, R3 y el turno del segundo tramo)
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
  v_ext_h           time[];    -- R1 (0163): los extremos (inicio y fin) de TODOS los turnos del día
  v_ext_fin         boolean[]; -- R1: true si el extremo es un fin (salida)
  v_k               int;
  v_mejor           int;
  v_dist            numeric;
  v_mejor_dist      numeric;
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
  v_obs_base        text;
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

  -- R1 (0163, reemplaza C-1 de la 0096): los extremos de TODOS los turnos contratados de ese día.
  -- Antes se miraba sólo el inicio más temprano y el fin más tardío, y con dos turnos una salida
  -- del mediodía quedaba más cerca del inicio de la mañana que del fin de la tarde.
  select array_agg(x.h order by x.h, x.es_fin), array_agg(x.es_fin order by x.h, x.es_fin)
    into v_ext_h, v_ext_fin
  from (
    select t.hora_inicio as h, false as es_fin
      from sueldo_acuerdos ac join sueldo_acuerdo_turnos t on t.acuerdo_id = ac.id
     where ac.empleado_id = p_empleado_id and p_fecha between ac.fecha_inicio and ac.fecha_fin
       and t.dia_semana = extract(isodow from p_fecha)
    union all
    select t.hora_fin, true
      from sueldo_acuerdos ac join sueldo_acuerdo_turnos t on t.acuerdo_id = ac.id
     where ac.empleado_id = p_empleado_id and p_fecha between ac.fecha_inicio and ac.fecha_fin
       and t.dia_semana = extract(isodow from p_fecha)
  ) x;

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

    -- R1 (0163): la marca suelta va al extremo más cercano de cualquier turno del día. Si ese
    -- extremo es un fin, la marca es la salida. Empate: entrada (el primero en el orden).
    if v_sal is null and v_ent is not null and v_ext_h is not null then
      v_mejor := null;
      for v_k in 1 .. array_length(v_ext_h, 1) loop
        v_dist := abs(extract(epoch from (v_ent - v_ext_h[v_k])));
        if v_mejor is null or v_dist < v_mejor_dist then
          v_mejor := v_k;
          v_mejor_dist := v_dist;
        end if;
      end loop;
      if v_ext_fin[v_mejor] then
        v_sal := v_ent;
        v_ent := null;
      end if;
    end if;

    -- R2 (0163, retira C-3 de la 0097): lo que falta NO se completa con el horario. Con pago por
    -- horas reales (decisión del dueño n.º 1, 18-oct-2026) una hora que nadie marcó no se paga sola:
    -- queda «Pendiente de resolver» y la resuelve el administrador. v_ent_estimada/v_sal_estimada
    -- quedan siempre en false en esta pasada.

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
                case when v_ent is null and v_sal is not null then 'pendiente: falta la hora de entrada' end,
                case when v_sal is null and v_ent is not null then 'pendiente: falta la hora de salida' end
              ), ''), 'auto: huellero'),
              v_ent is not null, v_sal is not null,
              v_ent_estimada, v_sal_estimada)
      on conflict (empleado_id, fecha, turno) do nothing;
      -- 0163: el turno recién usado cuenta para el tramo siguiente. Sin esto, una derivación que
      -- ve los dos tramos de una vez (p. ej. huellero_rederivar) mandaba los dos a 'M' y el segundo
      -- terminaba pisando al primero y descartándose.
      v_turnos := coalesce(v_turnos, array[]::text[]) || v_turno;
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

    -- R3 (0163): excepción acotada a la REGLA 2. Si la hora vieja la puso la máquina y esta pasada
    -- coloca esa MISMA marca del otro lado, el lado viejo se vacía: la marca no se pierde, cambia de
    -- lado. Una hora escrita por una persona nunca entra acá (huellero_puso_* = false).
    if v_nueva_ent is null and v_fila.huellero_puso_entrada and not v_fila.entrada_estimada
       and v_fila.hora_entrada is not null and v_final_sal = v_fila.hora_entrada then
      v_final_ent := null;
    end if;
    if v_nueva_sal is null and v_fila.huellero_puso_salida and not v_fila.salida_estimada
       and v_fila.hora_salida is not null and v_final_ent = v_fila.hora_salida then
      v_final_sal := null;
    end if;
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
        'estimado: no marcó la salida, se completó con la hora del turno contratado' end,
      case when v_final_ent is null and v_final_sal is not null then 'pendiente: falta la hora de entrada' end,
      case when v_final_sal is null and v_final_ent is not null then 'pendiente: falta la hora de salida' end
    ), '');
    -- Un «pendiente» de una pasada anterior se borra: o ya se resolvió, o se vuelve a escribir arriba.
    v_obs_base := nullif(btrim(regexp_replace(coalesce(v_fila.obs, ''),
      '( · )?pendiente: falta la hora de (entrada|salida)', '', 'g'), ' ·'), '');

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
             when v_obs_extra is null then v_obs_base
             when coalesce(v_obs_base, '') like '%' || v_obs_extra || '%' then v_obs_base
             else nullif(btrim(concat_ws(' · ', v_obs_base, v_obs_extra)), '')
           end
     where a.id = v_fila.id;
  end loop;
end;
$fn$;

comment on function huellero_derivar_asistencia(uuid, date) is
  'Marcas de un empleado en un día → filas de asistencia, una por tramo. Colapsa el doble toque
   (C-2, 0096). Una marca suelta va al extremo (inicio o fin) más cercano de cualquier turno
   contratado del día (R1, 0163). Lo que falta NO se estima: queda sin_dato con «pendiente» en obs
   (R2, 0163). No toca un día con falta declarada, no pisa horas de autor humano, nunca deja en
   null una hora real salvo que la misma marca cambie de lado (R3, 0163).';

revoke execute on function huellero_derivar_asistencia(uuid, date) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Volver a leer las marcas de un rango (R4)
--
--    El tope de 400 días es una protección técnica, no una regla de negocio (anotado igual en
--    docs/pendientes-negocio.md).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_rederivar(p_empleado uuid, p_desde date, p_hasta date)
  returns int
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  d date;
  n int := 0;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede volver a leer las marcas';
  end if;
  if p_empleado is null or p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'DATO:el rango de fechas no es válido';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'DATO:el rango no puede pasar de 400 días';
  end if;
  for d in
    select distinct (m.marcada_en at time zone 'America/Lima')::date
      from marcas_huellero m
     where m.empleado_id = p_empleado
       and (m.marcada_en at time zone 'America/Lima')::date between p_desde and p_hasta
     order by 1
  loop
    -- Lo pagado no cambia: un día dentro de una liquidación cerrada no se vuelve a leer.
    continue when private.sueldo_estado_fecha(p_empleado, d)->>'estado' = 'cerrado';
    perform huellero_derivar_asistencia(p_empleado, d);
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

comment on function huellero_rederivar(uuid, date, date) is
  'Vuelve a derivar la asistencia de cada día con marcas del rango (0163, R4). Salta los días de un
   pago cerrado. Sólo administrador. Devuelve cuántos días leyó.';

revoke execute on function huellero_rederivar(uuid, date, date) from public, anon;
grant  execute on function huellero_rederivar(uuid, date, date) to authenticated;
