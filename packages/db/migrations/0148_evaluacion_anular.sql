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
