-- 0122_seguridad_produccion.sql — cierra H1, H14, H-2 y el hallazgo de datos_personas.
--
-- Spec: docs/superpowers/specs/2026-10-06-seguridad-produccion-design.md
-- Origen: docs/auditorias/2026-10-06-seguridad.md y docs/auditorias/2026-10-06-pipeline.md.
--
-- NO SE APLICA A PRODUCCIÓN DESDE ESTA RAMA. Se prueba en tools/postgres-local.sh; la aplicación
-- a producción la decide y la hace el administrador, con backup previo.
--
-- QUÉ CIERRA
--
-- H1  (no-negociable 2) pasada_rw, hist_rw y puntos_rw eran FOR ALL: cualquier rol con acceso a la
--     fila podía actualizar prenda_pasada a mano, insertar historial y fabricar puntos propios. Las
--     RPC del pipeline eran security invoker y dependían de esa policy. Ahora:
--       - las tres tablas quedan sólo de lectura para anon/authenticated (más un insert acotado en
--         prenda_pasada: recepción limpia, que usan pedido_crear/pedido_devolver);
--       - las RPC que escriben pasan a security definer con search_path fijo y llaman antes a
--         private.pipeline_exigir_acceso(), que reproduce lo que daba la RLS;
--       - lavanderia_enviar pasa a definer con el mismo control de sede que le daba listas_rw;
--       - nueva RPC pipeline_registrar_prenda para el alta manual.
--
-- H14 reportes_crear aceptaba p_encargado libre y dejaba al almacén crear turnos de cualquier sede.
--     Ahora el encargado de un no-admin es siempre quien registra, y la sede debe ser de sus sedes.
--
-- H-2 pipeline_deshacer no validaba la etapa (se podía "deshacer" listo -> recepcion y volver a
--     avanzar sumando puntos) y borraba el punto de quien deshace, no el del avance deshecho. Ahora
--     sólo revierte el último avance real y borra el punto de ese avance.
--
-- H-7 pipeline_rechazar y pipeline_calificar aceptaban cualquier origen y destino (rechazar una
--     prenda en listo a recepción y volver a avanzarla). Ahora sólo lo que ofrece la pantalla.
--
-- datos_personas  Decisión del dueño (06-oct-2026): «cada persona sólo ve lo suyo, excepto los
--     admins». private.app_ve_datos_personas() deja de leer permisos_modulos: sólo admin/dueno activo.
--
-- Cuerpos de las RPC: idénticos a los vigentes en producción (main hasta 0109) salvo lo descrito.
-- IDEMPOTENTE: create or replace, drop policy if exists, revoke/grant repetibles.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Portero del pipeline
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.pipeline_exigir_acceso(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1 from public.prenda_pasada p
    where p.id = p_id
      and (private.app_es_admin() or private.app_es_almacen()
           or p.sede_origen_cod in (select private.app_sedes()))
  ) then
    raise exception 'Prenda no encontrada';
  end if;
end;
$$;

revoke all on function private.pipeline_exigir_acceso(uuid) from public, anon;
grant execute on function private.pipeline_exigir_acceso(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) RPC del pipeline: security definer + portero
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.pipeline_avanzar(p_id uuid, p_destino text)
 returns numeric
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_etapa text; v_tipo text; v_tlav text; v_codigo text; v_dividida boolean;
  v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
  v_permitidos text[];
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  select etapa, tipo, tipo_lavado, codigo, dividida
    into v_etapa, v_tipo, v_tlav, v_codigo, v_dividida
    from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_dividida then raise exception 'Prenda dividida'; end if;

  -- Lista blanca. Las etapas sin salida ('vacio', 'listo' y todo lo de fuera del pipeline)
  -- caen en array vacío: desde ahí no se avanza. 'listo' → 'enviado' NO es un avance, es
  -- pipeline_enviar (0009/0055), que además crea el envío y libera el activo de inventario.
  v_permitidos := case v_etapa
    when 'recepcion'       then array['lavado', 'refaccion']
    when 'lavado'          then array['empatado']
    when 'empatado'        then array['refaccion']
    when 'refaccion'       then array['compostura', 'planchado']
    when 'compostura'      then array['planchado']
    when 'planchado'       then array['control_calidad']
    when 'control_calidad' then array['listo']
    else array[]::text[]
  end;
  -- `not (x = any(...))` y no `x <> any(...)`: el segundo es verdadero en cuanto UN elemento
  -- difiere, así que rechazaría los destinos válidos de toda etapa con más de una salida.
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

  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
  values (p_id, v_etapa, p_destino, v_actor, null);

  if v_pts > 0 then
    insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end, now());
  end if;
  return coalesce(v_pts, 0);
