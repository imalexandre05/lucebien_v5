-- Release 2026-10-18: migraciones 0145 a 0162 en orden. Idempotente. Sin schema_migrations.
-- Generado de packages/db/migrations; no editar a mano.
begin;

-- ===== 0145_operador_5_min.sql =====
-- 0145 — El operador de un equipo compartido se cierra a los 5 minutos sin actividad.
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-operador-pc-compartida-design.md
-- Prueba: packages/db/pruebas/0145_operador_5_min.prueba.sql (escrita antes). Idempotente.
--
-- DEFAULT: el dueño pidió 5 minutos (antes 10, provisional de la 0112). Sólo se baja si la fila
-- sigue en el valor provisional «10»: si el administrador ya lo cambió desde /configuracion, se
-- respeta. Sigue editable allí. Anotado en docs/pendientes-negocio.md.
insert into config (clave, valor) values ('codigo_operador_min', '5')
on conflict (clave) do update set valor = '5' where config.valor = '10';


-- ===== 0146_reporte_con_codigo.sql =====
-- 0146 — El reporte de turno se envía con el código personal del encargado.
-- Spec: docs/superpowers/specs/reportes/2026-10-18-envio-reporte-con-codigo-design.md
-- Prueba: packages/db/pruebas/0146_reporte_con_codigo.prueba.sql (escrita antes). Idempotente.
--
-- reportes_crear recibe p_operador (token de 0112) y lo resuelve con private.actor_pipeline: en una
-- cuenta de equipo compartido es obligatorio; con token, encargado_id es el dueño del token. Sin
-- token en cuenta personal, el comportamiento es el de la 0122. Se retira la firma de 9 argumentos
-- (sin sobrecargas, regla de la 0127). Nada cambia en evaluación ni pago.

drop function if exists public.reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid);
create or replace function reportes_crear(
  p_id text, p_sede text, p_turno text,
  p_act_total int, p_act_done int,
  p_trabajadores uuid[], p_actividades jsonb, p_extras jsonb,
  p_encargado uuid default null, p_operador uuid default null
) returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_encargado   uuid;
  v_op          uuid;
  v_m           text[];
  v_fecha       date;
  v_bloqueantes text[];
  v_conflicto_id text;
  v_pendiente_id text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  -- Código personal (0112): en una cuenta de equipo compartido el token es obligatorio; con token,
  -- el encargado del reporte es el dueño del token y no la cuenta del equipo.
  v_op := private.actor_pipeline(p_operador);

  if p_operador is not null then
    if p_encargado is not null and p_encargado <> v_op then
      raise exception 'PERMISO: el encargado del turno es quien ingresó su código';
    end if;
    -- La sesión (el equipo) debe ser de la sede, igual que sin código; y el operador también.
    if not (private.app_es_admin() or p_sede in (select private.app_sedes())) then
      raise exception 'PERMISO: no puedes registrar el turno de la sede %', p_sede;
    end if;
    if not exists (
      select 1 from empleados e
       where e.id = v_op and e.activo
         and (e.rol in ('admin','dueno') or e.sede_cod = p_sede
              or exists (select 1 from empleado_tiendas et where et.empleado_id = e.id and et.sede_cod = p_sede))
    ) then
      raise exception 'PERMISO: quien ingresó su código no es de la sede %', p_sede;
    end if;
    v_encargado := v_op;
  -- Sólo el administrador puede registrar un turno a nombre de otra persona, y ésta debe estar
  -- activa. Cualquier otro rol es siempre el encargado de lo que registra.
  elsif private.app_es_admin() then
    v_encargado := coalesce(p_encargado, v_actor);
    if p_encargado is not null
       and not exists (select 1 from empleados where id = p_encargado and activo) then
      raise exception 'PERMISO: el encargado indicado no es un empleado activo';
    end if;
  else
    if p_encargado is not null and p_encargado <> v_actor then
      raise exception 'PERMISO: el encargado del turno es quien registra el reporte';
    end if;
    v_encargado := v_actor;
    -- Reemplaza al with check de rep_rw, que esta función no tiene encima al ser definer.
    -- Ya no se admite app_es_almacen(): el almacén registra sólo los turnos de sus sedes.
    if not (p_sede in (select private.app_sedes())) then
      raise exception 'PERMISO: no puedes registrar el turno de la sede %', p_sede;
    end if;
  end if;

  if exists (select 1 from reportes where id = p_id) then
    raise exception 'El reporte % ya existe', p_id;
  end if;

  v_m := regexp_match(p_id, '^(\d{2})-(\d{2})-(\d{2})_');
  if v_m is null then raise exception 'id de reporte inválido: %', p_id; end if;
  v_fecha := make_date((case when v_m[3]::int < 70 then 2000 else 1900 end) + v_m[3]::int,
                       v_m[2]::int, v_m[1]::int);

  v_bloqueantes := case when p_turno = 'C' then array['M', 'T'] else array['C'] end;
  select id into v_conflicto_id from reportes
    where sede_cod = p_sede and fecha = v_fecha and turno = any(v_bloqueantes)
      and not coalesce(no_evaluable, false)
    limit 1;
  if v_conflicto_id is not null then
    raise exception 'TURNO_CONFLICTO:%', v_conflicto_id;
  end if;

  select id into v_pendiente_id from reportes
    where sede_cod = p_sede and not evaluado and not coalesce(no_evaluable, false)
    order by fecha desc, created_at desc
    limit 1;
  if v_pendiente_id is not null then
    raise exception 'REPORTE_PENDIENTE:%', v_pendiente_id;
  end if;

  insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje,
                        act_total, act_done, evaluado, bloqueado, estado_envio)
  values (p_id, p_sede, p_turno, v_fecha, v_encargado, 0,
          coalesce(p_act_total, 0), coalesce(p_act_done, 0), false, true, 'enviado');

  insert into reporte_trabajadores (reporte_id, empleado_id)
  select distinct p_id, t from unnest(
    coalesce(p_trabajadores, array[]::uuid[])
    || case when v_encargado is not null then array[v_encargado] else array[]::uuid[] end
  ) t;

  if p_actividades is not null then
    insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
    select p_id, e->>'cod', e->>'nombre', e->>'cat',
           coalesce((e->>'peso')::numeric, 0), true, coalesce(e->>'obs', '')
    from jsonb_array_elements(p_actividades) e;
  end if;

  -- Fase 5 tarea 3: left join contra el catálogo EXT de la sede — `cat.cod is null` cubre TANTO
  -- el extra "libre" (sin cod) COMO un cod que no matcheó (catálogo no sembrado en esa sede).
  if p_extras is not null then
    insert into reporte_extras (reporte_id, tipo, nombre, cod, cantidad, precio_unitario,
                                peso_unitario, monto_total, revisar, detalle, registrado_por_id)
    select
      p_id,
      coalesce(nullif(e->>'tipo', ''), cat.tipo_act, 'libre'),
      coalesce(nullif(e->>'nombre', ''), cat.nombre, 'Extra'),
      nullif(e->>'cod', ''),
      coalesce((e->>'cantidad')::int, 1),
      coalesce(cat.precio_unitario, 0),
      coalesce(cat.peso, 0),
      coalesce(cat.precio_unitario, 0) * coalesce((e->>'cantidad')::int, 1),
      (cat.cod is null),
      coalesce(e->>'detalle', ''),
      coalesce(nullif(e->>'registrado_por_id', '')::uuid, case when p_operador is not null then v_encargado else v_actor end)
    from jsonb_array_elements(p_extras) e
    left join actividades_config cat
      on cat.sede_cod = p_sede and cat.cod = nullif(e->>'cod', '') and cat.categoria = 'EXT'
    where coalesce(e->>'nombre', '') <> '' or nullif(e->>'cod', '') is not null;
  end if;

  return p_id;
