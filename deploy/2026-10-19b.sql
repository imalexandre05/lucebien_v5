-- Release 2026-10-19b: migraciones 0171 a 0176 en orden. Se aplica DESPUÉS de deploy/2026-10-19.sql. Idempotente. Sin schema_migrations.
-- Generado de packages/db/migrations; no editar a mano.
begin;

-- ===== 0171_extras_con_tope.sql =====
-- 0171 — Extras del reporte con tope y a nombre de alguien del turno; marcar asistencia con permiso.
-- Spec: docs/superpowers/specs/reportes/2026-10-19-extras-con-tope-design.md
-- Prueba: packages/db/pruebas/0171_extras_con_tope.prueba.sql (escrita antes). Idempotente.
-- ZONA CRÍTICA (cadena del sueldo): los extras suman puntos (nota /20) y «Bonos extras» (soles).
--
-- Auditoría 1 (19-oct-2026): reportes_crear guardaba la cantidad de cada extra tal como llegaba del
-- navegador (5000 o −5000) y a nombre de cualquier uuid. Se valida en la RPC, que es security definer.
-- Mismo cuerpo que la 0146 salvo las tres validaciones marcadas «0171».

-- DEFAULT PROVISIONAL (nadie lo confirmó): tope de unidades por extra en un reporte. Editable en
-- /configuracion (Reportes de turno). Anotado en docs/pendientes-negocio.md.
insert into config (clave, valor) values ('reporte_extra_cantidad_max', '50')
on conflict (clave) do nothing;

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
    v_tope := coalesce(
      (select case when valor ~ '^\s*\d+\s*$' then btrim(valor)::int end
         from config where clave = 'reporte_extra_cantidad_max'), 50);
    if exists (
      select 1 from jsonb_array_elements(p_extras) e
       where (coalesce(e->>'nombre', '') <> '' or nullif(e->>'cod', '') is not null)
         and e ? 'cantidad' and jsonb_typeof(e->'cantidad') <> 'null'
         and (coalesce(e->>'cantidad', '') !~ '^\s*\d+\s*$'
              or btrim(e->>'cantidad')::numeric < 1
              or btrim(e->>'cantidad')::numeric > v_tope)
    ) then
      raise exception 'CANTIDAD: cada extra debe tener una cantidad entera entre 1 y %; corrige la cantidad y vuelve a enviar', v_tope;
    end if;
    -- El tope es por extra del reporte: las filas del mismo código de catálogo se suman.
    if exists (
      select 1 from jsonb_array_elements(p_extras) e
       where nullif(e->>'cod', '') is not null
       group by e->>'cod'
      having sum(coalesce(btrim(e->>'cantidad')::int, 1)) > v_tope
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

-- ── reportes_marcar_asistencia: mismo cuerpo que la 0081 con permiso sobre el reporte (R4) ────────
create or replace function reportes_marcar_asistencia(p_reporte_id text)
  returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_fecha date;
  v_turno text;
  v_enc   uuid;
  v_sede  text;
  v_n     int := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select fecha, turno, encargado_id, sede_cod into v_fecha, v_turno, v_enc, v_sede from reportes where id = p_reporte_id;
  if not found then return 0; end if;
  -- 0171: sólo el admin, el encargado del reporte o alguien con la sede del reporte.
  if not (private.app_es_admin() or v_enc = auth.uid() or v_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes marcar la asistencia de un reporte de la sede %', v_sede;
  end if;

  if v_enc is not null then
    insert into asistencias (empleado_id, fecha, turno, minutos_tardanza, fuente, obs)
    select v_enc, v_fecha, v_turno, 0, 'reporte', 'auto: encargado del reporte ' || p_reporte_id
    where not exists (
      select 1 from asistencias a where a.empleado_id = v_enc and a.fecha = v_fecha
    )
    on conflict (empleado_id, fecha, turno) do nothing;
  end if;

  insert into asistencias (empleado_id, fecha, turno, minutos_tardanza, fuente, obs)
  select distinct t.empleado_id, v_fecha, v_turno, 0, 'reporte',
         'auto: trabajador del reporte ' || p_reporte_id
  from reporte_trabajadores t
  where t.reporte_id = p_reporte_id and t.empleado_id is not null
    and not exists (
      select 1 from asistencias a where a.empleado_id = t.empleado_id and a.fecha = v_fecha
    )
  on conflict (empleado_id, fecha, turno) do nothing;
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

revoke execute on function reportes_marcar_asistencia(text) from public, anon;
grant  execute on function reportes_marcar_asistencia(text) to authenticated;


-- ===== 0172_contrato_con_pagos.sql =====
-- 0172_contrato_con_pagos.sql — un contrato con liquidaciones no se recorta; la renovación hereda la tarifa vigente
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-contrato-con-pagos-no-se-recorta-design.md
-- Prueba: packages/db/pruebas/0172_contrato_con_pagos.prueba.sql.   ZONA CRÍTICA (verificador antes de mergear).
--
-- 1) Trigger before update en sueldo_acuerdos: ninguna liquidación no anulada puede quedar fuera de su
--    contrato (desde < fecha_inicio o hasta > fecha_fin), ni el contrato cambiar de dueño si ya tiene
--    liquidaciones. Cubre la RPC de edición y cualquier update directo. Sin esto, acortar un contrato ya
--    pagado dejaba pagar dos veces el tramo liberado desde el contrato siguiente.
-- 2) sueldo_acuerdo_renovar (0170): el único cambio es el cálculo de v_tarifa (última tarifa no nula de los
--    cambios con desde <= fecha_fin; si no, la del contrato). Frecuencia, cuota, grants: iguales.
--
-- Defaults inventados: ninguno. Idempotente (create or replace, drop trigger if exists).

