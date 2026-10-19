-- Release 2026-10-19e: migraciones 0180-0183 (codificación tras compostura, accesorios con código, recepción en tienda, reportes por sede). Se aplica DESPUÉS de deploy/2026-10-19d.sql. Idempotente. Sin schema_migrations.
-- Generado de packages/db/migrations; no editar a mano.
begin;

-- ===== 0180_codificacion_despues_compostura.sql =====
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

-- ===== 0181_recepcion_en_tienda.sql =====
-- 0181 — Recepción en tienda: solo la tienda destino (decisión del dueño, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-recepcion-en-tienda-design.md
-- Prueba: packages/db/pruebas/0181_recepcion_en_tienda.prueba.sql (escrita antes). Idempotente.
--
-- Almacén solo despacha. Quien acepta o devuelve lo que llegó es la tienda destino (o el admin),
-- con código personal. DEFAULT ANOTADO en docs/pendientes-negocio.md: la nota al devolver es
-- obligatoria, de 3 a 500 letras (mismo criterio que la 0154 y la 0156).

-- R1: almacén ya no lee los despachos (misma vista de columnas limitadas, sin la rama de almacén).
create or replace view public.prendas_despachadas with (security_barrier = true) as
select p.id, p.codigo, p.tipo, p.color, p.talla, p.sede_origen_cod, p.etapa, p.fecha_actualizado,
       e.id as envio_id, e.sede_destino_cod, e.fecha as fecha_envio, e.estado as estado_envio
from public.prenda_pasada p
join public.envios_prendas e on e.id = p.envio_id
where private.app_es_admin()
   or (not private.app_es_almacen() and e.sede_destino_cod in (select private.app_sedes()));
revoke all on public.prendas_despachadas from public, anon, authenticated;
grant select on public.prendas_despachadas to authenticated;

drop policy if exists envios_sel on public.envios_prendas;
create policy envios_sel on public.envios_prendas for select
  using (private.app_es_admin() or (not private.app_es_almacen() and sede_destino_cod in (select private.app_sedes())));

drop policy if exists calif_sel on public.prenda_calificacion;
create policy calif_sel on public.prenda_calificacion for select
  using (
    private.app_es_admin()
    or (not private.app_es_almacen() and exists (
          select 1 from public.envios_prendas e
          where e.id = prenda_calificacion.envio_id and e.sede_destino_cod in (select private.app_sedes())))
  );

-- El permiso se mide también sobre el DUEÑO DEL CÓDIGO (quien actúa), no solo sobre la sesión del equipo.
create or replace function private.actor_recibe_en(p_actor uuid, p_sede text)
  returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from empleados e
     where e.id = p_actor and e.activo
       and (e.rol in ('admin', 'dueno')
            or (e.rol not in ('encargado_almacen', 'confeccionista')
                and (e.sede_cod = p_sede
                     or exists (select 1 from empleado_tiendas et where et.empleado_id = e.id and et.sede_cod = p_sede))))
  );
$$;
revoke execute on function private.actor_recibe_en(uuid, text) from public, anon;

-- R2 + R3: mismo cuerpo que la 0112, con portero de tienda destino, cualquier etapa y nota obligatoria.
create or replace function public.pipeline_calificar(p_id uuid, p_aceptada boolean, p_destino text, p_obs text,
                                                     p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_sesion uuid := auth.uid(); v_actor uuid; v_etapa text; v_envio uuid; v_obs text;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1 from prenda_pasada p
    where p.id = p_id
      and (private.app_es_admin()
           or (not private.app_es_almacen()
               and exists (select 1 from envios_prendas e
                           where e.id = p.envio_id and e.sede_destino_cod in (select private.app_sedes()))))
  ) then
    raise exception 'Prenda no encontrada';
  end if;
  v_actor := private.actor_pipeline(p_operador);
  if not private.actor_recibe_en(v_actor, (select e.sede_destino_cod from prenda_pasada p join envios_prendas e on e.id = p.envio_id where p.id = p_id)) then
    raise exception 'PERMISO: solo la tienda destino recibe esta prenda';
  end if;
  select etapa, envio_id into v_etapa, v_envio from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'enviado' then
    raise exception 'TRANSICION: sólo se califica una prenda enviada';
  end if;
  v_obs := btrim(coalesce(p_obs, ''));
  if not coalesce(p_aceptada, false) then
    if p_destino is null
       or not (p_destino = any(array['recepcion','codificacion','lavado','empatado','refaccion','compostura',
                                     'planchado','control_calidad'])) then
      raise exception 'TRANSICION: una prenda devuelta vuelve a una etapa del proceso';
    end if;
    if length(v_obs) < 3 or length(v_obs) > 500 then
      raise exception 'MOTIVO: escribe qué pasó con la prenda (entre 3 y 500 letras)';
    end if;
  end if;

  insert into prenda_calificacion (pasada_id, envio_id, aceptada, obs, calificador_id)
    values (p_id, v_envio, p_aceptada, nullif(v_obs, ''), v_actor);

  if p_aceptada then
    update prenda_pasada set etapa = 'recibido', fecha_actualizado = now() where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
      values (p_id, v_etapa, 'recibido', v_actor, 'Recibida y aceptada en tienda', v_sesion, clock_timestamp());
  else
    update prenda_pasada set etapa = p_destino, envio_id = null, aprobada = false, obs_calidad = v_obs,
                             fecha_actualizado = now()
      where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
      values (p_id, v_etapa, p_destino, v_actor,
              'Devuelta desde tienda → ' || p_destino || ': ' || v_obs, v_sesion, clock_timestamp());
  end if;