end;
$function$;

-- Se vuelve a crear sólo para dejarla documentada: sigue siendo security INVOKER y llama a la
-- definer de arriba, que es la que hace el control de acceso por prenda. Comportamiento igual.
create or replace function public.pipeline_avanzar_tanda(p_ids uuid[], p_destino text)
 returns numeric
 language plpgsql
 set search_path to 'public'
as $function$
declare v_id uuid; v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  foreach v_id in array p_ids loop
    begin
      v_total := v_total + coalesce(pipeline_avanzar(v_id, p_destino), 0);
    exception when others then null; -- omite prendas que no se pueden avanzar
    end;
  end loop;
  return v_total;
end;
$function$;

-- pipeline_calificar: la tienda DESTINO del envío califica la prenda aunque la sede de origen sea
-- otra, así que no usa pipeline_exigir_acceso: admite además sede_destino_cod del envío en mis sedes.
create or replace function public.pipeline_calificar(p_id uuid, p_aceptada boolean, p_destino text, p_obs text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_actor uuid := auth.uid(); v_etapa text; v_envio uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1 from prenda_pasada p
    where p.id = p_id
      and (private.app_es_admin() or private.app_es_almacen()
           or p.sede_origen_cod in (select private.app_sedes())
           or exists (select 1 from envios_prendas e
                      where e.id = p.envio_id
                        and e.sede_destino_cod in (select private.app_sedes())))
  ) then
    raise exception 'Prenda no encontrada';
  end if;
  select etapa, envio_id into v_etapa, v_envio from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  -- H-7: se califica lo que llegó a la tienda; si se observa, vuelve a una etapa del proceso.
  if v_etapa <> 'enviado' then
    raise exception 'TRANSICION: sólo se califica una prenda enviada';
  end if;
  if not coalesce(p_aceptada, false)
     and (p_destino is null
          or not (p_destino = any(array['recepcion','lavado','empatado','refaccion','compostura',
                                        'planchado','control_calidad']))) then
    raise exception 'TRANSICION: una prenda observada vuelve a una etapa del proceso';
  end if;

  insert into prenda_calificacion (pasada_id, envio_id, aceptada, obs, calificador_id)
    values (p_id, v_envio, p_aceptada, nullif(p_obs, ''), v_actor);

  if p_aceptada then
    update prenda_pasada set etapa = 'recibido', fecha_actualizado = now() where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
      values (p_id, v_etapa, 'recibido', v_actor, 'Recibida y aceptada en tienda');
  else
    update prenda_pasada set etapa = p_destino, envio_id = null, aprobada = false, fecha_actualizado = now()
      where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
      values (p_id, v_etapa, p_destino, v_actor,
              'Observada en tienda → ' || p_destino || coalesce(': ' || nullif(p_obs, ''), ''));
  end if;
end;
$function$;

-- H-2: sólo se deshace el último avance real, y se borra el punto de ESE avance.
create or replace function public.pipeline_deshacer(p_id uuid, p_etapa_anterior text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_etapa text; v_dividida boolean;
  h prenda_historial;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);

  select etapa, dividida into v_etapa, v_dividida
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa = 'dividido' or coalesce(v_dividida, false) then
    raise exception 'TRANSICION: una prenda dividida se deshace con «deshacer división»';
  end if;

  select * into h from prenda_historial
    where pasada_id = p_id order by fecha desc, id desc limit 1;
  -- obs null es la marca de un avance real de pipeline_avanzar; el resto (rechazos, envíos,
  -- divisiones, un "Deshacer" previo) no se deshace por esta vía.
  if h.id is null or h.obs is not null
     or h.etapa_nueva is distinct from v_etapa
     or h.etapa_anterior is null
     or h.etapa_anterior is distinct from p_etapa_anterior then
    raise exception 'TRANSICION: sólo se puede deshacer el último avance de la prenda';
  end if;

  update prenda_pasada set
    etapa = p_etapa_anterior,
    fecha_actualizado = now(),
    aprobada = case when v_etapa = 'listo' then false else aprobada end
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, v_etapa, p_etapa_anterior, v_actor, 'Deshacer');

  -- pipeline_avanzar escribe historial y punto con el mismo now() en la misma transacción.
  -- Se quita el punto del que hizo el avance (h.empleado_id), no el de quien deshace.
  delete from pipeline_puntos where id = (
    select id from pipeline_puntos
    where pasada_id = p_id and empleado_id = h.empleado_id
      and etapa = h.etapa_anterior and puntos > 0 and fecha = h.fecha
    order by id limit 1
  );
