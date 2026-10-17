-- 0140_rechazo_calidad.sql — un trabajo rechazado por calidad pierde todos sus puntos y el retrabajo no paga.
--
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-rechazo-calidad-pierde-puntos-design.md (decisión del
-- dueño, sesión 4B). Prueba: packages/db/pruebas/0140_rechazo_calidad.prueba.sql.
-- ZONA CRÍTICA (cadena del sueldo): spec y prueba van en commits anteriores a esta migración.
--
--  1) pipeline_rechazar: la fila negativa `<etapa>_rechazo` descuenta exactamente lo que el culpable
--     cobró en esa etapa para esa prenda (neto 0), en vez del peso actual de la etapa.
--  2) pipeline_registrar_punto: se quita la excepción de la 0130 por la que un rechazo reabría la
--     etapa: quien rehace una etapa rechazada tampoco cobra.
--
-- `create or replace` con las mismas firmas; conservan security definer, search_path y grants (0115/0122).
-- Idempotente. No agrega ningún parámetro de negocio.

create or replace function private.pipeline_registrar_punto(
  p_empleado uuid, p_pasada uuid, p_etapa text, p_puntos numeric, p_detalle text, p_historial uuid default null)
  returns uuid language plpgsql volatile security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  -- H-4: sólo cobra (o se descuenta) quien tiene rol de pipeline. Sin rol → no se escribe nada.
  if not exists (
    select 1 from public.empleados e
    where e.id = p_empleado and e.rol in ('admin', 'dueno', 'encargado_almacen', 'confeccionista')
  ) then
    return null;
  end if;
  -- 0130/0140: el retrabajo no paga. Una etapa ya pagada para esta prenda (o para su madre, si es una
  -- hija de dividir) no se vuelve a pagar, tampoco tras un rechazo de calidad: el rechazo le quita al
  -- culpable lo que cobró (pipeline_rechazar) pero NO reabre la etapa (decisión del dueño, 0140).
  if p_puntos > 0 and exists (
    select 1 from public.pipeline_puntos pp
    where pp.etapa = p_etapa and pp.puntos > 0
      and pp.pasada_id in (
        select p_pasada
        union
        select m.id from public.prenda_pasada m
         where m.dividida and m.dividida_en like '%' || p_pasada::text || '%')
  ) then
    return null;
  end if;
  insert into public.pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha, historial_id)
    values (p_empleado, p_pasada, p_etapa, p_puntos, p_detalle, now(), p_historial)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function pipeline_rechazar(p_id uuid, p_destino text, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_codigo text;
  v_culpable uuid; v_pts numeric; v_hist uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
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

  update prenda_pasada set etapa = p_destino, aprobada = false, fecha_actualizado = now() where id = p_id;
  v_hist := private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino);

  if v_culpable is not null then
    -- 0140: pierde TODOS los puntos de ese trabajo: lo que esa persona cobró en esa etapa para esta
    -- prenda (o su madre, si es hija de dividir), menos lo ya descontado por rechazos anteriores.
    -- Así el neto del trabajo queda en 0, sin depender del peso actual (`pts_*`) ni de si es media prenda.
    select coalesce(sum(pp.puntos), 0) into v_pts
      from pipeline_puntos pp
     where pp.empleado_id = v_culpable
       and pp.etapa in (p_destino, p_destino || '_rechazo')
       and pp.pasada_id in (
         select p_id
         union
         select m.id from prenda_pasada m where m.dividida and m.dividida_en like '%' || p_id::text || '%');
    if v_pts > 0 then
      perform private.pipeline_registrar_punto(v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino || '; pierde ' || v_pts || ' pts', v_hist);
    end if;
  end if;
end;
$$;

revoke execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) from public, anon;
grant  execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) to authenticated;
revoke execute on function pipeline_rechazar(uuid, text, uuid) from public, anon;
grant execute on function pipeline_rechazar(uuid, text, uuid) to authenticated;