create or replace function private.sueldo_acuerdo_cubre_liquidaciones()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  l record;
begin
  if new.empleado_id is distinct from old.empleado_id
     and exists (select 1 from sueldo_liquidaciones x where x.acuerdo_id = old.id and x.estado <> 'anulada') then
    raise exception 'PERIODO:este contrato ya tiene liquidaciones, así que no se puede pasar a otra persona. Anula esas liquidaciones desde Liquidaciones y vuelve a intentar, o crea un contrato nuevo para la otra persona.';
  end if;

  if new.fecha_inicio is distinct from old.fecha_inicio or new.fecha_fin is distinct from old.fecha_fin then
    select x.periodo_desde, x.periodo_hasta, x.estado into l
      from sueldo_liquidaciones x
     where x.acuerdo_id = old.id and x.estado <> 'anulada'
       and (x.periodo_desde < new.fecha_inicio or x.periodo_hasta > new.fecha_fin)
     order by x.periodo_desde
     limit 1;
    if found then
      raise exception 'PERIODO:el contrato tiene una liquidación % del % al %, que quedaría fuera de las fechas nuevas (% a %). Anula esa liquidación desde Liquidaciones primero, o deja el contrato desde el % hasta el %.',
        l.estado, l.periodo_desde, l.periodo_hasta, new.fecha_inicio, new.fecha_fin,
        least(new.fecha_inicio, l.periodo_desde), greatest(new.fecha_fin, l.periodo_hasta);
    end if;
  end if;
  return new;
end;
$fn$;

comment on function private.sueldo_acuerdo_cubre_liquidaciones() is
  'Un contrato no se acorta ni cambia de dueño dejando liquidaciones no anuladas fuera de él (0172).';

drop trigger if exists trg_sueldo_acuerdo_cubre_liquidaciones on sueldo_acuerdos;
create trigger trg_sueldo_acuerdo_cubre_liquidaciones before update on sueldo_acuerdos
  for each row execute function private.sueldo_acuerdo_cubre_liquidaciones();

