-- 0178 — Extras sin tope por ahora (decisión del dueño, 19-oct-2026).
-- Spec: docs/superpowers/specs/reportes/2026-10-19-extras-sin-tope-design.md
-- Prueba: packages/db/pruebas/0178_extras_sin_tope.prueba.sql (escrita antes). Idempotente.
-- ZONA CRÍTICA (cadena del sueldo): mismo cuerpo que la 0171; solo cambia la comparación con el tope.
-- `reporte_extra_cantidad_max` = 0 (o vacío) significa «sin tope». DECISIÓN PENDIENTE: qué tope poner
-- (docs/pendientes-negocio.md).

-- Solo si sigue siendo el provisional de la 0171 (50): no pisa un valor puesto a mano.
update config set valor = '0' where clave = 'reporte_extra_cantidad_max' and btrim(valor) = '50';

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
  v_tope        int;
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

  -- 0171 R3: cada trabajador existe y está activo (no se restringe por sede: ver la spec).
  if exists (select 1 from unnest(coalesce(p_trabajadores, array[]::uuid[])) t
              where not exists (select 1 from empleados e where e.id = t and e.activo)) then
    raise exception 'PERMISO: uno de los colaboradores del turno no es un empleado activo; quítalo y vuelve a enviar';
  end if;

  if p_extras is not null then
    -- 0171 R1: cantidad entera entre 1 y el tope de config (default provisional 50).
    -- 0178: 0 (o vacío) = sin tope. Un valor ausente o ilegible tampoco pone tope.
    v_tope := coalesce(
      (select case when valor ~ '^\s*\d+\s*$' then btrim(valor)::int end
         from config where clave = 'reporte_extra_cantidad_max'), 0);
    if exists (
      select 1 from jsonb_array_elements(p_extras) e
       where (coalesce(e->>'nombre', '') <> '' or nullif(e->>'cod', '') is not null)
         and e ? 'cantidad' and jsonb_typeof(e->'cantidad') <> 'null'
         and (coalesce(e->>'cantidad', '') !~ '^\s*\d+\s*$'
              or btrim(e->>'cantidad')::numeric < 1
              or (v_tope > 0 and btrim(e->>'cantidad')::numeric > v_tope))
    ) then
      raise exception 'CANTIDAD: cada extra debe tener una cantidad entera de 1 en adelante%; corrige la cantidad y vuelve a enviar', case when v_tope > 0 then ' (hasta ' || v_tope || ')' else '' end;
    end if;
    -- El tope es por extra del reporte: las filas del mismo código de catálogo se suman.
    if exists (
      select 1 from jsonb_array_elements(p_extras) e
       where nullif(e->>'cod', '') is not null
       group by e->>'cod'
      having v_tope > 0 and sum(coalesce(btrim(e->>'cantidad')::int, 1)) > v_tope
    ) then
      raise exception 'CANTIDAD: un mismo extra no puede sumar más de % en un reporte; junta las filas y corrige la cantidad', v_tope;
    end if;
    -- 0171 R2: un «registrado por» explícito debe ser alguien del turno (trabajador o encargado).
    if exists (
      select 1 from jsonb_array_elements(p_extras) e
       where nullif(e->>'registrado_por_id', '') is not null
         and (coalesce(e->>'nombre', '') <> '' or nullif(e->>'cod', '') is not null)
         and not ((e->>'registrado_por_id')::uuid = any(
               coalesce(p_trabajadores, array[]::uuid[]) || array[v_encargado]))
    ) then
      raise exception 'PERMISO: un extra está a nombre de alguien que no está en el equipo del turno; agrégalo como colaborador o elige a otra persona';
    end if;
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
      coalesce(btrim(e->>'cantidad')::int, 1),
      coalesce(cat.precio_unitario, 0),
      coalesce(cat.peso, 0),
      coalesce(cat.precio_unitario, 0) * coalesce(btrim(e->>'cantidad')::int, 1),
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

revoke execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid, uuid)
  from public, anon;
grant  execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid, uuid)
  to authenticated;

