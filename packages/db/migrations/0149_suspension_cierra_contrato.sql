-- 0149_suspension_cierra_contrato.sql — suspender cierra el contrato; horario atómico
--
-- Implementa docs/superpowers/specs/empleados/2026-10-18-suspension-cierra-contrato-design.md
-- (decisión del dueño del 05-oct-2026: al suspender a alguien su contrato se cierra en la fecha de
-- suspensión y el huellero deja de marcarle faltas).
--
-- QUÉ HACE
--   1) empleado_suspender(p_id, p_hoy): marca activo=false y cierra, en la MISMA transacción, el
--      contrato que cubre p_hoy (fecha_fin = p_hoy). La fecha la pasa quien invoca (hoyPeru() en la
--      aplicación): la base no adivina el día (no-negociable 4).
--   2) huellero_declarar_faltas_del_dia: se redefine igual que en la 0097 con una sola condición
--      nueva, `empleados.activo`. Sin ella, un contrato que quedara abierto seguía generando una
--      falta por día (dos días de sueldo cada una) a quien ya no trabaja acá.
--   3) sueldo_acuerdo_guardar_turnos(p_acuerdo, p_turnos): reemplazo atómico del horario. El repo
--      hacía delete + insert en dos llamadas; si el insert fallaba (solape), el contrato quedaba sin
--      horario y no había nada que liquidar.
--
-- DECISIONES (todas en la spec; ninguna es un parámetro de negocio nuevo)
--   · REACTIVAR NO REABRE EL CONTRATO. Reabrirlo adivinaría sueldo y horario de un periodo que
--     nadie pactó. Quien vuelve necesita un contrato nuevo, que puede empezar al día siguiente del
--     cierre sin chocar con sueldo_acuerdos_sin_solape.
--   · Lo ya liquidado no se toca: una liquidación no anulada que llegue más allá de p_hoy BLOQUEA la
--     suspensión con un mensaje que dice qué hacer. No se escribe nada.
--   · Un contrato que empieza DESPUÉS de p_hoy no se toca (cerrarlo dejaría fin < inicio); el
--     huellero ya lo ignora por activo=false. Pregunta abierta en la spec §6.
--   · Los cambios de frecuencia con desde > p_hoy salen del contrato achicado (el trigger
--     sueldo_cambio_coherente exige desde <= fecha_fin) y se eliminan; por el bloqueo anterior no
--     pueden haberse pagado.
--   · El acuerdo no cambia de `estado`: marcar 'liquidado' sigue siendo cosa del cierre de la
--     liquidación (0093).
--
-- Idempotente: todo es `create or replace function` + revoke/grant. No toca datos ni esquema.
-- Recordatorios que este repo pagó caros: helpers con prefijo `private.`; NUNCA
-- private.app_es_almacen() sobre datos de personas; search_path fijo en security definer.

-- ═══ 1) Suspender = desactivar + cerrar el contrato ═════════════════════════════════════════
create or replace function empleado_suspender(p_id uuid, p_hoy date)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_nombre   text;
  v_ac       uuid;
  v_fin_ant  date;
  v_cerrado  boolean := false;
  v_liq      record;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede suspender a una persona';
  end if;
  if p_hoy is null then
    raise exception 'DATO:falta la fecha de la suspensión';
  end if;

  select nombre into v_nombre from empleados where id = p_id;
  if not found then
    raise exception 'DATO:esa persona no existe';
  end if;

  -- No dejar la empresa sin administrador activo (mismo criterio que la 0114). El `for update`
  -- serializa dos suspensiones simultáneas entre los últimos administradores.
  perform 1 from empleados where rol in ('admin', 'dueno') and activo for update;
  if exists (select 1 from empleados where id = p_id and rol in ('admin', 'dueno') and activo)
     and not exists (select 1 from empleados where rol in ('admin', 'dueno') and activo and id <> p_id)
  then
    raise exception 'ESTADO:no se puede suspender al último administrador activo. Nombra a otro administrador antes de suspender a este.';
  end if;

  -- El contrato que cubre p_hoy (a lo sumo uno: sueldo_acuerdos_sin_solape).
  select id, fecha_fin into v_ac, v_fin_ant
    from sueldo_acuerdos
   where empleado_id = p_id and p_hoy between fecha_inicio and fecha_fin
   for update;

  if v_ac is not null and v_fin_ant > p_hoy then
    -- Lo ya pagado más allá de la baja no se invalida en silencio.
    select l.periodo_desde, l.periodo_hasta, l.estado into v_liq
      from sueldo_liquidaciones l
     where l.acuerdo_id = v_ac and l.estado <> 'anulada' and l.periodo_hasta > p_hoy
     order by l.periodo_hasta desc
     limit 1;
    if found then
      raise exception 'ESTADO:%: tiene una liquidación % (del % al %) que llega más allá de la fecha de suspensión (%). Anula esa liquidación desde Liquidaciones, o suspende con una fecha posterior al %, y vuelve a intentar.',
        v_nombre, v_liq.estado, v_liq.periodo_desde, v_liq.periodo_hasta, p_hoy, v_liq.periodo_hasta;
    end if;

    update sueldo_acuerdos set fecha_fin = p_hoy where id = v_ac;
    delete from sueldo_acuerdo_cambios where acuerdo_id = v_ac and desde > p_hoy;
    v_cerrado := true;
  end if;

  update empleados set activo = false, estado = 'suspendido' where id = p_id;

  return jsonb_build_object(
    'contrato_cerrado', v_cerrado,
    'fecha_fin_anterior', v_fin_ant,
    'fecha_fin_nueva', case when v_cerrado then p_hoy else v_fin_ant end
  );
