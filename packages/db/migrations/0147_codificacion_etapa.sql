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