-- ═══ Renovar: igual que la 0170, salvo la tarifa heredada ═══════════════════════════════════════
create or replace function sueldo_acuerdo_renovar(p_acuerdo uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  a        sueldo_acuerdos%rowtype;
  v_ini    date;
  v_fin    date;
  v_meses  int;
  v_nuevo  uuid;
  c        sueldo_acuerdo_cambios%rowtype;
  v_mod    text;
  v_cada   int;
  v_cuota  numeric;
  v_tarifa numeric;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede renovar un contrato';
  end if;

  select * into a from sueldo_acuerdos where id = p_acuerdo for update;
  if not found then
    raise exception 'DATO:ese contrato no existe';
  end if;
  if a.estado = 'borrador' then
    raise exception 'ESTADO:un contrato en borrador no se renueva; actívalo primero';
  end if;
  if exists (select 1 from sueldo_acuerdos n where n.empleado_id = a.empleado_id and n.fecha_inicio > a.fecha_fin) then
    raise exception 'ESTADO:este contrato ya tiene uno que lo sigue; edita ese';
  end if;

  -- Frecuencia y cuota VIGENTES al final del contrato (0120/0121): la última fila de cambios con
  -- desde <= fecha_fin; sin cambios, las del contrato. Una tarifa nula en el cambio sigue la anterior.
  select * into c from sueldo_acuerdo_cambios where acuerdo_id = a.id and desde <= a.fecha_fin order by desde desc limit 1;
  v_mod    := coalesce(c.modalidad, a.modalidad);
  v_cada   := case when c.id is not null then c.cada_dias else a.cada_dias end;
  -- Tarifa: la última NO nula entre los cambios con desde <= fecha_fin (nula = «sigue la anterior»,
  -- igual que el arrastre del core); si ninguno la fija, la del contrato (0172).
  v_tarifa := coalesce(
    (select x.tarifa_hora from sueldo_acuerdo_cambios x
      where x.acuerdo_id = a.id and x.desde <= a.fecha_fin and x.tarifa_hora is not null
      order by x.desde desc limit 1),
    a.tarifa_hora);
  v_cuota  := case when v_tarifa is not null then 0 when c.id is not null then c.sueldo_pactado else a.sueldo_pactado end;

  v_ini := a.fecha_fin + 1;
  -- Meses completos (1-oct a 31-oct → 1 mes): el nuevo dura lo mismo. Si no, los mismos días.
  v_meses := (extract(year from age(a.fecha_fin + 1, a.fecha_inicio)) * 12
              + extract(month from age(a.fecha_fin + 1, a.fecha_inicio)))::int;
  if v_meses >= 1 and (a.fecha_inicio + make_interval(months => v_meses))::date = a.fecha_fin + 1 then
    v_fin := (v_ini + make_interval(months => v_meses))::date - 1;
  else
    v_fin := v_ini + (a.fecha_fin - a.fecha_inicio);
  end if;

  -- Reutiliza la 0167/0149: mismo contrato + horario atómicos y mismas validaciones.
  v_nuevo := sueldo_acuerdo_guardar(
    null,
    jsonb_build_object(
      'empleado_id',         a.empleado_id,
      'fecha_inicio',        v_ini,
      'fecha_fin',           v_fin,
      'modalidad',           v_mod,
      'cada_dias',           v_cada,
      'sueldo_pactado',      v_cuota,
      'tarifa_hora',         v_tarifa,
      'escala',              a.escala,
      'almuerzo_habilitado', a.almuerzo_habilitado,
      'parametros',          a.parametros,
      'creado_por',          auth.uid()
    ),
    coalesce((select jsonb_agg(jsonb_build_object(
                'dia_semana',  t.dia_semana,
                'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
                'hora_fin',    to_char(t.hora_fin, 'HH24:MI'),
                'lugar',       t.lugar) order by t.dia_semana, t.hora_inicio)
              from sueldo_acuerdo_turnos t where t.acuerdo_id = a.id), '[]'::jsonb)
  );

  update sueldo_acuerdos set renueva_a = a.id where id = v_nuevo;
  return v_nuevo;
end;
$fn$;

comment on function sueldo_acuerdo_renovar(uuid) is
  'Crea en borrador el contrato que sigue a p_acuerdo, copiando frecuencia, cuota o tarifa, escala, almuerzo, parámetros y horario (0170). Solo admin.';
revoke execute on function sueldo_acuerdo_renovar(uuid) from public, anon;
grant  execute on function sueldo_acuerdo_renovar(uuid) to authenticated;


-- ===== 0173_asesor_seguridad.sql =====
-- 0173 — Ajustes del asesor de seguridad de Supabase (auditoría 1, 19-oct-2026).
-- Prueba: packages/db/pruebas/0173_asesor_seguridad.prueba.sql (escrita antes). Idempotente.
-- No cambia ninguna regla de negocio ni la cadena del sueldo: sólo search_path, una cerradura que
-- faltaba y dos tablas de respaldo que salen de la API.
--
-- Revisado y SIN cambio (lo marca el asesor, pero es deliberado):
--   · public.prendas_despachadas (0151): corre con los permisos de su dueño a propósito y filtra por
--     dentro (admin, almacén o sede destino en app_sedes()); security_barrier; sólo SELECT para
--     authenticated, nada para anon. Pasarla a security_invoker obligaría a abrir prenda_pasada.
--   · public.v_catalogo_publico (0074): catálogo público para LB-Web; sólo columnas publicables de
--     prendas publicable/disponibles. Si LB-Web ya no la usa, la decisión de retirarla es del dueño.
--   · public.schema_migrations (0103): RLS sin policies = sólo service_role. Es lo buscado.

-- 1) WARN function_search_path_mutable: private.sueldo_mes_es (0144).
alter function private.sueldo_mes_es(date) set search_path = '';