end;
$$;

revoke execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid, uuid)
  from public, anon;
grant  execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid, uuid)
  to authenticated;

-- La pantalla decide si pide el código también cuando la CUENTA es de un equipo compartido
-- (aunque el navegador no tenga la cookie de equipo): sin esto la base exige el token y la
-- pantalla no lo pediría. Solo responde sobre la propia sesión.
create or replace function public.sesion_cuenta_compartida()
  returns boolean language sql stable security invoker set search_path = public
as $$ select private.sesion_es_cuenta_compartida(); $$;
revoke execute on function public.sesion_cuenta_compartida() from public, anon;
grant  execute on function public.sesion_cuenta_compartida() to authenticated;


-- ===== 0147_codificacion_etapa.sql =====
-- 0147 — «Codificación» pasa a ser una etapa del pipeline (columna del tablero).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-codificacion-como-etapa-design.md
-- Prueba: packages/db/pruebas/0147_codificacion_etapa.prueba.sql (escrita antes). Idempotente.
--
-- Es el paso de marcar que la prenda ya tiene su etiqueta con el código; la codificación real se
-- hace en el sistema externo de inventario/POS. recepcion → codificacion → lavado/refaccion; la
-- etapa es opcional (las prendas que ya traen etiqueta siguen directo). Nada más llega a ella.
--
-- DECIDIDO POR EL DUEÑO (18-oct-2026): pts_codificacion = 1, editable en /configuracion. Se siembra la
-- fila para que sea visible y editable. Anotado en docs/pendientes-negocio.md.
insert into config (clave, valor) values ('pts_codificacion', '1') on conflict (clave) do nothing;

alter table prenda_pasada drop constraint if exists prenda_pasada_etapa_check;
alter table prenda_pasada add constraint prenda_pasada_etapa_check
  check (etapa in ('recepcion', 'codificacion', 'lavado', 'empatado', 'vacio', 'refaccion', 'compostura',
                   'planchado', 'control_calidad', 'listo', 'enviado', 'recibido', 'dividido'));

create or replace function public.pipeline_avanzar(p_id uuid, p_destino text, p_operador uuid default null)
  returns numeric language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_tipo text; v_tlav text; v_codigo text; v_dividida boolean;
  v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
  v_permitidos text[]; v_hist uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — una segunda sesión espera aquí y luego ve la etapa nueva.
  select etapa, tipo, tipo_lavado, codigo, dividida
    into v_etapa, v_tipo, v_tlav, v_codigo, v_dividida
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_dividida then raise exception 'Prenda dividida'; end if;

  -- Lista blanca (0086; 0147 suma «codificacion»). Las etapas sin salida caen en array vacío.
  v_permitidos := case v_etapa
    when 'recepcion'       then array['lavado', 'refaccion', 'codificacion']
    when 'codificacion'    then array['lavado', 'refaccion']
    when 'lavado'          then array['empatado']
    when 'empatado'        then array['refaccion']
    when 'refaccion'       then array['compostura', 'planchado']
    when 'compostura'      then array['planchado']
    when 'planchado'       then array['control_calidad']
    when 'control_calidad' then array['listo']
    else array[]::text[]
  end;
  if p_destino is null or not (p_destino = any(v_permitidos)) then
    raise exception 'TRANSICION: no se puede pasar de "%" a "%"', v_etapa, coalesce(p_destino, '(vacío)');
  end if;

  if v_etapa = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
  else v_clave := 'pts_' || v_etapa; end if;
  select valor::numeric into v_peso from config where clave = v_clave;
  if v_peso is null then v_peso := 1; end if;

  v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
             and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
  v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;

  update prenda_pasada set
    etapa = p_destino,
    fecha_actualizado = now(),
    aprobada = case when p_destino = 'listo' then true else aprobada end,
    lavador_id = case when v_etapa = 'recepcion' then v_actor else lavador_id end,
    planchador_id = case when v_etapa = 'planchado' then v_actor else planchador_id end
  where id = p_id;

  v_hist := private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, null);

  if v_pts > 0 then
    -- null = quien actúa no tiene rol de pipeline (H-4): la prenda avanza pero no cobra.
    if private.pipeline_registrar_punto(v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end,
            v_hist) is null then
      v_pts := 0;
    end if;
  end if;
  return coalesce(v_pts, 0);
end;
$$;

