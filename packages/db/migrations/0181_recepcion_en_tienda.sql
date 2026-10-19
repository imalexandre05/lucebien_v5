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
