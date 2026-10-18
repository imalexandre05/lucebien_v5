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