revoke execute on function public.pipeline_avanzar(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_avanzar(uuid, text, uuid) to authenticated;


-- ===== 0148_evaluacion_anular.sql =====
-- 0148_evaluacion_anular.sql — corregir una nota guardada.
--
-- Implementa docs/superpowers/specs/evaluaciones/2026-10-18-evaluacion-corregir-y-ciclo-cerrado-
-- design.md §2.2. Hasta hoy no había forma de corregir una evaluación guardada: la unicidad
-- (empleado_id, mes) impedía guardarla de nuevo y la única salida era borrar la fila a mano.
--
-- ZONA CRÍTICA (cadena del sueldo): la nota alimenta el monto sugerido de pago. Por eso la RPC se
-- NIEGA apenas algo depende de esa evaluación:
--   · pagos.evaluacion_id (única clave foránea hacia evaluaciones_mensuales, 0001_init.sql);
--   · sueldo_liquidaciones del mismo empleado, no anuladas, cuyo periodo se cruce con el ciclo de
--     la evaluación (no hay FK, pero la liquidación consume la nota; cualquier estado distinto de
--     'anulada' bloquea, incluido 'borrador': default conservador, ver docs/pendientes-negocio.md).
--
-- Rastro: trg_audit_evaluaciones_mensuales (0058) ya registra el DELETE con el `antes` completo;
-- no se duplica. Pero el trigger no conoce el motivo, y el CHECK de audit_log sólo admite
-- INSERT/UPDATE/DELETE: el motivo se guarda en una fila aparte (operacion = 'DELETE',
-- despues = {anulacion: true, motivo}).
--
-- Idempotente: create or replace. Helpers de RLS con prefijo `private`. Una función nueva no
-- hereda ACL: revoke from public, anon + grant to authenticated (patrón de la 0099).

create or replace function evaluacion_anular(p_id uuid, p_motivo text)
  returns void
  language plpgsql
  security definer
  set search_path = public, private, pg_temp
as $fn$
declare
  v_ev     evaluaciones_mensuales%rowtype;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede anular una evaluación';
  end if;
  if v_motivo is null then
    raise exception 'DATO:escribe el motivo de la anulación';
  end if;
  if p_id is null then
    raise exception 'DATO:falta la evaluación';
  end if;

  select * into v_ev from evaluaciones_mensuales where id = p_id for update;
  if not found then
    raise exception 'DATO:la evaluación no existe o ya fue anulada';
  end if;

  if exists (select 1 from pagos where evaluacion_id = p_id) then
    raise exception 'BLOQUEO:esta evaluación tiene un pago registrado. Anula primero ese pago y vuelve a intentarlo';
  end if;

  -- Mismo lock que sueldo_liquidacion_cerrar (0121): serializa con un cierre concurrente de la
  -- misma persona, para que no se cierre una liquidación entre la comprobación y el borrado.
  perform 1 from sueldo_acuerdos where empleado_id = v_ev.empleado_id for update;

  if exists (
    select 1 from sueldo_liquidaciones l
     where l.empleado_id = v_ev.empleado_id
       and l.estado <> 'anulada'
       and l.periodo_desde <= coalesce(v_ev.ciclo_hasta, (v_ev.mes || '-01')::date + interval '1 month' - interval '1 day')
       and l.periodo_hasta >= coalesce(v_ev.ciclo_desde, (v_ev.mes || '-01')::date)
  ) then
    raise exception 'BLOQUEO:hay una liquidación de sueldo de esta persona que cubre ese ciclo. Anula primero la liquidación y vuelve a intentarlo';
  end if;

  insert into audit_log (tabla, operacion, fila_id, actor, antes, despues)
  values ('evaluaciones_mensuales', 'DELETE', p_id::text, auth.uid(), null,
          jsonb_build_object('anulacion', true, 'motivo', v_motivo));

  delete from evaluaciones_mensuales where id = p_id;
end;
$fn$;

comment on function evaluacion_anular(uuid, text) is
  'Borra una evaluación mensual guardada para poder recalcularla. Solo administrador. Exige motivo.
   Se niega si hay un pago (pagos.evaluacion_id) o una liquidación de sueldo no anulada que cubra el
   ciclo. El DELETE lo audita trg_audit_evaluaciones_mensuales; el motivo queda en una fila aparte
   de audit_log. Errores con prefijo PERMISO:/DATO:/BLOQUEO: para que la pantalla los muestre.';

revoke execute on function evaluacion_anular(uuid, text) from public, anon;
grant  execute on function evaluacion_anular(uuid, text) to authenticated;


-- ===== 0149_suspension_cierra_contrato.sql =====
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
  set search_path = public, pg_temp
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
  set search_path = public, pg_temp
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
  set search_path = public, pg_temp
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


-- ===== 0150_incidencias_puntos_catalogo.sql =====
-- 0150_incidencias_puntos_catalogo.sql — los puntos de una incidencia salen del catálogo en la base.
--
-- Implementa el addendum de docs/superpowers/specs/2026-10-18-incidencias-servidor-valida-design.md.
-- La policy inc_insert (0046) deja insertar a cualquier usuario de la sede (o de almacén) con el
-- `puntos_penalidad` que quiera, llamando directo a PostgREST. Esos puntos descuentan de la nota y,
-- por ahí, del sueldo (no-negociable 1). Las acciones del servidor ya los toman del catálogo; esto
-- cierra el camino que las evita.
--
-- Para quien NO es administrador: el trigger fija `puntos_penalidad` al `puntos_default` del tipo
-- activo y rechaza un tipo que no exista. El administrador conserva su valor. La policy no cambia
-- (no se rompe el reporte de turno de los operativos).
--
-- Idempotente: create or replace + drop trigger if exists.

create or replace function incidencias_puntos_desde_catalogo()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_puntos numeric;
begin
  if private.app_es_admin() then
    return new;
  end if;
  select puntos_default into v_puntos
    from incidencia_tipos
   where tipo = new.tipo and activo;
  if not found then
    raise exception 'DATO:ese tipo de incidencia no existe o está desactivado';
  end if;
  new.puntos_penalidad := v_puntos;
  return new;
end;
$fn$;

revoke execute on function incidencias_puntos_desde_catalogo() from public, anon, authenticated;

drop trigger if exists trg_incidencias_puntos_catalogo on incidencias;
create trigger trg_incidencias_puntos_catalogo
  before insert on incidencias
  for each row execute function incidencias_puntos_desde_catalogo();


-- ===== 0151_tienda_ve_despachos.sql =====
-- 0151 — La tienda destino ve las prendas que le despachan (lucebien-tablero #43).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-tienda-ve-lo-que-le-despachan-design.md
-- Prueba: packages/db/pruebas/0151_tienda_ve_despachos.prueba.sql (escrita antes). Idempotente.
--
-- Decidido por el dueño (18-oct-2026): la tienda ve toda prenda que le fue enviada, sin importar por
-- qué sede entró, y SOLO esas. En vez de abrir la tabla prenda_pasada (que expone lavador,
-- planchador, pedido y observaciones internas), se entrega una VISTA con columnas limitadas. La vista
-- corre con los privilegios de su dueño; la visibilidad la fija su where: admin, almacén o sede
-- destino del envío en app_sedes() (la misma regla que envios_rw). pasada_select no cambia.
create or replace view public.prendas_despachadas with (security_barrier = true) as
select p.id, p.codigo, p.tipo, p.color, p.talla, p.sede_origen_cod, p.etapa, p.fecha_actualizado,
       e.id as envio_id, e.sede_destino_cod, e.fecha as fecha_envio, e.estado as estado_envio
from public.prenda_pasada p
join public.envios_prendas e on e.id = p.envio_id
where private.app_es_admin() or private.app_es_almacen()
   or e.sede_destino_cod in (select private.app_sedes());

-- Solo lectura: se quita todo (incluidos los privilegios por defecto de authenticated) y se da SELECT.
revoke all on public.prendas_despachadas from public, anon, authenticated;
grant select on public.prendas_despachadas to authenticated;


-- ===== 0152_no_dividir_enviada.sql =====
-- 0152 — No se divide una prenda ya enviada o recibida (lucebien-tablero #39, bloque «Dividir»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-no-dividir-enviada-design.md
-- Prueba: packages/db/pruebas/0152_no_dividir_enviada.prueba.sql (escrita antes). Idempotente.
-- Mismo cuerpo que la 0128 más la guarda de etapa.
create or replace function public.pipeline_dividir(p_id uuid, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_pr prenda_pasada;
  v_saco uuid; v_pant uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — sin esto dos sesiones creaban 4 hijas y dejaban 2 huérfanas.
  select * into v_pr from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_pr.dividida then raise exception 'Esta prenda ya fue dividida'; end if;
  -- 0152: lo despachado ya no es del taller; las hijas nacerían sin envío y la tienda no las vería.
  if v_pr.etapa not in ('recepcion', 'codificacion', 'lavado', 'empatado', 'vacio', 'refaccion', 'compostura',
                        'planchado', 'control_calidad', 'listo') then
    raise exception 'TRANSICION: no se puede dividir una prenda en etapa "%"', v_pr.etapa;
  end if;

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-S', 'Saco', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_saco;
  perform private.prenda_historial_registrar(v_saco, null, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo);

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_pant;
  perform private.prenda_historial_registrar(v_pant, null, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo);

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  perform private.prenda_historial_registrar(p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón');
end;
$$;

revoke execute on function public.pipeline_dividir(uuid, uuid) from public, anon;
grant  execute on function public.pipeline_dividir(uuid, uuid) to authenticated;


-- ===== 0153_enviar_tanda.sql =====
-- 0153 — Envío por tanda atómico (lucebien-tablero #39, bloque «Envíos»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-enviar-tanda-atomica-design.md
-- Prueba: packages/db/pruebas/0153_enviar_tanda.prueba.sql (escrita antes). Idempotente.
--
-- Llama a pipeline_enviar por prenda dentro de UNA sola transacción: si una falla, no sale ninguna.
-- Cada prenda conserva su envío (no se inventa un envío por tanda). Los permisos, la etapa y el
-- código de operador los valida pipeline_enviar.
create or replace function public.pipeline_enviar_tanda(p_ids uuid[], p_sede text, p_operador uuid default null)
  returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid; v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'La tanda está vacía: elige al menos una prenda';
  end if;
  -- Orden fijo: dos tandas con prendas en común no se bloquean entre sí.
  for v_id in select distinct x from unnest(p_ids) x order by x loop
    begin
      perform public.pipeline_enviar(v_id, p_sede, p_operador);
    exception when others then
      -- Se conserva el prefijo (CODIGO:, TRANSICION:, PERMISO:) y se agrega la prenda que falló.
      if sqlerrm like 'CODIGO:%' then raise; end if;
      raise exception '% (prenda %)', sqlerrm,
        coalesce((select codigo from public.prenda_pasada where id = v_id), v_id::text);
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.pipeline_enviar_tanda(uuid[], text, uuid) from public, anon;
grant  execute on function public.pipeline_enviar_tanda(uuid[], text, uuid) to authenticated;


-- ===== 0154_rechazar_motivo.sql =====
-- 0154 — Rechazar en control de calidad exige un motivo (lucebien-tablero #39, bloque «Rechazar»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-rechazar-con-motivo-design.md
-- Prueba: packages/db/pruebas/0154_rechazar_motivo.prueba.sql (escrita antes). Idempotente.
-- Mismo cuerpo que la 0140 más el motivo (obligatorio, 3..500 letras: defaults de la RPC, anotados
-- en docs/pendientes-negocio.md), que se guarda en obs_calidad y en el historial. Una sola firma.
drop function if exists public.pipeline_rechazar(uuid, text, uuid);
create or replace function pipeline_rechazar(p_id uuid, p_destino text, p_operador uuid default null,
                                             p_motivo text default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_codigo text; v_motivo text;
  v_culpable uuid; v_pts numeric; v_hist uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  -- 0154: sin motivo no se rechaza (largo 3..500, defaults de la RPC a confirmar con el dueño).
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'MOTIVO: escribe por qué se rechaza la prenda (entre 3 y 500 letras)';
  end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  select etapa, codigo into v_etapa, v_codigo
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  -- H-7 (igual que la 0122 y la 0112): sólo lo que ofrece la pantalla. Cierra también el doble
  -- rechazo: tras el primero la prenda ya no está en control_calidad.
  if v_etapa <> 'control_calidad'
     or p_destino is null
     or not (p_destino = any(array['recepcion','lavado','empatado','refaccion','compostura','planchado'])) then
    raise exception 'TRANSICION: sólo se rechaza desde control de calidad hacia una etapa anterior';
  end if;

  select empleado_id into v_culpable from prenda_historial
    where pasada_id = p_id and etapa_anterior = p_destino and empleado_id is not null
    order by fecha desc limit 1;

  update prenda_pasada set etapa = p_destino, aprobada = false, obs_calidad = v_motivo, fecha_actualizado = now() where id = p_id;
  v_hist := private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino || ': ' || v_motivo);

  if v_culpable is not null then
    -- 0140: pierde TODOS los puntos de ese trabajo: lo que esa persona cobró en esa etapa para esta
    -- prenda (o su madre, si es hija de dividir), menos lo ya descontado por rechazos anteriores.
    -- Así el neto del trabajo queda en 0, sin depender del peso actual (`pts_*`) ni de si es media prenda.
    select coalesce(sum(pp.puntos), 0) into v_pts
      from pipeline_puntos pp
     where pp.empleado_id = v_culpable
       and pp.etapa in (p_destino, p_destino || '_rechazo')
       and pp.pasada_id in (
         -- la familia: la prenda, su madre y todas las hijas de esa madre (hermanas incluidas), para que
         -- los rechazos de una hermana cuenten y el culpable nunca quede bajo 0
         select p_id
         union
         select m.id from prenda_pasada m where m.dividida and m.dividida_en like '%' || p_id::text || '%'
         union
         select h.id from prenda_pasada m join prenda_pasada h on m.dividida_en like '%' || h.id::text || '%'
          where m.dividida and m.dividida_en like '%' || p_id::text || '%');
    if v_pts > 0 then
      perform private.pipeline_registrar_punto(v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino || '; pierde ' || v_pts || ' pts', v_hist);
    end if;
  end if;
end;
$$;

revoke execute on function public.pipeline_rechazar(uuid, text, uuid, text) from public, anon;
grant  execute on function public.pipeline_rechazar(uuid, text, uuid, text) to authenticated;


-- ===== 0155_tanda_deshacer.sql =====
-- 0155 — Tanda: resultado honesto y «Deshacer» (lucebien-tablero #39, bloque «Tanda equivocada»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-tanda-deshacer-y-resultado-design.md
-- Prueba: packages/db/pruebas/0155_tanda_deshacer.prueba.sql (escrita antes). Idempotente.
--
-- 1) pipeline_avanzar_tanda_resultado: mismo recorrido que pipeline_avanzar_tanda (omite las prendas
--    que no se pueden avanzar) pero cuenta movidas y omitidas. 2) pipeline_avanzar_tanda conserva
--    firma y retorno y delega en la nueva. 3) pipeline_deshacer_tanda: deshace varias en UNA
--    transacción (todo o nada), en orden fijo. Las tres son invoker, como pipeline_avanzar_tanda.

create or replace function pipeline_avanzar_tanda_resultado(p_ids uuid[], p_destino text, p_operador uuid default null)
  returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_id uuid; v_total numeric := 0; v_mov int := 0; v_omi int := 0; v_ids jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform private.actor_pipeline(p_operador);   -- lanza CODIGO: si el token no vale; aborta todo
  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    begin
      v_total := v_total + coalesce(pipeline_avanzar(v_id, p_destino, p_operador), 0);
      v_mov := v_mov + 1;
      v_ids := v_ids || to_jsonb(v_id::text);
    exception when others then
      v_omi := v_omi + 1;   -- omite prendas que no se pueden avanzar, pero ahora se cuentan
    end;
  end loop;
  return jsonb_build_object('puntos', v_total, 'movidas', v_mov, 'omitidas', v_omi, 'ids_movidos', v_ids);
end;
$$;
revoke execute on function pipeline_avanzar_tanda_resultado(uuid[], text, uuid) from public, anon;
grant  execute on function pipeline_avanzar_tanda_resultado(uuid[], text, uuid) to authenticated;

create or replace function pipeline_avanzar_tanda(p_ids uuid[], p_destino text, p_operador uuid default null)
  returns numeric language plpgsql security invoker set search_path = public
as $$
begin
  return (pipeline_avanzar_tanda_resultado(p_ids, p_destino, p_operador)->>'puntos')::numeric;
end;
$$;
revoke execute on function pipeline_avanzar_tanda(uuid[], text, uuid) from public, anon;
grant  execute on function pipeline_avanzar_tanda(uuid[], text, uuid) to authenticated;

create or replace function pipeline_deshacer_tanda(p_items jsonb, p_operador uuid default null)
  returns integer language plpgsql security invoker set search_path = public
as $$
declare v_it record; v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La tanda está vacía: elige al menos una prenda';
  end if;
  perform private.actor_pipeline(p_operador);   -- lanza CODIGO: si el token no vale; aborta todo
  for v_it in
    select (x->>'id')::uuid as id, x->>'etapa_anterior' as etapa
      from jsonb_array_elements(p_items) x order by 1
  loop
    begin
      perform pipeline_deshacer(v_it.id, v_it.etapa, p_operador);
    exception when others then
      if sqlerrm like 'CODIGO:%' then raise; end if;
      raise exception '% (prenda %)', sqlerrm,
        coalesce((select codigo from prenda_pasada where id = v_it.id), v_it.id::text);
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function pipeline_deshacer_tanda(jsonb, uuid) from public, anon;
grant  execute on function pipeline_deshacer_tanda(jsonb, uuid) to authenticated;


-- ===== 0156_anular_envio.sql =====
-- 0156 — Anular un envío equivocado (lucebien-tablero #39, bloque «Envíos»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-anular-envio-design.md
-- Prueba: packages/db/pruebas/0156_anular_envio.prueba.sql (escrita antes). Idempotente.
--
-- La prenda en «enviado» vuelve a «listo» sin envío; el envío no se borra: queda «anulado» cuando
-- ya no tiene prendas. Motivo obligatorio (3..500 letras, mismo criterio que la 0154: defaults de
-- la RPC anotados en docs/pendientes-negocio.md). Lo anula quien tiene acceso por sede de origen
-- (pipeline_exigir_acceso), nunca la tienda destino. Una sola firma, sin execute para anon.
create or replace function public.pipeline_anular_envio(p_id uuid, p_motivo text default null, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid; v_motivo text;
  v_etapa text; v_envio uuid; v_activo_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'MOTIVO: escribe por qué se anula el envío (entre 3 y 500 letras)';
  end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  select etapa, envio_id, activo_id into v_etapa, v_envio, v_activo_id
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'enviado' or v_envio is null then
    raise exception 'TRANSICION: sólo se anula el envío de una prenda que la tienda aún no calificó';
  end if;

  update prenda_pasada set etapa = 'listo', envio_id = null, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, 'enviado', 'listo', v_actor,
    'Envío ' || substr(v_envio::text, 1, 8) || ' anulado: ' || v_motivo);
  if not exists (select 1 from prenda_pasada where envio_id = v_envio) then
    update envios_prendas set estado = 'anulado' where id = v_envio;
  end if;
  -- El envío había dejado disponible al activo; vuelve al taller (si ya cambió de estado, no se toca).
  if v_activo_id is not null then
    update inventario_activo set estado = 'en_pipeline' where id = v_activo_id and estado = 'disponible';
  end if;
end;
$$;
revoke execute on function public.pipeline_anular_envio(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_anular_envio(uuid, text, uuid) to authenticated;


-- ===== 0157_acuerdo_con_turnos_atomico.sql =====
-- 0157 — Contrato + horario en una sola transacción
-- Spec: docs/superpowers/specs/empleados/2026-10-18-acuerdo-con-turnos-atomico-design.md
--
-- sueldo_acuerdo_guardar(p_acuerdo, p_fila, p_turnos): crea (p_acuerdo nulo) o actualiza el
-- contrato y reemplaza su horario llamando a sueldo_acuerdo_guardar_turnos (0149). Si los turnos
-- fallan, se deshace también el contrato: ni contrato sin horario ni términos nuevos con horario
-- viejo. La RPC no decide reglas de negocio: escribe lo que el servidor ya resolvió (parámetros
-- vigentes + overrides). Los errores de restricciones del contrato (solape de fechas, checks) se
-- dejan salir tal cual, como cuando se escribía la tabla directo.
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
                                 sueldo_pactado, escala, almuerzo_habilitado, parametros, creado_por)
    values ((p_fila->>'empleado_id')::uuid,
            (p_fila->>'fecha_inicio')::date,
            (p_fila->>'fecha_fin')::date,
            p_fila->>'modalidad',
            nullif(p_fila->>'cada_dias', '')::int,
            (p_fila->>'sueldo_pactado')::numeric,
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
  'Crea o actualiza un contrato y reemplaza su horario en una sola transaccion. Solo admin.
   Spec empleados/2026-10-18-acuerdo-con-turnos-atomico.';

revoke execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) from public, anon;
grant  execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) to authenticated;


-- ===== 0158_endurecer.sql =====
-- 0158 — Endurecer: almacén inactivo, aviso de calidad y estado del activo al anular un envío.
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-endurecer-almacen-obs-activo-design.md
-- Prueba: packages/db/pruebas/0158_endurecer.prueba.sql (escrita antes). Idempotente.
-- Decidido por el dueño (18-oct-2026). Depende de la 0147 (pipeline_avanzar) y la 0156 (anular envío).

-- R1: un almacén/confeccionista suspendido o inactivo no ve ni opera nada.
create or replace function private.app_es_almacen()
  returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.empleados e
    where e.id = auth.uid() and e.activo and e.rol in ('encargado_almacen','confeccionista')
  );
$function$;

-- R3: estado del activo antes del envío.
alter table prenda_pasada add column if not exists activo_estado_previo text;

-- R2 (pipeline_avanzar), R3 (pipeline_enviar, pipeline_anular_envio): mismos cuerpos que las versiones vivas.
create or replace function public.pipeline_avanzar(p_id uuid, p_destino text, p_operador uuid default null)
  returns numeric language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_tipo text; v_tlav text; v_codigo text; v_dividida boolean;
  v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
  v_permitidos text[]; v_hist uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — una segunda sesión espera aquí y luego ve la etapa nueva.
  select etapa, tipo, tipo_lavado, codigo, dividida
    into v_etapa, v_tipo, v_tlav, v_codigo, v_dividida
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_dividida then raise exception 'Prenda dividida'; end if;

  -- Lista blanca (0086; 0147 suma «codificacion»). Las etapas sin salida caen en array vacío.
  v_permitidos := case v_etapa
    when 'recepcion'       then array['lavado', 'refaccion', 'codificacion']
    when 'codificacion'    then array['lavado', 'refaccion']
    when 'lavado'          then array['empatado']
    when 'empatado'        then array['refaccion']
    when 'refaccion'       then array['compostura', 'planchado']
    when 'compostura'      then array['planchado']
    when 'planchado'       then array['control_calidad']
    when 'control_calidad' then array['listo']
    else array[]::text[]
  end;
  if p_destino is null or not (p_destino = any(v_permitidos)) then
    raise exception 'TRANSICION: no se puede pasar de "%" a "%"', v_etapa, coalesce(p_destino, '(vacío)');
  end if;

  if v_etapa = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
  else v_clave := 'pts_' || v_etapa; end if;
  select valor::numeric into v_peso from config where clave = v_clave;
  if v_peso is null then v_peso := 1; end if;

  v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
             and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
  v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;

  update prenda_pasada set
    etapa = p_destino,
    fecha_actualizado = now(),
    aprobada = case when p_destino = 'listo' then true else aprobada end,
    -- 0158: al aprobar se limpia el aviso del rechazo anterior (el motivo queda en el historial).
    obs_calidad = case when p_destino = 'listo' then null else obs_calidad end,
    lavador_id = case when v_etapa = 'recepcion' then v_actor else lavador_id end,
    planchador_id = case when v_etapa = 'planchado' then v_actor else planchador_id end
  where id = p_id;

  v_hist := private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, null);

  if v_pts > 0 then
    -- null = quien actúa no tiene rol de pipeline (H-4): la prenda avanza pero no cobra.
    if private.pipeline_registrar_punto(v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end,
            v_hist) is null then
      v_pts := 0;
    end if;
  end if;
  return coalesce(v_pts, 0);
end;
$$;

create or replace function public.pipeline_enviar(p_id uuid, p_sede text, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_sesion uuid := auth.uid(); v_actor uuid; v_etapa text; v_envio uuid; v_activo_id uuid; v_est_activo text;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — sin esto dos sesiones dejaban un envío fantasma.
  select etapa, activo_id into v_etapa, v_activo_id from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'listo' then raise exception 'Solo se envían prendas listas'; end if;
  -- F5 (hallazgo 5): la validación de la 0122 (:399-401), con su mismo texto, antes de insertar.
  if p_sede is null or not exists (select 1 from public.sedes where cod = p_sede) then
    raise exception 'La sede de destino % no existe', coalesce(p_sede, '(vacía)');
  end if;

  insert into envios_prendas (sede_destino_cod, fecha, responsable_id, estado)
    values (p_sede, now(), v_actor, 'enviado') returning id into v_envio;
  update prenda_pasada set etapa = 'enviado', envio_id = v_envio, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, 'listo', 'enviado', v_actor,
    'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede);

  -- Fase 7 tarea 2 (0055): el activo vinculado sale del pipeline y queda disponible.
  if v_activo_id is not null then
    -- 0158: se guarda el estado previo para que anular el envío lo devuelva a donde estaba.
    select estado into v_est_activo from inventario_activo where id = v_activo_id;
    if v_est_activo in ('codificando', 'en_pipeline', 'en_compostura') then
      update prenda_pasada set activo_estado_previo = v_est_activo where id = p_id;
      update inventario_activo set estado = 'disponible' where id = v_activo_id;
    else
      -- Nunca queda un estado previo viejo de un envío anterior (p. ej. una prenda observada y reenviada).
      update prenda_pasada set activo_estado_previo = null where id = p_id;
    end if;
  end if;
end;
$$;

create or replace function public.pipeline_anular_envio(p_id uuid, p_motivo text default null, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid; v_motivo text;
  v_etapa text; v_envio uuid; v_activo_id uuid; v_previo text;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'MOTIVO: escribe por qué se anula el envío (entre 3 y 500 letras)';
  end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  select etapa, envio_id, activo_id, activo_estado_previo into v_etapa, v_envio, v_activo_id, v_previo
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'enviado' or v_envio is null then
    raise exception 'TRANSICION: sólo se anula el envío de una prenda que la tienda aún no calificó';
  end if;

  update prenda_pasada set etapa = 'listo', envio_id = null, activo_estado_previo = null, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, 'enviado', 'listo', v_actor,
    'Envío ' || substr(v_envio::text, 1, 8) || ' anulado: ' || v_motivo);
  if not exists (select 1 from prenda_pasada where envio_id = v_envio) then
    update envios_prendas set estado = 'anulado' where id = v_envio;
  end if;
  -- El envío había dejado disponible al activo; vuelve a su estado de antes (0158) o, si no se guardó,
  -- a en_pipeline. Si ya cambió de estado (p. ej. alquilado), no se toca.
  if v_activo_id is not null then
    update inventario_activo set estado = coalesce(v_previo, 'en_pipeline') where id = v_activo_id and estado = 'disponible';
  end if;
end;
$$;

revoke execute on function public.pipeline_avanzar(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_avanzar(uuid, text, uuid) to authenticated;
revoke execute on function public.pipeline_enviar(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_enviar(uuid, text, uuid) to authenticated;
revoke execute on function public.pipeline_anular_envio(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_anular_envio(uuid, text, uuid) to authenticated;


-- ===== 0159_puntualidad_automatica.sql =====
-- 0159_puntualidad_automatica.sql — la nota de puntualidad sale sola de la asistencia, en base 20.
--
-- Spec: docs/superpowers/specs/evaluaciones/2026-10-18-puntualidad-automatica-design.md
-- Prueba: packages/db/pruebas/0159_puntualidad_automatica.prueba.sql   ZONA CRÍTICA (verificador antes de mergear).
--
-- `create or replace` de private.evaluacion_componentes_datos con el cuerpo EXACTO de la 0132 más:
--   * `tardanza` = 20 × puntuales / debidos (default 'proporcion'; 'minutos' = fórmula anterior);
--   * cuatro claves de detalle (puntualidadModo/Debidos/Puntuales/Tardanzas).
-- No cambia ninguna otra clave ni `puntosTotal`. Firma, security definer y permisos intactos.
-- Parámetro nuevo en `config`: eval_puntualidad_modo (default 'proporcion'). Idempotente.

insert into config (clave, valor) values ('eval_puntualidad_modo', 'proporcion') on conflict (clave) do nothing;

create or replace function private.evaluacion_componentes_datos(p_empleado uuid, p_desde date, p_hasta date)
  returns jsonb language sql stable security definer set search_path = public
as $$
  with reps as (
    -- C-1: cualquiera que trabajó el turno lo suma, no sólo quien lo encargó.
    select r.id
    from reportes r
    where r.evaluado
      and r.fecha between p_desde and p_hasta
      and (
        r.encargado_id = p_empleado
        or exists (
          select 1 from reporte_trabajadores rt
          where rt.reporte_id = r.id and rt.empleado_id = p_empleado
        )
      )
  ),
  acts as (
    select a.cod, a.cat, a.calificacion
    from reporte_actividades a
    join reps r on r.id = a.reporte_id
    where a.calificacion is not null
  ),
  cats as (
    select
      coalesce(avg(calificacion) filter (where cat = 'IND'), 0) * 20            as limpieza,
      coalesce(avg(calificacion) filter (where cod ~ '^(AS|BS)'), 0) * 20       as software,
      coalesce(avg(calificacion) filter (where cod ~ '^(AT|BT)'), 0) * 20       as operaciones
    from acts
  ),
  div as (
    select coalesce((select valor::numeric from config where clave = 'eval_tardanza_min_por_punto'), 15) as v
  ),
  -- C-2: la tolerancia es la MISMA que usa el motor de sueldos para decidir si un ingreso cuenta
  -- como tardanza (RN-08). No se inventa una tolerancia distinta para la evaluación.
  tol as (
    select coalesce((select valor::numeric from config where clave = 'sueldo_tolerancia_minutos'), 10) as v
  ),
  -- Un día por fila, con la entrada MÁS TEMPRANA entre todos los tramos de asistencia de ese día
  -- (mismo criterio que sueldo_entrada, migración 0085: `min(s.hora_entrada)` colapsa el día para
  -- que un día partido en tramos se mida contra su primer ingreso). Y, aparte, el inicio del turno
  -- contratado más temprano de ese mismo día de la semana, tomado del acuerdo que cubre esa fecha
  -- — a lo sumo uno, gracias a la restricción de exclusión `sueldo_acuerdos_sin_solape`.
  dias_trabajados as (
    select
      s.fecha,
      min(s.hora_entrada)             as entrada,
      bool_or(s.tardanza_justificada) as justificada,
      (
        select min(t.hora_inicio)
        from sueldo_acuerdos a
        join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
        where a.empleado_id = p_empleado
          and s.fecha between a.fecha_inicio and a.fecha_fin
          and t.dia_semana = extract(isodow from s.fecha)
      ) as inicio_turno
    from asistencias s
    where s.empleado_id = p_empleado
      and s.fecha between p_desde and p_hasta
      and s.condicion = 'trabajado'
    group by s.fecha
  ),
  -- La diferencia se calcula una sola vez, en minutos, restando dos `time` (da un `interval`) y
  -- extrayendo sus segundos — así no hay que multiplicar un `interval` por un `numeric`, operación
  -- ambigua en Postgres. Los minutos que se acumulan son contra la hora PACTADA, no contra la
  -- ajustada por tolerancia: la tolerancia decide si el día cuenta, no cuánto pesa.
  dias_diff as (
    select
      fecha, justificada,
      case when entrada is not null and inicio_turno is not null
           then (extract(epoch from (entrada - inicio_turno)) / 60.0)::numeric
           else null
      end as diff_min
    from dias_trabajados
  ),
  tard as (
    select coalesce(sum(
      case
        -- Un día sin acuerdo vigente o sin turno contratado ese día de la semana llega acá con
        -- diff_min en null (la subconsulta de inicio_turno no encontró fila) y no aporta minutos.
        when diff_min is not null and not justificada and diff_min > (select v from tol)
        then diff_min
        else 0
      end
    ), 0) as min
    from dias_diff
  ),
  -- 🆕 (0159) Puntualidad por proporción. DEFAULT inventado, anotado en docs/pendientes-negocio.md y
  -- editable en /configuración: eval_puntualidad_modo = 'proporcion' (default) | 'minutos'.
  modo as (
    select case when (select valor from config where clave = 'eval_puntualidad_modo') = 'minutos'
                then 'minutos' else 'proporcion' end as v
  ),
  -- Días con turno contratado dentro del ciclo y hasta hoy (hora Perú) cuya asistencia está DECLARADA
  -- (trabajado o falta) y sin ninguna fila sin_dato: un día sin cargar, sin fila o a medias no se
  -- castiga (mismo criterio que sueldo_entrada, 0160).
  puntual_debidos_f as (
    select g::date as fecha
    from generate_series(p_desde::timestamp, least(p_hasta, (now() at time zone 'America/Lima')::date)::timestamp, interval '1 day') g
    where exists (
            select 1 from sueldo_acuerdos a
            join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
            where a.empleado_id = p_empleado and g::date between a.fecha_inicio and a.fecha_fin
              and t.dia_semana = extract(isodow from g))
      and exists (
            select 1 from asistencias s
            where s.empleado_id = p_empleado and s.fecha = g::date and s.condicion <> 'sin_dato')
      and not exists (
            select 1 from asistencias s
            where s.empleado_id = p_empleado and s.fecha = g::date and s.condicion = 'sin_dato')
      -- Decisión del dueño (18-oct-2026): una falta justificada no baja la nota.
      and not exists (
            select 1 from asistencias s
            where s.empleado_id = p_empleado and s.fecha = g::date and s.condicion = 'falta' and s.falta_justificada)
  ),
  puntual_debidos as (select count(*) as n from puntual_debidos_f),
  -- Tardanza = misma regla del sueldo (RN-08): pasa la tolerancia y no está justificada. Solo cuentan
  -- los días debidos con turno: un día trabajado fuera de contrato no puede tapar una tardanza.
  puntual_tard as (
    select count(*) filter (where diff_min > (select v from tol) and not justificada) as tardanzas,
           count(*) filter (where not (diff_min > (select v from tol) and not justificada)) as puntuales
    from dias_diff
    where diff_min is not null and fecha in (select fecha from puntual_debidos_f)
  ),
  inc as (
    select coalesce(sum(puntos_penalidad), 0) as descuento
    from incidencias where responsable_id = p_empleado and fecha between p_desde and p_hasta
  ),
  pipe as (
    select coalesce(sum(puntos), 0) as total
    from pipeline_puntos
    where empleado_id = p_empleado
      and (fecha at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  -- Los extras NO se tocan: siguen siendo de quien los registró, no de todo el equipo.
  extr as (
    select coalesce(sum(re.monto_total), 0) as total, count(*) as cantidad,
           coalesce(sum(re.puntos_total), 0) as puntos
    from reporte_extras re
    join reportes r on r.id = re.reporte_id
    where re.registrado_por_id = p_empleado and r.fecha between p_desde and p_hasta
  ),
  val as (
    select
      avg(integridad)::numeric as integridad, avg(respeto)::numeric as respeto,
      avg(honestidad)::numeric as honestidad, avg(amabilidad)::numeric as amabilidad,
      avg(relacion)::numeric as relacion, avg(actitud)::numeric as actitud,
      count(*) as cantidad
    from evaluaciones_valores
    where evaluado_id = p_empleado and mes = to_char(p_desde, 'YYYY-MM')
  ),
  -- 🆕 (0095, spec puntos-como-moneda §5) — pts_actividad_cumplida: default 1, mismo criterio de
  -- coalesce que div/tol arriba, con `nullif` por si el administrador la deja vacía desde
  -- /configuracion en vez de borrar la fila (ver el comentario grande al principio del archivo).
  cfg_act as (
    select coalesce(nullif((select valor from config where clave = 'pts_actividad_cumplida'), '')::numeric, 1) as v
  ),
  -- 🆕 pts_por_sol_vendido: a propósito SIN default. `v` queda null tanto si la fila no existe como
  -- si existe vacía — ese `is null` es lo que decide puntosVentas = 0 y alimenta ventasSinTasa.
  tasa_venta as (
    select nullif((select valor from config where clave = 'pts_por_sol_vendido'), '') as v
  ),
  -- 🆕 Todas las filas de sueldo_ventas del período, sin filtrar por tipo ('venta'/'alquiler') ni
  -- por si ya se liquidaron: acá es "trabajo hecho que da puntos", no el mismo filtro que arma una
  -- liquidación nueva (ese vive en sueldo_entrada, 0073/0093, y sí excluye lo ya liquidado).
  ventas as (
    select coalesce(sum(monto), 0) as total, count(*) as cantidad
    from sueldo_ventas
    where empleado_id = p_empleado and fecha between p_desde and p_hasta
  ),
  -- 🆕 sum(calificacion) sobre la MISMA cte `acts` de arriba (spec: "la CTE existe, reusala") — no
  -- se filtra por categoría: cada actividad calificada del turno cuenta, tal como ya la ve `acts`.
  -- 🆕 (0132) Nota vigente (último examen) de cada capacitación COMPLETADA de la persona como nueva con
  -- cierre dentro del ciclo; se promedia. Cancelada o en curso no cuentan. Sin ninguna → null (manual).
  exa as (
    select avg(n.nota) as promedio, count(*) as cantidad
    from (
      select (select x.nota from capacitacion_examenes x
               where x.capacitacion_id = c.id order by x.fecha desc, x.created_at desc limit 1) as nota
      from capacitaciones c
      where c.nuevo_id = p_empleado and c.estado = 'completada'
        and c.cierre between p_desde and p_hasta
    ) n
    where n.nota is not null
  ),
  desglose as (
    select
      coalesce((select sum(calificacion) from acts), 0) * (select v from cfg_act)          as actividades,
      case when (select v from tasa_venta) is null then 0::numeric
           else (select total from ventas) * (select v from tasa_venta)::numeric
      end                                                                                   as ventas
  )
  select jsonb_build_object(
    'operaciones',      round((select operaciones from cats), 2),
    'software',         round((select software from cats), 2),
    'limpieza',         round((select limpieza from cats), 2),
    'tardanza',
      case when (select v from modo) = 'proporcion' and (select n from puntual_debidos) > 0
           then round(20.0 * least((select puntuales from puntual_tard), (select n from puntual_debidos))
                      / (select n from puntual_debidos), 2)
           else greatest(0, 20 - floor((select min from tard) / (select v from div)))
      end,
    'puntualidadModo',       (select v from modo),
    'puntualidadDebidos',    (select n from puntual_debidos),
    'puntualidadPuntuales',  (select puntuales from puntual_tard),
    'puntualidadTardanzas',  (select tardanzas from puntual_tard),
    'descuento',        (select descuento from inc),
    'puntosPipeline',   round((select total from pipe), 2),
    'extrasMonto',      round((select total from extr), 2),
    'extrasCantidad',   (select cantidad from extr),
    'extrasPuntos',     round((select puntos from extr), 2),
    'valores',
      case when (select cantidad from val) > 0 then
        round((
          ( coalesce((select integridad from val), 0) + coalesce((select respeto from val), 0)
          + coalesce((select honestidad from val), 0) + coalesce((select amabilidad from val), 0)
          + coalesce((select relacion from val), 0)   + coalesce((select actitud from val), 0)
          ) / 6.0 / 5 * 20
        ), 1)
      else null end,
    'valoresCantidad',  (select cantidad from val),
    'bonusVentas',      0,
    -- 🆕 (0132) examenes: null si no hay capacitación cerrada en el ciclo (entrada manual).
    'examenes',         round((select promedio from exa), 2),
    'examenesCantidad', (select cantidad from exa),
    -- 🆕 (0095) — puntos como moneda, spec §2 C-1.
    'puntosActividades', round((select actividades from desglose), 2),
    'puntosVentas',      round((select ventas from desglose), 2),
    'ventasSinTasa',     (select v from tasa_venta) is null and (select cantidad from ventas) > 0,
    'puntosTotal',       round(
                            (select total from pipe) + (select puntos from extr)
                            + (select actividades from desglose) + (select ventas from desglose)
                            - (select descuento from inc)
                          , 2)
  );
$$;


-- ===== 0160_entrada_dias_pendientes.sql =====
-- 0160_entrada_dias_pendientes.sql — la entrada de liquidación puede armarse como borrador aunque
-- falten días por declarar.
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-18-liquidacion-borrador-dias-pendientes-design.md
-- Prueba: packages/db/pruebas/0160_entrada_dias_pendientes.prueba.sql   ZONA CRÍTICA (verificador antes de mergear).
--
-- Cuerpo EXACTO de public.sueldo_entrada de la 0144, con un cuarto argumento `p_permitir_pendientes`:
--   * false (la versión de 3 argumentos, ahora un envoltorio): igual que hoy; corta con DATO. El
--     cierre (0111) llama a ésta, así que NUNCA puede cerrar una liquidación con días sin declarar.
--   * true: no corta; los días sin declarar y los de tramos a medias salen en `diasSinDeclarar` y
--     NO entran a `asistencia` (un día a medias no se paga a medias). La clave solo aparece si hay
--     pendientes: la entrada estricta no cambia ni un byte.
-- Idempotente.

-- La firma de 3 argumentos (0144) se reemplaza por la de 4 con default: una sola versión.
drop function if exists public.sueldo_entrada(uuid, date, date);

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

-- Una sola firma (la 0127 prohíbe sobrecargas): las llamadas con 3 argumentos siguen siendo estrictas (default false).
revoke execute on function public.sueldo_entrada(uuid, date, date, boolean) from public, anon;
grant  execute on function public.sueldo_entrada(uuid, date, date, boolean) to authenticated;

comment on function public.sueldo_entrada(uuid, date, date, boolean) is
  '0160: entrada de liquidación de un tramo. Con p_permitir_pendientes=true arma un borrador y lista los días sin declarar en diasSinDeclarar; con false corta con DATO como siempre.';


-- ===== 0161_lista_precios.sql =====
-- 0161_lista_precios.sql — lista de precios de confecciones, editable por el administrador.
-- Spec: docs/superpowers/specs/2026-10-18-lista-de-precios-confecciones-design.md
-- Prueba: packages/db/pruebas/0161_lista_precios.prueba.sql
-- Nace VACÍA: no se inventa ningún precio (el catálogo inicial lo carga la dueña desde
-- /configuracion/lista-precios; anotado en docs/pendientes-negocio.md). Idempotente.

create table if not exists public.lista_precios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(btrim(nombre)) > 0),
  categoria   text not null check (categoria in ('prenda', 'servicio')),
  precio      numeric(10,2) not null check (precio >= 0),
  activo      boolean not null default true,
  creado_por  uuid references public.empleados(id) on delete set null,
  creado_en   timestamptz not null default now()
);

-- Un artículo no se repite aunque cambien mayúsculas o espacios.
create unique index if not exists lista_precios_nombre_uniq on public.lista_precios (lower(btrim(nombre)));

alter table public.lista_precios enable row level security;

drop policy if exists lista_precios_select on public.lista_precios;
create policy lista_precios_select on public.lista_precios for select to authenticated
  using (exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo));

drop policy if exists lista_precios_admin_insert on public.lista_precios;
create policy lista_precios_admin_insert on public.lista_precios for insert to authenticated
  with check (private.app_es_admin());

drop policy if exists lista_precios_admin_update on public.lista_precios;
create policy lista_precios_admin_update on public.lista_precios for update to authenticated
  using (private.app_es_admin()) with check (private.app_es_admin());

drop policy if exists lista_precios_admin_delete on public.lista_precios;
create policy lista_precios_admin_delete on public.lista_precios for delete to authenticated
  using (private.app_es_admin());

revoke all on public.lista_precios from anon, authenticated;
grant select, insert, update, delete on public.lista_precios to authenticated;

drop trigger if exists lista_precios_audit on public.lista_precios;
create trigger lista_precios_audit after insert or update or delete on public.lista_precios
  for each row execute function private.audit_log_trigger();

comment on table public.lista_precios is
  'Lista de precios de confecciones (0161). El administrador escribe, todo empleado activo lee. Vacía de origen: no hay precios inventados.';


-- ===== 0162_responsable_incidencia.sql =====
-- 0162_responsable_incidencia.sql — valida el responsable de una incidencia sin abrir `empleados`.
--
-- Spec: docs/superpowers/specs/2026-10-18-release-arreglos-verificador-design.md §1.
-- Un encargado solo ve su propia fila de `empleados` (RLS, 0002), así que la validación del
-- responsable hecha desde la app rechazaba todo reporte con un responsable ajeno. Esta función
-- decide por dentro y devuelve únicamente un booleano: no expone ningún dato de la persona.
-- Idempotente.

create or replace function public.incidencia_responsable_valido(p_empleado uuid, p_sede text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'PERMISO: inicia sesión para continuar';
  end if;
  if p_empleado is null or coalesce(p_sede, '') = '' then
    return false;
  end if;
  -- Solo el administrador o quien trabaja en esa sede puede preguntar por una persona de esa sede.
  if not (private.app_es_admin() or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no tienes acceso a esta sede';
  end if;
  return exists (
    select 1 from empleados e
    where e.id = p_empleado
      and e.activo
      and (e.sede_cod = p_sede
           or exists (select 1 from empleado_tiendas t where t.empleado_id = e.id and t.sede_cod = p_sede))
  );
end;
$$;

revoke execute on function public.incidencia_responsable_valido(uuid, text) from public, anon;
grant  execute on function public.incidencia_responsable_valido(uuid, text) to authenticated;

comment on function public.incidencia_responsable_valido(uuid, text) is
  '0162: ¿el empleado está activo y pertenece a la sede? Solo devuelve un booleano; exige ser admin o de esa sede.';

commit;
