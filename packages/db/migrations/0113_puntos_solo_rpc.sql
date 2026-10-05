-- 0113_puntos_solo_rpc.sql — sólo las RPC del pipeline escriben `pipeline_puntos` y `prenda_historial`.
--
-- Implementa docs/superpowers/specs/pipeline/2026-10-05-puntos-solo-rpc-design.md (ticket
-- imalexandre05/lucebien-tablero#36). Prueba: packages/db/pruebas/0113_puntos_solo_rpc.prueba.sql
-- (bash tools/probar-migracion.sh 0113). Va encima de la 0112 (PR #42): reescribe las mismas RPC.
--
-- EL PROBLEMA. `puntos_rw` (pipeline_puntos) y `hist_rw` (prenda_historial) eran `FOR ALL` (0006):
-- cualquier sesión que cumpliera la condición de lectura —incluido un empleado sobre SUS PROPIOS
-- puntos— podía insertar, editar y borrar por la API directa, sin pasar por ninguna RPC. Los puntos
-- alimentan reportes → nota /20 → pago; el historial es la evidencia para auditar cada movimiento.
--
-- LA CORRECCIÓN.
--   1) `authenticated` y `anon` pierden insert/update/delete/truncate sobre las dos tablas; las
--      policies `*_rw` se sustituyen por `*_sel` (`for select`, MISMA condición de lectura).
--   2) Toda escritura pasa por tres funciones `private.*` (`security definer`, `search_path =
--      public`, `grant execute to authenticated`: patrón de la 0037; PostgREST no expone el schema
--      `private`, así que un cliente no las puede llamar directo):
--        private.pipeline_registrar_punto(...)   private.pipeline_borrar_punto(...)
--        private.prenda_historial_registrar(...)
--   3) Esas funciones validan por sí mismas que quien llama tenga derecho sobre la prenda (la
--      misma condición que daba `pasada_rw` para escribir: admin, almacén o prenda de su sede),
--      para no ser una puerta nueva. SE ENDURECE un punto: desaparece la rama «o `empleado_id =
--      auth.uid()`», que es la que dejaba sumarse puntos a uno mismo. Las RPC nunca la necesitan.
--   4) Las RPC siguen `security invoker` (la RLS de `prenda_pasada` sigue mandando). Mismos
--      cuerpos y firmas que en la 0112; sólo cambian las líneas que escribían directo.
--   `lavanderia_enviar` (0066) también escribía en `prenda_historial`: pasa por la función.
--
-- NO TOCA: `empleado_borrar_alta` (0099) y los `security definer` del dueño de las tablas (no pasan
-- por estos permisos); `service_role`; la lectura de nadie; la lógica de puntos.
--
-- RLS SIN POLICY DE ESCRITURA, A PROPÓSITO. El recordatorio de abajo («toda tabla con RLS necesita
-- policy de escritura») existe porque sin policy las escrituras fallan EN SILENCIO. Aquí no: el
-- permiso de tabla está revocado, así que fallan con `42501 permission denied`, ruidosamente.
--
-- Idempotente: `drop policy if exists`, `create or replace`, `revoke`/`grant` repetibles.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25). Aquí SÍ se usa:
--     es la misma condición que ya tenía la policy de escritura de estas tablas (el almacén opera
--     el pipeline completo); no se amplía a nadie.
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio. (Aquí es a propósito: ver arriba.)
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5). Esta migración no agrega ninguno.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Permisos de las tablas: authenticated y anon sólo leen
-- ═══════════════════════════════════════════════════════════════════════════════════════════

revoke insert, update, delete, truncate, references, trigger
  on public.pipeline_puntos, public.prenda_historial from authenticated, anon;
grant select on public.pipeline_puntos, public.prenda_historial to authenticated;

drop policy if exists puntos_rw  on public.pipeline_puntos;
drop policy if exists puntos_sel on public.pipeline_puntos;
create policy puntos_sel on public.pipeline_puntos for select
  using (
    private.app_es_admin() or private.app_es_almacen() or empleado_id = auth.uid() or exists (
      select 1 from public.prenda_pasada p
      where p.id = pipeline_puntos.pasada_id and p.sede_origen_cod in (select private.app_sedes())
    )
  );