-- 2) private.app_es_gestor_solicitudes (0087) no exigía e.activo, la tercera cerradura de la 0083:
--    un encargado de almacén suspendido con su JWT aún vivo podía aprobar o rechazar solicitudes.
create or replace function private.app_es_gestor_solicitudes()
  returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from empleados e
    where e.id = auth.uid() and e.activo and e.rol in ('admin', 'dueno', 'encargado_almacen')
  );
$$;

-- 3) Respaldos creados a mano (ver 0082): RLS sin policies en public. Se mueven al esquema private,
--    que PostgREST no expone; los datos no se tocan. Borrarlos es decisión del dueño.
do $$
declare t text;
begin
  foreach t in array array['asistencias_respaldo_0075', 'asistencias_respaldo_20260821'] loop
    if to_regclass('public.' || t) is not null and to_regclass('private.' || t) is null then
      execute format('alter table public.%I set schema private', t);
      execute format('revoke all on private.%I from public, anon, authenticated', t);
    end if;
  end loop;
end $$;


-- ===== 0174_puntos_solo_propios.sql =====
-- 0174 — Los puntos del pipeline sólo los ven cada persona y el administrador.
-- Spec: docs/superpowers/specs/pipeline/2026-10-10-puntos-solo-propios-design.md (decisión 2 del dueño,
-- 10-oct-2026). Prueba: packages/db/pruebas/0174_puntos_solo_propios.prueba.sql (escrita antes).
-- AISLAMIENTO (no-negociable 3). Idempotente. La escritura no cambia: sólo por RPC (0115).
--
-- Antes: dos policies de lectura permisivas (puntos_sel 0115 y puntos_select 0122) dejaban leer los
-- puntos de cualquier prenda de una sede del lector y, por app_es_almacen(), de todas las sedes al
-- almacén y al confeccionista. pipeline_ranking_hoy() devolvía el top 10 del día de todos.

drop policy if exists puntos_select on public.pipeline_puntos;
drop policy if exists puntos_sel    on public.pipeline_puntos;
create policy puntos_sel on public.pipeline_puntos for select
  using (private.app_es_admin() or empleado_id = auth.uid());

-- Misma firma y mismo cuerpo que la 0011 (revocado a anon en la 0018), más el filtro por persona.
create or replace function public.pipeline_ranking_hoy()
  returns table(nombre text, total numeric, acciones bigint)
  language sql stable security definer set search_path = public
