-- Release 2026-10-18b: migraciones 0163 a 0167 en orden. Se aplica DESPUÉS de deploy/2026-10-18.sql. Idempotente. Sin schema_migrations.
-- Generado de packages/db/migrations; no editar a mano.
begin;

-- ===== 0163_huellero_marca_extremo_cercano.sql =====
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
    -- Un «pendiente» o un «estimado» de una pasada anterior se borra: o ya no es cierto, o se vuelve
    -- a escribir arriba con las banderas finales (ajuste del verificador, spec §6).
    v_obs_base := nullif(btrim(regexp_replace(regexp_replace(coalesce(v_fila.obs, ''),
      '( · )?pendiente: falta la hora de (entrada|salida)', '', 'g'),
      '( · )?estimado: no marcó la (entrada|salida), se completó con la hora del turno contratado', '', 'g'), ' ·'), '');

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
    -- Si un cierre está corriendo, esperar a que termine (mismo patrón que la 0144).
    perform 1 from sueldo_liquidaciones
     where empleado_id = p_empleado and estado = 'borrador' and d between periodo_desde and periodo_hasta
     for share;
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


-- ===== 0164_sueldo_por_horas.sql =====
-- 0164_sueldo_por_horas.sql — el contrato guarda una tarifa por hora; con tarifa se paga por horas
-- reales (decisión del dueño n.º 1, 18-oct-2026).
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-18-sueldo-por-horas-design.md §4.
-- Prueba: packages/db/pruebas/0164_sueldo_por_horas.prueba.sql (escrita antes).
--
-- ZONA CRÍTICA (cadena del sueldo). El cálculo vive en el core (`liquidarPeriodo`); la base sólo
-- guarda la tarifa y la entrega con los datos del calendario de pago (`sueldo_entrada_pago`, 0121),
-- que el cierre ya compara. Por eso el cierre no se toca: si la tarifa cambia entre el cálculo y el
-- cierre, `contratoPago` difiere y responde DESACTUALIZADA.
--
-- REGRESIÓN. `tarifaHora` sólo se emite cuando no es nula. Un contrato de sueldo fijo (todos los que
-- existen al aplicar esto) devuelve el mismo jsonb que antes: sus borradores no piden recalcular y
-- sus liquidaciones no cambian.
--
-- Sin parámetros de negocio nuevos. Idempotente: `add column if not exists`, restricciones dentro de
-- un bloque que consulta pg_constraint, `create or replace` (conserva los grants).