drop policy if exists hist_rw  on public.prenda_historial;
drop policy if exists hist_sel on public.prenda_historial;
create policy hist_sel on public.prenda_historial for select
  using (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from public.prenda_pasada p
      where p.id = prenda_historial.pasada_id and p.sede_origen_cod in (select private.app_sedes())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Las tres funciones de escritura (security definer, schema private)
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ¿Tiene quien llama derecho a escribir sobre esta prenda? Lanza si no. Es la misma condición que
-- `pasada_rw` (admin, almacén o prenda de su sede) SIN la rama «sus propios puntos». Sin grant: sólo
-- la llaman las tres funciones de abajo (definer), nunca un cliente.
create or replace function private.pipeline_exigir_derecho(p_pasada uuid)
  returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_pasada is null then
    raise exception 'PERMISO: falta la prenda sobre la que se escribe';
  end if;
  if not exists (select 1 from public.prenda_pasada where id = p_pasada) then
    raise exception 'PERMISO: la prenda % no existe', p_pasada;
  end if;
  if not (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from public.prenda_pasada p
      where p.id = p_pasada and p.sede_origen_cod in (select private.app_sedes())
    )
  ) then
    raise exception 'PERMISO: sin derecho sobre la prenda %', p_pasada;
  end if;
end;
$$;
revoke execute on function private.pipeline_exigir_derecho(uuid) from public, anon, authenticated;

create or replace function private.pipeline_registrar_punto(
  p_empleado uuid, p_pasada uuid, p_etapa text, p_puntos numeric, p_detalle text)
  returns uuid language plpgsql volatile security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  insert into public.pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (p_empleado, p_pasada, p_etapa, p_puntos, p_detalle, now())
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text) from public, anon;
grant  execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text) to authenticated;

-- p_todos = false → borra el ÚLTIMO punto positivo de p_empleado en esa prenda (deshacer).
-- p_todos = true  → borra todos los puntos de esa prenda (deshacer división). Devuelve las filas borradas.
create or replace function private.pipeline_borrar_punto(
  p_pasada uuid, p_empleado uuid default null, p_todos boolean default false)
  returns int language plpgsql volatile security definer set search_path = public
as $$
declare v_n int;
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  if p_todos then
    delete from public.pipeline_puntos where pasada_id = p_pasada;
  else
    delete from public.pipeline_puntos where id = (
      select id from public.pipeline_puntos
      where pasada_id = p_pasada and empleado_id = p_empleado and puntos > 0
      order by fecha desc limit 1
    );
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function private.pipeline_borrar_punto(uuid, uuid, boolean) from public, anon;
grant  execute on function private.pipeline_borrar_punto(uuid, uuid, boolean) to authenticated;

-- `registrado_por` no es un parámetro: siempre es auth.uid() (quien tenía la sesión), no se falsifica.
create or replace function private.prenda_historial_registrar(
  p_pasada uuid, p_etapa_anterior text, p_etapa_nueva text, p_empleado uuid, p_obs text)
  returns void language plpgsql volatile security definer set search_path = public
as $$
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  insert into public.prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
    values (p_pasada, p_etapa_anterior, p_etapa_nueva, p_empleado, p_obs, auth.uid());
end;
$$;
revoke execute on function private.prenda_historial_registrar(uuid, text, text, uuid, text) from public, anon;
grant  execute on function private.prenda_historial_registrar(uuid, text, text, uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Las RPC del pipeline. Mismo cuerpo que en la 0112 (firmas idénticas: no hay sobrecarga que
--    borrar); sólo cambian las líneas que escribían en las dos tablas.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create or replace function pipeline_avanzar(p_id uuid, p_destino text, p_operador uuid default null)
  returns numeric language plpgsql security invoker set search_path = public
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_tipo text; v_tlav text; v_codigo text; v_dividida boolean;
  v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
  v_permitidos text[];
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);
  select etapa, tipo, tipo_lavado, codigo, dividida
    into v_etapa, v_tipo, v_tlav, v_codigo, v_dividida
    from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_dividida then raise exception 'Prenda dividida'; end if;

  -- Lista blanca (0086). Las etapas sin salida caen en array vacío.
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

  perform private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, null);

  if v_pts > 0 then
    perform private.pipeline_registrar_punto(v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end);
  end if;
  return coalesce(v_pts, 0);