as $$
  select e.nombre, sum(pp.puntos)::numeric as total, count(*)::bigint as acciones
  from pipeline_puntos pp
  join empleados e on e.id = pp.empleado_id
  where pp.fecha >= (date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima')
    and pp.puntos > 0
    and (private.app_es_admin() or pp.empleado_id = auth.uid())
  group by e.id, e.nombre
  order by total desc
  limit 10;
$$;
revoke execute on function public.pipeline_ranking_hoy() from public, anon;
grant  execute on function public.pipeline_ranking_hoy() to authenticated;


-- ===== 0175_envios_solo_rpc.sql =====
-- 0175 — Envíos y calificaciones de prendas: se leen con RLS y se escriben sólo por RPC.
-- Prueba: packages/db/pruebas/0175_envios_solo_rpc.prueba.sql (escrita antes). Idempotente.
-- No-negociable 2 (todo avance de prenda pasa por una RPC). Auditoría 1, 19-oct-2026.
--
-- Antes: envios_rw y calif_rw (0006) eran FOR ALL. Un encargado podía marcar un envío como recibido
-- y validado, borrarlo, o insertar una calificación a nombre de otra persona con un update/insert
-- plano. Las escrituras legítimas ya van por RPC security definer (pipeline_enviar,
-- pipeline_enviar_tanda, pipeline_calificar, pipeline_anular_envio, lavanderia_enviar), que no
-- dependen de estas policies. La lectura queda con la misma condición de siempre.
--
-- prenda_pasada.pasada_insert NO se toca: lo usan pedido_crear/pedido_devolver (security invoker,
-- módulo comercial fuera de alcance). Queda anotado como pendiente.

drop policy if exists envios_rw  on public.envios_prendas;
drop policy if exists envios_sel on public.envios_prendas;
create policy envios_sel on public.envios_prendas for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_destino_cod in (select private.app_sedes()));
revoke insert, update, delete, truncate on public.envios_prendas from authenticated, anon;

drop policy if exists calif_rw  on public.prenda_calificacion;
drop policy if exists calif_sel on public.prenda_calificacion;
create policy calif_sel on public.prenda_calificacion for select
  using (
    private.app_es_admin() or private.app_es_almacen()
    or exists (select 1 from public.prenda_pasada p
               where p.id = prenda_calificacion.pasada_id and p.sede_origen_cod in (select private.app_sedes()))
    or exists (select 1 from public.envios_prendas e
               where e.id = prenda_calificacion.envio_id and e.sede_destino_cod in (select private.app_sedes()))
  );
revoke insert, update, delete, truncate on public.prenda_calificacion from authenticated, anon;


-- ===== 0176_indices_rendimiento.sql =====
-- 0176 · Índices de rendimiento (auditoría 2, 19-oct-2026).
--
-- Sólo índices: no cambia ninguna regla, RPC ni política. Cubre columnas que hoy se filtran o se unen
-- (RLS por sede, fichas del colaborador, desempeño, campana, pipeline) y no tenían índice propio.
-- Postgres no indexa las claves foráneas solo: sin esto, cada lectura de «reportes de una persona» o
-- «prendas de una sede» recorre la tabla completa y empeora con cada mes de datos.
-- Idempotente (if not exists). Sin `concurrently`: las migraciones corren dentro de una transacción
-- y las tablas son pequeñas (18 empleados, 4 sedes); el bloqueo dura milisegundos.

create index if not exists reporte_trabajadores_reporte_idx   on reporte_trabajadores (reporte_id);
create index if not exists reporte_trabajadores_empleado_idx  on reporte_trabajadores (empleado_id, reporte_id);
create index if not exists reporte_extras_reporte_idx         on reporte_extras (reporte_id);
create index if not exists pipeline_puntos_pasada_idx         on pipeline_puntos (pasada_id);
create index if not exists pipeline_puntos_empleado_fecha_idx on pipeline_puntos (empleado_id, fecha);
create index if not exists prenda_historial_empleado_fecha_idx on prenda_historial (empleado_id, fecha);
create index if not exists prenda_pasada_sede_etapa_idx       on prenda_pasada (sede_origen_cod, etapa);
create index if not exists incidencias_responsable_idx        on incidencias (responsable_id);
create index if not exists incidencias_reporte_idx            on incidencias (reporte_id) where reporte_id is not null;
create index if not exists notificaciones_destinatario_idx    on notificaciones (destinatario_id) where destinatario_id is not null and not leida;
create index if not exists reportes_encargado_fecha_idx       on reportes (encargado_id, fecha);
create index if not exists sueldo_ventas_empleado_fecha_idx   on sueldo_ventas (empleado_id, fecha) where empleado_id is not null;

commit;