end;
$fn$;

comment on function empleado_suspender(uuid, date) is
  'Suspende a una persona y cierra, en la misma transaccion, el contrato que cubre p_hoy
   (fecha_fin = p_hoy). Una liquidacion no anulada posterior a p_hoy bloquea con mensaje
   accionable. Reactivar no reabre el contrato. Spec empleados/2026-10-18-suspension-cierra-contrato.';

revoke execute on function empleado_suspender(uuid, date) from public, anon;
grant  execute on function empleado_suspender(uuid, date) to authenticated;

-- ═══ 2) El huellero no declara faltas a quien está suspendido ════════════════════════════════
-- Mismo cuerpo, firma, freno y permisos que la 0097; la única diferencia es el join con
-- `empleados` y su `activo` (marcada abajo).
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
  join empleados e on e.id = ac.empleado_id and e.activo   -- 0149: quien está suspendido no suma faltas
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
  'Para una fecha: declara falta a quien tenia turno contratado y cero marcas del huellero, salvo
   que sean mas de huellero_falta_auto_max_personas: ahi se frena, nadie pierde el dia, y las
   filas quedan en sin_dato con el motivo para que el administrador las revise (spec
   asistencias/2026-08-25-huellero-decide-por-horario-design.md §3 C-4). Nunca toca una hora ya
   cargada ni una fila ya declarada. Desde la 0149 ignora a quien tiene activo=false.';

revoke execute on function huellero_declarar_faltas_del_dia(date) from public, anon;
grant  execute on function huellero_declarar_faltas_del_dia(date) to authenticated;

-- ═══ 3) Horario atómico ══════════════════════════════════════════════════════════════════════
-- Formato de p_turnos: [{"dia_semana":1,"hora_inicio":"09:00","hora_fin":"13:00","lugar":"AL"}, …]
-- (los nombres de las columnas de sueldo_acuerdo_turnos). Si cualquier fila falla, TODO se
-- deshace —incluido el borrado— y el horario anterior queda intacto.
create or replace function sueldo_acuerdo_guardar_turnos(p_acuerdo uuid, p_turnos jsonb)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $fn$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede cambiar el horario de un contrato';
  end if;
  if p_turnos is null or jsonb_typeof(p_turnos) <> 'array' then
    raise exception 'DATO:el horario tiene que ser una lista de turnos';
  end if;
  perform 1 from sueldo_acuerdos where id = p_acuerdo for update;
  if not found then
    raise exception 'DATO:ese contrato no existe';
  end if;

  begin
    delete from sueldo_acuerdo_turnos where acuerdo_id = p_acuerdo;
    insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin, lugar)
    select p_acuerdo,
           (t->>'dia_semana')::int,
           (t->>'hora_inicio')::time,
           (t->>'hora_fin')::time,
           nullif(btrim(coalesce(t->>'lugar', '')), '')
      from jsonb_array_elements(p_turnos) as t;
  exception
    when exclusion_violation then
      raise exception 'DATO:hay turnos del mismo día que se solapan. Corrige las horas e inténtalo de nuevo; el horario anterior no se cambió.';
    when check_violation then
      raise exception 'DATO:hay un turno inválido (día fuera de lunes a domingo, o la salida no es posterior a la entrada). El horario anterior no se cambió.';
    when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or not_null_violation then
      raise exception 'DATO:hay un turno con día u hora mal escritos. El horario anterior no se cambió.';
  end;
end;
$fn$;

comment on function sueldo_acuerdo_guardar_turnos(uuid, jsonb) is
  'Reemplaza el horario de un contrato en una sola transaccion: o queda el nuevo completo, o
   el anterior intacto. Solo admin. Spec empleados/2026-10-18-suspension-cierra-contrato §2.3.';

revoke execute on function sueldo_acuerdo_guardar_turnos(uuid, jsonb) from public, anon;
grant  execute on function sueldo_acuerdo_guardar_turnos(uuid, jsonb) to authenticated;
