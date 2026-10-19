-- 0180 — Codificación va DESPUÉS de Compostura (decisión del dueño, 19-oct-2026). Corrige la 0147.
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-codificacion-despues-de-compostura-design.md
-- Prueba: packages/db/pruebas/0180_codificacion_despues_compostura.prueba.sql (escrita antes). Idempotente.
--
-- Mismo cuerpo que pipeline_avanzar de la 0158; cambia solo la lista blanca de transiciones.
-- Las prendas que ya estaban en «codificacion» por el orden viejo (entraron desde recepción, sin
-- lavar) conservan su salida a lavado/refacción, solo si su historial tiene recepcion → codificacion.
-- No se mueve ningún dato.
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

  -- Lista blanca (0086; 0180 mueve «codificacion» después de compostura). Etapas sin salida: array vacío.
  v_permitidos := case v_etapa
    when 'recepcion'       then array['lavado', 'refaccion']
    when 'lavado'          then array['empatado']
    when 'empatado'        then array['refaccion']
    when 'refaccion'       then array['compostura', 'codificacion', 'planchado']
    when 'compostura'      then array['codificacion', 'planchado']
    when 'codificacion'    then array['planchado']
    when 'planchado'       then array['control_calidad']
    when 'control_calidad' then array['listo']
    else array[]::text[]
  end;
  -- Orden viejo (0147): entró a codificación desde recepción y aún no se lavó.
  if v_etapa = 'codificacion' and (
       select h.etapa_anterior from prenda_historial h
        where h.pasada_id = p_id and h.etapa_nueva = 'codificacion'
        order by h.fecha desc limit 1) = 'recepcion' then
    v_permitidos := v_permitidos || array['lavado', 'refaccion'];
  end if;
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

revoke execute on function public.pipeline_avanzar(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_avanzar(uuid, text, uuid) to authenticated;