end;
$function$;

create or replace function public.pipeline_deshacer_division(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_actor          uuid := auth.uid();
  v_pr             prenda_pasada;
  v_hijos          uuid[];
  v_hijo_id        uuid;
  v_hijo_etapa     text;
  v_avanzo         boolean;
  v_etapa_original text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);

  select * into v_pr from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if not v_pr.dividida or v_pr.etapa <> 'dividido' then
    raise exception 'Esta prenda no está dividida — nada que deshacer';
  end if;
  if v_pr.dividida_en is null or trim(v_pr.dividida_en) = '' then
    raise exception 'La prenda está marcada como dividida pero no tiene hijas registradas (dividida_en vacío) — revisar a mano';
  end if;

  begin
    select array_agg(x::uuid) into v_hijos from unnest(string_to_array(v_pr.dividida_en, ',')) x;
  exception when invalid_text_representation then
    raise exception 'dividida_en con formato inesperado: %', v_pr.dividida_en;
  end;
  if array_length(v_hijos, 1) is distinct from 2 then
    raise exception 'Se esperaban 2 hijas (saco+pantalón) en dividida_en, hay %: %',
      coalesce(array_length(v_hijos, 1), 0), v_pr.dividida_en;
  end if;

  -- El historial de la propia madre trae la etapa en la que estaba ANTES de dividir (la que
  -- deben tener sus dos hijas ahora mismo si ninguna avanzó) — más confiable que asumir un valor.
  select etapa_anterior into v_etapa_original
    from prenda_historial
    where pasada_id = p_id and etapa_nueva = 'dividido'
    order by fecha desc limit 1;
  if v_etapa_original is null then
    raise exception 'No se encontró en el historial la etapa previa a la división — no se puede restaurar la madre de forma segura';
  end if;

  -- 1) Validar CADA hija ANTES de borrar nada: que exista, que nunca haya avanzado de etapa
  --    (ver comentario de arriba) y que su etapa actual siga siendo la de nacimiento.
  foreach v_hijo_id in array v_hijos loop
    select etapa into v_hijo_etapa from prenda_pasada where id = v_hijo_id;
    if not found then
      raise exception 'La pieza % no existe — no se puede deshacer la división de forma segura', v_hijo_id;
    end if;

    select exists (
      select 1 from prenda_historial where pasada_id = v_hijo_id and etapa_anterior is not null
    ) into v_avanzo;
    if v_avanzo then
      raise exception 'No se puede deshacer: al menos una pieza (saco o pantalón) ya avanzó de etapa';
    end if;

    if v_hijo_etapa is distinct from v_etapa_original then
      raise exception 'No se puede deshacer: la pieza % está en una etapa distinta a la original (%)',
        v_hijo_id, v_etapa_original;
    end if;
  end loop;

  -- 2) Todo validado — recién ahora se borra. pipeline_puntos primero (defensivo: el chequeo de
  --    arriba implica que no debería haber filas, "sin puntos por dividir" ya lo garantiza 0012),
  --    después las hijas (prenda_historial cae por ON DELETE CASCADE, ver 0001_init.sql).
  delete from pipeline_puntos where pasada_id = any(v_hijos);
  delete from prenda_pasada where id = any(v_hijos);

  update prenda_pasada set
    dividida = false, dividida_en = null, etapa = v_etapa_original, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, 'dividido', v_etapa_original, v_actor, 'Deshacer división: vuelve a ' || v_etapa_original);
end;
$function$;