end;
$$;
revoke execute on function pipeline_avanzar(uuid, text, uuid) from public, anon;
grant execute on function pipeline_avanzar(uuid, text, uuid) to authenticated;

-- Tanda: el token se resuelve ANTES del bucle. El bucle traga las excepciones por prenda (las que
-- no se pueden avanzar se omiten); un token malo no debe convertirse en «no movió nada».
create or replace function pipeline_avanzar_tanda(p_ids uuid[], p_destino text, p_operador uuid default null)
  returns numeric language plpgsql security invoker set search_path = public
as $$
declare v_id uuid; v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform private.actor_pipeline(p_operador);   -- lanza CODIGO: si el token no vale; aborta todo
  foreach v_id in array p_ids loop
    begin
      v_total := v_total + coalesce(pipeline_avanzar(v_id, p_destino, p_operador), 0);
    exception when others then null; -- omite prendas que no se pueden avanzar
    end;
  end loop;
  return v_total;
end;
$$;
revoke execute on function pipeline_avanzar_tanda(uuid[], text, uuid) from public, anon;
grant execute on function pipeline_avanzar_tanda(uuid[], text, uuid) to authenticated;

create or replace function pipeline_enviar(p_id uuid, p_sede text, p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_sesion uuid := auth.uid(); v_actor uuid; v_etapa text; v_envio uuid; v_activo_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);
  select etapa, activo_id into v_etapa, v_activo_id from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'listo' then raise exception 'Solo se envían prendas listas'; end if;

  insert into envios_prendas (sede_destino_cod, fecha, responsable_id, estado)
    values (p_sede, now(), v_actor, 'enviado') returning id into v_envio;
  update prenda_pasada set etapa = 'enviado', envio_id = v_envio, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, 'listo', 'enviado', v_actor,
    'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede);

  -- Fase 7 tarea 2 (0055): el activo vinculado sale del pipeline y queda disponible.
  if v_activo_id is not null then
    update inventario_activo
      set estado = 'disponible'
      where id = v_activo_id and estado in ('codificando', 'en_pipeline', 'en_compostura');
  end if;
end;
$$;
revoke execute on function pipeline_enviar(uuid, text, uuid) from public, anon;
grant execute on function pipeline_enviar(uuid, text, uuid) to authenticated;

create or replace function pipeline_rechazar(p_id uuid, p_destino text, p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_tipo text; v_tlav text; v_codigo text;
  v_culpable uuid; v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);
  select etapa, tipo, tipo_lavado, codigo into v_etapa, v_tipo, v_tlav, v_codigo
    from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;

  select empleado_id into v_culpable from prenda_historial
    where pasada_id = p_id and etapa_anterior = p_destino and empleado_id is not null
    order by fecha desc limit 1;

  update prenda_pasada set etapa = p_destino, aprobada = false, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino);

  if v_culpable is not null then
    if p_destino = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
    else v_clave := 'pts_' || p_destino; end if;
    select valor::numeric into v_peso from config where clave = v_clave;
    if v_peso is null then v_peso := 1; end if;
    v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
               and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
    v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;
    if v_pts > 0 then
      perform private.pipeline_registrar_punto(v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino);
    end if;
  end if;
end;
$$;
revoke execute on function pipeline_rechazar(uuid, text, uuid) from public, anon;
grant execute on function pipeline_rechazar(uuid, text, uuid) to authenticated;

create or replace function pipeline_deshacer(p_id uuid, p_etapa_anterior text, p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_sesion uuid := auth.uid(); v_actor uuid; v_etapa text;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);
  select etapa into v_etapa from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;

  update prenda_pasada set etapa = p_etapa_anterior, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, v_etapa, p_etapa_anterior, v_actor, 'Deshacer');
  perform private.pipeline_borrar_punto(p_id, v_actor);   -- el último punto positivo del actor
end;
$$;
revoke execute on function pipeline_deshacer(uuid, text, uuid) from public, anon;
grant execute on function pipeline_deshacer(uuid, text, uuid) to authenticated;