end;
$$;
revoke execute on function public.pipeline_calificar(uuid, boolean, text, text, uuid) from public, anon;
grant  execute on function public.pipeline_calificar(uuid, boolean, text, text, uuid) to authenticated;

-- R4: varias prendas juntas, todo o nada.
create or replace function public.pipeline_calificar_tanda(p_ids uuid[], p_aceptada boolean, p_destino text,
                                                           p_obs text, p_operador uuid default null)
  returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid; v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'La selección está vacía: elige al menos una prenda';
  end if;
  for v_id in select distinct x from unnest(p_ids) x order by x loop
    begin
      perform public.pipeline_calificar(v_id, p_aceptada, p_destino, p_obs, p_operador);
    exception when others then
      if sqlerrm like 'CODIGO:%' or sqlerrm like 'MOTIVO:%' then raise; end if;
      raise exception '% (prenda %)', sqlerrm,
        coalesce((select codigo from public.prenda_pasada where id = v_id), v_id::text);
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.pipeline_calificar_tanda(uuid[], boolean, text, text, uuid) from public, anon;
grant  execute on function public.pipeline_calificar_tanda(uuid[], boolean, text, text, uuid) to authenticated;

-- ===== 0182_accesorios_con_codigo.sql =====
-- 0182 — Accesorios: enviar y validar solo por RPC, con código personal (sesión 10A, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-accesorios-con-codigo-design.md
-- Prueba: packages/db/pruebas/0182_accesorios_con_codigo.prueba.sql (escrita antes). Idempotente.
--
-- Antes: la remesa y su validación se escribían directo con la sesión (sin código) y envios_acc_rw
-- dejaba escribir a cualquiera con la sede. Ahora cada acción queda a nombre del dueño del código.

-- El permiso se mide también sobre el DUEÑO DEL CÓDIGO (quien actúa), no solo sobre la sesión del equipo.
create or replace function private.actor_recibe_en(p_actor uuid, p_sede text)
  returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from empleados e
     where e.id = p_actor and e.activo
       and (e.rol in ('admin', 'dueno')
            or (e.rol not in ('encargado_almacen', 'confeccionista')
                and (e.sede_cod = p_sede
                     or exists (select 1 from empleado_tiendas et where et.empleado_id = e.id and et.sede_cod = p_sede))))
  );
$$;
revoke execute on function private.actor_recibe_en(uuid, text) from public, anon;

create or replace function private.actor_es_almacen(p_actor uuid)
  returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from empleados e where e.id = p_actor and e.activo
                   and e.rol in ('admin', 'dueno', 'encargado_almacen', 'confeccionista'));
$$;
revoke execute on function private.actor_es_almacen(uuid) from public, anon;

