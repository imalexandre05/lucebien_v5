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