create or replace function public.pipeline_dividir(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_pr prenda_pasada;
  v_saco uuid; v_pant uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  select * into v_pr from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_pr.dividida then raise exception 'Esta prenda ya fue dividida'; end if;

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-S', 'Saco', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_saco;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    values (v_saco, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo);

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_pant;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    values (v_pant, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo);

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón');
end;
$function$;

-- pipeline_enviar: además valida que la sede destino exista (antes fallaba con un error de FK).
create or replace function public.pipeline_enviar(p_id uuid, p_sede text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_actor uuid := auth.uid(); v_etapa text; v_envio uuid; v_activo_id uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  select etapa, activo_id into v_etapa, v_activo_id from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'listo' then raise exception 'Solo se envían prendas listas'; end if;
  if p_sede is null or not exists (select 1 from public.sedes where cod = p_sede) then
    raise exception 'La sede de destino % no existe', coalesce(p_sede, '(vacía)');
  end if;

  insert into envios_prendas (sede_destino_cod, fecha, responsable_id, estado)
    values (p_sede, now(), v_actor, 'enviado') returning id into v_envio;
  update prenda_pasada set etapa = 'enviado', envio_id = v_envio, fecha_actualizado = now() where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, 'listo', 'enviado', v_actor, 'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede);

  -- Fase 7 tarea 2: el activo vinculado sale del pipeline y queda disponible para la venta/alquiler.
  if v_activo_id is not null then
    update inventario_activo
      set estado = 'disponible'
      where id = v_activo_id and estado in ('codificando', 'en_pipeline', 'en_compostura');
  end if;
end;
$function$;

create or replace function public.pipeline_rechazar(p_id uuid, p_destino text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_etapa text; v_tipo text; v_tlav text; v_codigo text;
  v_culpable uuid; v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  select etapa, tipo, tipo_lavado, codigo into v_etapa, v_tipo, v_tlav, v_codigo
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  -- H-7: sólo lo que ofrece la pantalla (control de calidad devuelve a una etapa anterior).
  -- Sin esto, rechazar una prenda en listo a recepción y volver a avanzarla suma puntos.
  if v_etapa <> 'control_calidad'
     or p_destino is null
     or not (p_destino = any(array['recepcion','lavado','empatado','refaccion','compostura','planchado'])) then
    raise exception 'TRANSICION: sólo se rechaza desde control de calidad hacia una etapa anterior';
  end if;

  select empleado_id into v_culpable from prenda_historial
    where pasada_id = p_id and etapa_anterior = p_destino and empleado_id is not null
    order by fecha desc limit 1;

  update prenda_pasada set etapa = p_destino, aprobada = false, fecha_actualizado = now() where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino);

  if v_culpable is not null then
    if p_destino = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
    else v_clave := 'pts_' || p_destino; end if;
    select valor::numeric into v_peso from config where clave = v_clave;
    if v_peso is null then v_peso := 1; end if;
    v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
               and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
    v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;
    if v_pts > 0 then
      insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
      values (v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino, now());
    end if;
  end if;
end;
$function$;

revoke execute on function public.pipeline_avanzar(uuid, text)                   from public, anon;
revoke execute on function public.pipeline_avanzar_tanda(uuid[], text)           from public, anon;
revoke execute on function public.pipeline_rechazar(uuid, text)                  from public, anon;
revoke execute on function public.pipeline_enviar(uuid, text)                    from public, anon;
revoke execute on function public.pipeline_dividir(uuid)                         from public, anon;
revoke execute on function public.pipeline_deshacer_division(uuid)               from public, anon;
revoke execute on function public.pipeline_calificar(uuid, boolean, text, text)  from public, anon;
revoke execute on function public.pipeline_deshacer(uuid, text)                  from public, anon;
grant  execute on function public.pipeline_avanzar(uuid, text)                   to authenticated;
grant  execute on function public.pipeline_avanzar_tanda(uuid[], text)           to authenticated;
grant  execute on function public.pipeline_rechazar(uuid, text)                  to authenticated;
grant  execute on function public.pipeline_enviar(uuid, text)                    to authenticated;
grant  execute on function public.pipeline_dividir(uuid)                         to authenticated;
grant  execute on function public.pipeline_deshacer_division(uuid)               to authenticated;
grant  execute on function public.pipeline_calificar(uuid, boolean, text, text)  to authenticated;
grant  execute on function public.pipeline_deshacer(uuid, text)                  to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) lavanderia_enviar: security definer con el control de sede que daba listas_rw (0006)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.lavanderia_enviar(
  p_sede text, p_tipo text, p_resp_inv text, p_resp_traslado text,
  p_generales jsonb default '{}'::jsonb, p_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
  v_item  jsonb;
  v_etapa text;
  v_activo_id uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  -- Reemplaza al with check de listas_rw, que esta función deja de tener encima al ser definer.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes enviar a lavandería desde la sede %', p_sede;
  end if;

  insert into listas_lavanderia (
    sede_cod, tipo, fecha, resp_inv, resp_traslado,
    camisas, corbatas, michis, corbatones, porta_ternos, zapatos
  ) values (
    p_sede, p_tipo, now(), nullif(p_resp_inv, ''), nullif(p_resp_traslado, ''),
    coalesce((p_generales->>'camisas')::int, 0),
    coalesce((p_generales->>'corbatas')::int, 0),
    coalesce((p_generales->>'michis')::int, 0),
    coalesce((p_generales->>'corbatones')::int, 0),
    coalesce((p_generales->>'porta_ternos')::int, 0),
    coalesce((p_generales->>'zapatos')::int, 0)
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'cod', '') = '' then continue; end if;

    insert into lista_items (lista_id, cod, tipo, color, talla, obs, motivo)
    values (v_id, v_item->>'cod', v_item->>'tipo', v_item->>'color', v_item->>'talla',
            v_item->>'obs', v_item->>'motivo');

    -- Auto-insert al pipeline (mismo comportamiento que routes/lavanderia.js): refacción
    -- siempre a compostura; el resto entra a recepción salvo que la tienda marque el ítem.
    v_etapa := case
      when p_tipo = 'REF' or v_item->>'destino' = 'compostura' then 'compostura'
      else 'recepcion'
    end;

    select id into v_activo_id from inventario_activo where codigo = v_item->>'cod' limit 1;

    insert into prenda_pasada (
      activo_id, codigo, tipo, color, talla, sede_origen_cod, etapa, lista_lavanderia_id
    ) values (
      v_activo_id, v_item->>'cod', v_item->>'tipo', v_item->>'color', v_item->>'talla',
      p_sede, v_etapa, v_id
    );

    -- prenda_historial usa empleado_id (uuid, ya migrado del pseudo-FK por nombre TEXT que
    -- describe CLAUDE.md) — v_actor es quien ejecuta el envío, no resp_traslado (nombre libre
    -- sin garantía de tener cuenta en el sistema).
    insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    select p.id, v_etapa, v_actor, 'Lista ' || v_id || coalesce(' · traslado: ' || nullif(p_resp_traslado, ''), '')
    from prenda_pasada p where p.lista_lavanderia_id = v_id and p.codigo = v_item->>'cod'
    order by p.fecha_ingreso desc limit 1;
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.lavanderia_enviar(text, text, text, text, jsonb, jsonb) from public, anon;
grant  execute on function public.lavanderia_enviar(text, text, text, text, jsonb, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) Alta manual de prendas (pestaña Registrar)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.pipeline_registrar_prenda(
  p_codigo text, p_tipo text, p_color text, p_talla text, p_sede text,
  p_tipo_lavado text, p_necesita_compostura boolean, p_obs text,
  p_activo_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  -- Misma condición que la policy pasada_insert.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes registrar prendas de la sede %', p_sede;
  end if;
  if nullif(trim(coalesce(p_codigo, '')), '') is null then
    raise exception 'El código de la prenda es obligatorio';
  end if;
  if nullif(trim(coalesce(p_tipo, '')), '') is null then
    raise exception 'El tipo de la prenda es obligatorio';
  end if;
  if p_sede is null or not exists (select 1 from sedes where cod = p_sede) then
    raise exception 'La sede % no existe', coalesce(p_sede, '(vacía)');
  end if;
  if p_activo_id is not null
     and not exists (select 1 from inventario_activo where id = p_activo_id) then
    raise exception 'El activo de inventario indicado no existe';
  end if;

  insert into prenda_pasada
    (activo_id, codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado,
     necesita_compostura, obs_general)
  values
    (p_activo_id, trim(p_codigo), trim(p_tipo), coalesce(p_color, ''), coalesce(p_talla, ''),
     p_sede, 'recepcion', p_tipo_lavado, coalesce(p_necesita_compostura, false), p_obs)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid) from public, anon;
grant  execute on function public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) Tablas del pipeline: sólo lectura directa
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- prenda_pasada: lectura como hoy; insert sólo de una prenda limpia en recepción (lo usan
-- pedido_crear / pedido_devolver, invoker); sin update ni delete.
drop policy if exists pasada_rw on prenda_pasada;
drop policy if exists pasada_select on prenda_pasada;
drop policy if exists pasada_insert on prenda_pasada;
create policy pasada_select on prenda_pasada for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_origen_cod in (select private.app_sedes()));
create policy pasada_insert on prenda_pasada for insert
  with check (
    (private.app_es_admin() or private.app_es_almacen() or sede_origen_cod in (select private.app_sedes()))
    and etapa = 'recepcion'
    and envio_id is null
    and not coalesce(dividida, false)
    and dividida_en is null
    and not coalesce(aprobada, false)
    and lavador_id is null
    and planchador_id is null
  );
