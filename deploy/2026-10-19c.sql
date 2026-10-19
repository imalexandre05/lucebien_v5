-- Release 2026-10-19c: migraciones 0177 y 0178 en orden. Se aplica DESPUÉS de deploy/2026-10-19b.sql. Idempotente. Sin schema_migrations.
-- Generado de packages/db/migrations; no editar a mano.
begin;

-- ===== 0177_codigo_siempre.sql =====
-- 0177 — Código personal siempre (decisión del dueño, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-codigo-siempre-design.md
-- Prueba: packages/db/pruebas/0177_codigo_siempre.prueba.sql (escrita antes). Idempotente.
--
-- Para mover prendas y enviar reportes se pide siempre el código personal, en cualquier equipo y
-- cuenta, sin depender de marcar cuentas o equipos como compartidos. El administrador queda exento
-- salvo que se encienda «exigir código también al admin».

-- DEFAULTS FIJADOS POR EL DUEÑO (no inventados). Editables en /configuracion (Código personal).
insert into config (clave, valor) values ('codigo_siempre', 'true')       on conflict (clave) do nothing;
insert into config (clave, valor) values ('codigo_exigir_admin', 'false') on conflict (clave) do nothing;

-- ¿A esta sesión hay que pedirle el código? (solo responde sobre la propia sesión)
create or replace function private.sesion_debe_dar_codigo()
  returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select lower(btrim(valor)) in ('true', 't', '1', 'si', 'sí') from config where clave = 'codigo_siempre'), true)
     and not (
       private.app_es_admin()
       and not coalesce((select lower(btrim(valor)) in ('true', 't', '1', 'si', 'sí') from config where clave = 'codigo_exigir_admin'), false)
     );
$$;
revoke execute on function private.sesion_debe_dar_codigo() from public, anon;
grant  execute on function private.sesion_debe_dar_codigo() to authenticated;

create or replace function public.sesion_debe_dar_codigo()
  returns boolean language sql stable security invoker set search_path = public
as $$ select private.sesion_debe_dar_codigo(); $$;
revoke execute on function public.sesion_debe_dar_codigo() from public, anon;
grant  execute on function public.sesion_debe_dar_codigo() to authenticated;

-- Mismo cuerpo que la 0112; cambia solo la condición «sin token».
create or replace function private.actor_pipeline(p_operador uuid)
  returns uuid language plpgsql volatile security invoker set search_path = public
as $$
declare v_actor uuid;
begin
  if p_operador is null then
    if private.sesion_es_cuenta_compartida() or private.sesion_debe_dar_codigo() then
      raise exception 'CODIGO: ingresa tu código personal para continuar';
    end if;
    return auth.uid();
  end if;
  v_actor := private.operador_de_token(p_operador);
  if v_actor is null then
    raise exception 'CODIGO: operador vencido, vuelve a ingresar tu código';
  end if;
  perform private.tocar_operador(p_operador);
  return v_actor;
end;
$$;
revoke execute on function private.actor_pipeline(uuid) from public, anon;
grant  execute on function private.actor_pipeline(uuid) to authenticated;

-- pipeline_validar_codigo: igual a la 0112, pero el equipo ya no tiene que ser compartido cuando
-- 'codigo_siempre' está en sí.
drop function if exists pipeline_validar_codigo(text, text);
create or replace function pipeline_validar_codigo(p_usuario text, p_pin text, p_device text)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_max int; v_ventana int; v_op_min int; v_min int;
  v_emp uuid; v_activo boolean; v_compartida boolean; v_tiene_pin boolean;
  v_nombre text; v_token uuid; v_exp timestamptz; v_restan int;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  -- 0) El código sólo se acepta desde un equipo aprobado y marcado como compartido. Se compara con
  --    el token real del equipo (cookie httpOnly) guardado en la base, no con lo que diga la app.
  --    No se registra intento: un equipo personal no puede gastar ni probar códigos.
  if not coalesce(dispositivo_compartido(p_device), false)
     and not coalesce((select lower(btrim(valor)) in ('true', 't', '1', 'si', 'sí') from config where clave = 'codigo_siempre'), true) then
    return jsonb_build_object('ok', false, 'motivo', 'equipo_no_compartido');
  end if;

  v_max     := private.codigo_param('codigo_max_intentos', 5);
  v_ventana := private.codigo_param('codigo_ventana_intentos_min', 15);
  v_op_min  := private.codigo_param('codigo_operador_min', 10);

  -- El usuario sólo identifica (no es secreto). Se resuelve aunque esté suspendido: los fallos
  -- cuentan contra la persona igual.
  select e.id, e.activo, e.cuenta_compartida into v_emp, v_activo, v_compartida
    from empleados e where e.cod = btrim(coalesce(p_usuario, '')) limit 1;

  -- Serializa por sesión y por persona: sin esto, varias llamadas en paralelo leen el mismo conteo
  -- de fallos antes de que se inserte el suyo y el límite se vuelve el tamaño del pool. Orden fijo
  -- (sesión, persona) para no cruzar bloqueos.
  perform pg_advisory_xact_lock(hashtext('codigo-sesion:' || v_sesion::text));
  if v_emp is not null then
    perform pg_advisory_xact_lock(hashtext('codigo-persona:' || v_emp::text));
  end if;

  -- 1) ¿Sesión o persona bloqueadas? Aunque el PIN sea correcto.
  v_min := greatest(private.codigo_min_bloqueo(v_sesion, null, v_max, v_ventana),
                    private.codigo_min_bloqueo(null, v_emp, v_max, v_ventana));
  if v_min > 0 then
    return jsonb_build_object('ok', false, 'bloqueado_min', v_min);
  end if;

  v_tiene_pin := v_emp is not null and exists (select 1 from codigo_pines where empleado_id = v_emp);

  -- 2) Fallo: usuario inexistente, suspendido, cuenta compartida, sin PIN o PIN malo. Se registra
  --    y se responde sin raise. 'sin_pin' cuenta como fallo para que no sirva para enumerar.
  if v_emp is null or not v_activo or v_compartida or not v_tiene_pin
     or not private.codigo_pin_valido(v_emp, p_pin) then
    v_restan := private.codigo_registrar_fallo(v_sesion, p_device, v_emp, v_max, v_ventana);
    if v_emp is not null and v_activo and not v_compartida and not v_tiene_pin then
      return jsonb_build_object('ok', false, 'motivo', 'sin_pin', 'intentos_restantes', v_restan);
    end if;
    return jsonb_build_object('ok', false, 'intentos_restantes', v_restan);
  end if;

  -- 3) Acierto: se registra y se emite el token. De paso se barren los tokens vencidos hace más
  --    de un día.
  insert into codigo_intentos (sesion_uid, device_id, empleado_id, ok) values (v_sesion, p_device, v_emp, true);
  delete from codigo_operadores where expira_en < now() - interval '1 day';
  v_exp := now() + make_interval(mins => v_op_min);
  insert into codigo_operadores (sesion_uid, empleado_id, device_id, expira_en)
    values (v_sesion, v_emp, p_device, v_exp) returning token into v_token;
  select nombre into v_nombre from empleados where id = v_emp;

  return jsonb_build_object('ok', true, 'token', v_token, 'nombre', v_nombre, 'expira_en', v_exp,
                            'ventana_min', v_op_min);
end;
$$;
revoke execute on function pipeline_validar_codigo(text, text, text) from public, anon;
grant execute on function pipeline_validar_codigo(text, text, text) to authenticated;

-- ===== 0178_extras_sin_tope.sql =====
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


commit;