create or replace function pipeline_dividir(p_id uuid, p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_pr prenda_pasada;
  v_saco uuid; v_pant uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);
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
revoke execute on function pipeline_dividir(uuid, uuid) from public, anon;
grant execute on function pipeline_dividir(uuid, uuid) to authenticated;

create or replace function pipeline_deshacer_division(p_id uuid, p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_sesion         uuid := auth.uid();
  v_actor          uuid;
  v_pr             prenda_pasada;
  v_hijos          uuid[];
  v_hijo_id        uuid;
  v_hijo_etapa     text;
  v_avanzo         boolean;
  v_etapa_original text;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);

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

  select etapa_anterior into v_etapa_original
    from prenda_historial
    where pasada_id = p_id and etapa_nueva = 'dividido'
    order by fecha desc limit 1;
  if v_etapa_original is null then
    raise exception 'No se encontró en el historial la etapa previa a la división — no se puede restaurar la madre de forma segura';
  end if;

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

  foreach v_hijo_id in array v_hijos loop
    perform private.pipeline_borrar_punto(v_hijo_id, null, true);   -- todos los puntos de la hija
  end loop;
  delete from prenda_pasada where id = any(v_hijos);

  update prenda_pasada set
    dividida = false, dividida_en = null, etapa = v_etapa_original, fecha_actualizado = now()
  where id = p_id;
  perform private.prenda_historial_registrar(p_id, 'dividido', v_etapa_original, v_actor,
    'Deshacer división: vuelve a ' || v_etapa_original);
end;
$$;
revoke execute on function pipeline_deshacer_division(uuid, uuid) from public, anon;
grant execute on function pipeline_deshacer_division(uuid, uuid) to authenticated;

create or replace function pipeline_calificar(p_id uuid, p_aceptada boolean, p_destino text, p_obs text,
                                              p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_sesion uuid := auth.uid(); v_actor uuid; v_etapa text; v_envio uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);
  select etapa, envio_id into v_etapa, v_envio from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;

  insert into prenda_calificacion (pasada_id, envio_id, aceptada, obs, calificador_id)
    values (p_id, v_envio, p_aceptada, nullif(p_obs, ''), v_actor);

  if p_aceptada then
    update prenda_pasada set etapa = 'recibido', fecha_actualizado = now() where id = p_id;
    perform private.prenda_historial_registrar(p_id, v_etapa, 'recibido', v_actor, 'Recibida y aceptada en tienda');
  else
    update prenda_pasada set etapa = p_destino, envio_id = null, aprobada = false, fecha_actualizado = now()
      where id = p_id;
    perform private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor,
      'Observada en tienda → ' || p_destino || coalesce(': ' || nullif(p_obs, ''), ''));
  end if;
end;
$$;
revoke execute on function pipeline_calificar(uuid, boolean, text, text, uuid) from public, anon;
grant execute on function pipeline_calificar(uuid, boolean, text, text, uuid) to authenticated;
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) lavanderia_enviar (0066): el historial de cada prenda ingresada pasa por la función.
--    Mismo cuerpo salvo ese bloque (antes un `insert ... select` directo). Gana `registrado_por`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create or replace function lavanderia_enviar(
  p_sede text, p_tipo text, p_resp_inv text, p_resp_traslado text,
  p_generales jsonb default '{}'::jsonb, p_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
  v_item  jsonb;
  v_etapa text;
  v_activo_id uuid;
  v_pasada uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

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
    -- sin garantía de tener cuenta en el sistema). Misma búsqueda de la prenda que antes.
    select p.id into v_pasada
      from prenda_pasada p
      where p.lista_lavanderia_id = v_id and p.codigo = v_item->>'cod'
      order by p.fecha_ingreso desc limit 1;
    if v_pasada is not null then
      perform private.prenda_historial_registrar(v_pasada, null, v_etapa, v_actor,
        'Lista ' || v_id || coalesce(' · traslado: ' || nullif(p_resp_traslado, ''), ''));
    end if;
  end loop;

  return v_id;
end;
$$;

-- Prueba de ataque: packages/db/pruebas/0113_puntos_solo_rpc.prueba.sql
--   bash tools/probar-migracion.sh 0113