create or replace function public.accesorios_enviar(p_sede text, p_obs text, p_items jsonb, p_operador uuid default null)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid; v_id uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not (private.app_es_admin() or private.app_es_almacen()) then
    raise exception 'PERMISO: solo el almacén envía remesas de accesorios';
  end if;
  v_actor := private.actor_pipeline(p_operador);
  if not private.actor_es_almacen(v_actor) then
    raise exception 'PERMISO: solo el almacén envía remesas de accesorios';
  end if;
  if p_sede is null or not exists (select 1 from sedes where cod = p_sede) then
    raise exception 'La sede de destino % no existe', coalesce(p_sede, '(vacía)');
  end if;
  select count(*) into v_n from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(tipo text, cantidad int)
    where btrim(coalesce(x.tipo, '')) <> '' and coalesce(x.cantidad, 0) > 0;
  if v_n = 0 then raise exception 'Agrega al menos un accesorio con cantidad.'; end if;
  insert into envios_accesorios (sede_destino_cod, fecha, responsable_id, obs)
    values (p_sede, now(), v_actor, nullif(btrim(coalesce(p_obs, '')), '')) returning id into v_id;
  insert into envio_accesorios_items (envio_id, tipo, cantidad)
    select v_id, btrim(x.tipo), x.cantidad
      from jsonb_to_recordset(p_items) as x(tipo text, cantidad int)
     where btrim(coalesce(x.tipo, '')) <> '' and coalesce(x.cantidad, 0) > 0;
  return v_id;
end;
$$;
revoke execute on function public.accesorios_enviar(text, text, jsonb, uuid) from public, anon;
grant  execute on function public.accesorios_enviar(text, text, jsonb, uuid) to authenticated;

create or replace function public.accesorios_validar(p_id uuid, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid; v_dest text; v_ok boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select sede_destino_cod, coalesce(validado_tienda, false) into v_dest, v_ok
    from envios_accesorios where id = p_id for update;
  if not found
     or not (private.app_es_admin()
             or (not private.app_es_almacen() and v_dest in (select private.app_sedes()))) then
    raise exception 'Envío no encontrado';
  end if;
  v_actor := private.actor_pipeline(p_operador);
  if not private.actor_recibe_en(v_actor, v_dest) then
    raise exception 'PERMISO: solo la tienda destino valida esta remesa';
  end if;
  if v_ok then raise exception 'TRANSICION: esa remesa ya fue validada'; end if;
  update envios_accesorios set validado_tienda = true, validado_por_id = v_actor, fecha_validado = now()
    where id = p_id;
end;
$$;
revoke execute on function public.accesorios_validar(uuid, uuid) from public, anon;
grant  execute on function public.accesorios_validar(uuid, uuid) to authenticated;

-- R3: solo lectura directa (admin, almacén o sede destino).
drop policy if exists envios_acc_rw  on public.envios_accesorios;
drop policy if exists envios_acc_sel on public.envios_accesorios;
create policy envios_acc_sel on public.envios_accesorios for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_destino_cod in (select private.app_sedes()));
revoke insert, update, delete, truncate on public.envios_accesorios from authenticated, anon;

drop policy if exists envio_acc_items_rw  on public.envio_accesorios_items;
drop policy if exists envio_acc_items_sel on public.envio_accesorios_items;
create policy envio_acc_items_sel on public.envio_accesorios_items for select
  using (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from public.envios_accesorios e
      where e.id = envio_accesorios_items.envio_id and e.sede_destino_cod in (select private.app_sedes()))
  );
revoke insert, update, delete, truncate on public.envio_accesorios_items from authenticated, anon;

-- ===== 0183_reportes_por_sede.sql =====
-- 0183 — Reportes: cada quien ve solo los de su sede (decisión del dueño, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-cada-quien-su-sede-design.md
-- Prueba: packages/db/pruebas/0183_reportes_por_sede.prueba.sql (escrita antes). Idempotente.
--
-- Antes: las cuatro políticas de lectura de reportes dejaban pasar a cualquier rol de almacén
-- (encargado_almacen y confeccionista) sobre TODAS las sedes. Ahora: admin, o la sede del reporte en
-- app_sedes(). Las escrituras no cambian (siguen por RPC / admin).
drop policy if exists rep_select on public.reportes;
create policy rep_select on public.reportes for select
  using (private.app_es_admin() or sede_cod in (select private.app_sedes()));

drop policy if exists rep_trab_select on public.reporte_trabajadores;
create policy rep_trab_select on public.reporte_trabajadores for select
  using (
    private.app_es_admin() or exists (
      select 1 from public.reportes r
      where r.id = reporte_trabajadores.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );

drop policy if exists rep_act_select on public.reporte_actividades;
create policy rep_act_select on public.reporte_actividades for select
  using (
    private.app_es_admin() or exists (
      select 1 from public.reportes r
      where r.id = reporte_actividades.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );

drop policy if exists rep_extras_select on public.reporte_extras;
create policy rep_extras_select on public.reporte_extras for select
  using (
    private.app_es_admin() or exists (
      select 1 from public.reportes r
      where r.id = reporte_extras.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );

commit;