alter table sueldo_acuerdos        add column if not exists tarifa_hora numeric(10,4);
alter table sueldo_acuerdo_cambios add column if not exists tarifa_hora numeric(10,4);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sueldo_acuerdos_tarifa_chk') then
    alter table sueldo_acuerdos
      add constraint sueldo_acuerdos_tarifa_chk check (tarifa_hora is null or tarifa_hora > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sueldo_cambios_tarifa_chk') then
    alter table sueldo_acuerdo_cambios
      add constraint sueldo_cambios_tarifa_chk check (tarifa_hora is null or tarifa_hora > 0);
  end if;
end $$;

comment on column sueldo_acuerdos.tarifa_hora is
  'Soles por hora trabajada (0164). Con tarifa el contrato se paga por horas reales y sueldo_pactado
   no se usa (queda en 0). Nula = contrato de sueldo fijo de antes, que se liquida como siempre.';
comment on column sueldo_acuerdo_cambios.tarifa_hora is
  'Tarifa por hora desde `desde` (0164). Nula = sigue la tarifa anterior.';

-- Cuerpo de la 0121 + `tarifaHora` sólo cuando no es nula.
create or replace function public.sueldo_entrada_pago(p_acuerdo uuid)
  returns jsonb language sql stable security invoker set search_path = public as $fn$
  select jsonb_build_object(
    'contratoPago', jsonb_build_object(
      'fechaInicio',   to_char(a.fecha_inicio, 'YYYY-MM-DD'),
      'fechaFin',      to_char(a.fecha_fin, 'YYYY-MM-DD'),
      'modalidad',     a.modalidad,
      'cadaDias',      a.cada_dias,
      'sueldoPactado', a.sueldo_pactado)
      || case when a.tarifa_hora is null then '{}'::jsonb
              else jsonb_build_object('tarifaHora', a.tarifa_hora) end,
    'cambiosFrecuencia', coalesce((
      select jsonb_agg(jsonb_build_object(
               'desde',         to_char(c.desde, 'YYYY-MM-DD'),
               'modalidad',     c.modalidad,
               'cadaDias',      c.cada_dias,
               'sueldoPactado', c.sueldo_pactado)
             || case when c.tarifa_hora is null then '{}'::jsonb
                     else jsonb_build_object('tarifaHora', c.tarifa_hora) end
             order by c.desde)
      from sueldo_acuerdo_cambios c where c.acuerdo_id = a.id), '[]'::jsonb))
  from sueldo_acuerdos a
  where a.id = p_acuerdo;
$fn$;

comment on function public.sueldo_entrada_pago(uuid) is
  'Contrato y cambios de frecuencia de un acuerdo: los datos con los que el core calcula el pago de cada tramo (0121; desde la 0164 también la tarifa por hora, sólo si la hay). El repo los guarda en la entrada del borrador y el cierre los compara.';


-- ===== 0165_asistencia_revisada.sql =====
-- 0165_asistencia_revisada.sql — marca de «día revisado» para la lista «Por revisar» de la ficha.
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md §5
-- (decisión del dueño n.º 4, 18-oct-2026). Prueba: packages/db/pruebas/0165_asistencia_revisada.prueba.sql.
--
-- No cambia ningún cálculo: `sueldo_entrada` no lee estas columnas. Sólo dice «el administrador ya
-- miró este día» (una tardanza, una falta o una hora estimada que acepta tal cual). La escribe el
-- administrador por la policy `asist_admin_write` de siempre (0025): no hace falta policy nueva.
-- Si después cambia una hora o la condición del día, la marca se borra sola: el dato cambió y hay
-- que volver a mirarlo.
--
-- Sin parámetros de negocio. Idempotente.

alter table asistencias add column if not exists revisada_en  timestamptz;
alter table asistencias add column if not exists revisada_por uuid references empleados(id) on delete set null;

comment on column asistencias.revisada_en is
  'Cuándo el administrador dio el día por revisado en «Por revisar» (0165). No cambia el pago. Se
   vuelve null sola si cambia una hora o la condición del día.';

create or replace function private.asistencia_revisada_se_borra() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Sólo si esta misma escritura no está tocando la marca (quien la pone no se la borra).
  if new.revisada_en is not distinct from old.revisada_en
     and (new.hora_entrada is distinct from old.hora_entrada
          or new.hora_salida is distinct from old.hora_salida
          or new.condicion is distinct from old.condicion) then
    new.revisada_en := null;
    new.revisada_por := null;
  end if;
  return new;
end $$;

drop trigger if exists asistencia_revisada_se_borra on asistencias;
create trigger asistencia_revisada_se_borra before update on asistencias
  for each row execute function private.asistencia_revisada_se_borra();


-- ===== 0166_ventas_semanales.sql =====
-- 0166_ventas_semanales.sql — ventas y metas cargadas a mano por semana, hasta conectar el punto de
-- venta por API (decisión del dueño n.º 8, 18-oct-2026).
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-18-ventas-metas-semanales-design.md §4.
-- Prueba: packages/db/pruebas/0166_ventas_semanales.prueba.sql (escrita antes).
--
-- ZONA CRÍTICA (cadena del sueldo). La regla (comisiones 1.ª y 2.ª) vive en el core; la base guarda
-- la carga y la entrega en `sueldo_entrada` (cuerpo de la 0144 + `ventasSemanales`, sólo si hay).
-- Default técnico (anotado en docs/pendientes-negocio.md): una semana dura a lo sumo 10 días (la
-- última de un pago absorbe hasta 3 días). Idempotente.

create table if not exists sueldo_ventas_semana (
  id                     uuid primary key default gen_random_uuid(),
  empleado_id            uuid not null references empleados(id) on delete restrict,
  desde                  date not null,
  hasta                  date not null,
  total_boletas_mayores  numeric(12,2) not null default 0,
  meta_cumplida          boolean,
  monto_vendido          numeric(12,2),
  creado_por             uuid references empleados(id) on delete set null,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  constraint sueldo_vs_total_chk  check (total_boletas_mayores >= 0),
  constraint sueldo_vs_monto_chk  check (monto_vendido is null or monto_vendido >= 0),
  constraint sueldo_vs_rango_chk  check (hasta >= desde and hasta - desde <= 9),
  constraint sueldo_vs_unica      unique (empleado_id, desde)
);

comment on table sueldo_ventas_semana is
  'Ventas y metas cargadas a mano por semana (0166, decisión del dueño n.º 8): total de boletas
   mayores a S/120, si cumplió la meta (o el monto vendido). Las usa el motor para la 1.ª y 2.ª
   comisión en vez de las boletas sueltas de esa semana.';

alter table sueldo_ventas_semana enable row level security;
drop policy if exists sueldo_vs_select on sueldo_ventas_semana;
create policy sueldo_vs_select on sueldo_ventas_semana for select
  using (private.app_es_admin() or empleado_id = auth.uid());
drop policy if exists sueldo_vs_admin on sueldo_ventas_semana;
create policy sueldo_vs_admin on sueldo_ventas_semana for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- Lo pagado no se toca: una semana cuyo `desde` cae en un pago cerrado no se carga, cambia ni borra.
create or replace function private.sueldo_vs_no_en_cerrado() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare r record;
begin
  for r in select * from (values (case when tg_op <> 'INSERT' then old.empleado_id end, case when tg_op <> 'INSERT' then old.desde end),
                                 (case when tg_op <> 'DELETE' then new.empleado_id end, case when tg_op <> 'DELETE' then new.desde end)) v(emp, d)
           where emp is not null loop
    if private.sueldo_estado_fecha(r.emp, r.d)->>'estado' = 'cerrado' then
      raise exception 'PERIODO_CERRADO:la semana del % ya está en un pago cerrado; no se puede cambiar', to_char(r.d, 'DD/MM/YYYY');
    end if;
  end loop;
  if tg_op = 'UPDATE' then new.actualizado_en := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;
revoke execute on function private.sueldo_vs_no_en_cerrado() from public, anon;

drop trigger if exists trg_sueldo_vs_no_en_cerrado on sueldo_ventas_semana;
create trigger trg_sueldo_vs_no_en_cerrado before insert or update or delete on sueldo_ventas_semana
  for each row execute function private.sueldo_vs_no_en_cerrado();

drop trigger if exists trg_audit_sueldo_ventas_semana on sueldo_ventas_semana;
create trigger trg_audit_sueldo_ventas_semana after insert or update or delete on sueldo_ventas_semana
  for each row execute function private.audit_log_trigger();

-- ═══ sueldo_entrada — cuerpo de la 0160 (días pendientes) con `ventasSemanales` ════════════════
-- Una sola firma (la 0127 prohíbe sobrecargas): la 0160 dejó (uuid,date,date,boolean default false);
-- esta migración suma la entrega de las ventas semanales a ESA misma función. Las llamadas con 3
-- argumentos siguen siendo estrictas (default false); el cierre llama así.
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


-- ===== 0167_acuerdo_guardar_tarifa.sql =====
-- 0167 — sueldo_acuerdo_guardar guarda la tarifa por hora
-- Spec: docs/superpowers/specs/2026-10-18-acuerdo-guardar-tarifa-design.md
--
-- La 0157 (contrato + horario atómicos) listaba las columnas a mano y se escribió antes de la 0164:
-- descartaba `p_fila.tarifa_hora`, y un contrato por horas nuevo quedaba como sueldo fijo de S/ 0.
-- Cuerpo EXACTO de la 0157 más `tarifa_hora` en el insert y en el update (nulo = sueldo fijo).
--
-- Idempotente: create or replace + revoke/grant. No toca datos ni esquema.

create or replace function sueldo_acuerdo_guardar(p_acuerdo uuid, p_fila jsonb, p_turnos jsonb)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede guardar un contrato';
  end if;
  if p_fila is null or jsonb_typeof(p_fila) <> 'object' then
    raise exception 'DATO:faltan los datos del contrato';
  end if;

  if p_acuerdo is null then
    insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias,
                                 sueldo_pactado, tarifa_hora, escala, almuerzo_habilitado, parametros, creado_por)
    values ((p_fila->>'empleado_id')::uuid,
            (p_fila->>'fecha_inicio')::date,
            (p_fila->>'fecha_fin')::date,
            p_fila->>'modalidad',
            nullif(p_fila->>'cada_dias', '')::int,
            (p_fila->>'sueldo_pactado')::numeric,
            nullif(p_fila->>'tarifa_hora', '')::numeric,
            nullif(p_fila->>'escala', '')::int,
            coalesce((p_fila->>'almuerzo_habilitado')::boolean, false),
            coalesce(p_fila->'parametros', '{}'::jsonb),
            nullif(p_fila->>'creado_por', '')::uuid)
    returning id into v_id;
  else
    perform 1 from sueldo_acuerdos where id = p_acuerdo for update;
    if not found then
      raise exception 'DATO:ese contrato no existe';
    end if;
    update sueldo_acuerdos set
      empleado_id         = (p_fila->>'empleado_id')::uuid,
      fecha_inicio        = (p_fila->>'fecha_inicio')::date,
      fecha_fin           = (p_fila->>'fecha_fin')::date,
      modalidad           = p_fila->>'modalidad',
      cada_dias           = nullif(p_fila->>'cada_dias', '')::int,
      sueldo_pactado      = (p_fila->>'sueldo_pactado')::numeric,
      tarifa_hora         = nullif(p_fila->>'tarifa_hora', '')::numeric,
      escala              = nullif(p_fila->>'escala', '')::int,
      almuerzo_habilitado = coalesce((p_fila->>'almuerzo_habilitado')::boolean, false),
      parametros          = coalesce(p_fila->'parametros', '{}'::jsonb)
    where id = p_acuerdo;
    v_id := p_acuerdo;
  end if;

  -- Reutiliza la 0149 (mismas validaciones y mensajes). Si lanza, se revierte todo lo anterior.
  perform sueldo_acuerdo_guardar_turnos(v_id, coalesce(p_turnos, '[]'::jsonb));
  return v_id;
end;
$fn$;

comment on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) is
  'Crea o actualiza un contrato (con su tarifa por hora, 0167) y reemplaza su horario en una sola transaccion. Solo admin.
   Spec empleados/2026-10-18-acuerdo-con-turnos-atomico.';

revoke execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) from public, anon;
grant  execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) to authenticated;

commit;