revoke update, delete, truncate on prenda_pasada from anon, authenticated;
revoke insert on prenda_pasada from anon;

drop policy if exists hist_rw on prenda_historial;
drop policy if exists hist_select on prenda_historial;
create policy hist_select on prenda_historial for select
  using (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from prenda_pasada p
      where p.id = prenda_historial.pasada_id and p.sede_origen_cod in (select private.app_sedes())
    )
  );
revoke insert, update, delete, truncate on prenda_historial from anon, authenticated;

drop policy if exists puntos_rw on pipeline_puntos;
drop policy if exists puntos_select on pipeline_puntos;
create policy puntos_select on pipeline_puntos for select
  using (
    private.app_es_admin() or private.app_es_almacen() or empleado_id = auth.uid() or exists (
      select 1 from prenda_pasada p
      where p.id = pipeline_puntos.pasada_id and p.sede_origen_cod in (select private.app_sedes())
    )
  );
revoke insert, update, delete, truncate on pipeline_puntos from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) H14 — reportes_crear
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Cuerpo idéntico al de la 0081 salvo (a) el encargado y (b) el control de sede.
create or replace function reportes_crear(
  p_id text, p_sede text, p_turno text,
  p_act_total int, p_act_done int,
  p_trabajadores uuid[], p_actividades jsonb, p_extras jsonb,
  p_encargado uuid default null
) returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_encargado   uuid;
  v_m           text[];
  v_fecha       date;
  v_bloqueantes text[];
  v_conflicto_id text;
  v_pendiente_id text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  -- Sólo el administrador puede registrar un turno a nombre de otra persona, y ésta debe estar
  -- activa. Cualquier otro rol es siempre el encargado de lo que registra.
  if private.app_es_admin() then
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
      coalesce(nullif(e->>'registrado_por_id', '')::uuid, v_actor)
    from jsonb_array_elements(p_extras) e
    left join actividades_config cat
      on cat.sede_cod = p_sede and cat.cod = nullif(e->>'cod', '') and cat.categoria = 'EXT'
    where coalesce(e->>'nombre', '') <> '' or nullif(e->>'cod', '') is not null;
  end if;

  return p_id;
end;
$$;

revoke execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid)
  from public, anon;
grant  execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid)
  to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7) datos_personas — sólo admin/dueno ven lo de otros
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Decisión del dueño (06-oct-2026): «cada persona sólo ve lo suyo, excepto los admins». Se ignora
-- permisos_modulos: marcar datos_personas = {ver} ya no abre datos ajenos. Las policies de pagos,
-- asistencias y evaluaciones no cambian (admin, o este helper, o lo propio).
create or replace function private.app_ve_datos_personas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empleados e
    where e.id = auth.uid()
      and e.activo
      and e.rol in ('admin', 'dueno')
  );
$$;

revoke execute on function private.app_ve_datos_personas() from public, anon;
grant  execute on function private.app_ve_datos_personas() to authenticated;
