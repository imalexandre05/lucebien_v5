-- 0112_codigo_personal.sql — en un equipo compartido, cada acción del pipeline se atribuye a la
-- persona que tecleó su código personal, no a la dueña de la sesión.
--
-- Implementa docs/superpowers/specs/pipeline/2026-10-04-codigo-personal-design.md §3 y §4
-- (versión con TOKEN DE OPERADOR, corregida el 04-oct-2026 tras la revisión del PR #42).
-- Prueba: packages/db/pruebas/0112_codigo_personal.prueba.sql  (bash tools/probar-migracion.sh 0112)
--
-- EL PROBLEMA. El sistema nuevo atribuye todo a auth.uid(): en la PC del almacén, abierta con UNA
-- cuenta, los puntos de lo que mueven varias personas van a la dueña de la sesión, y los puntos
-- alimentan reportes → nota /20 → pago.
--
-- EL DISEÑO (resumen; el detalle está en la spec):
--   · El código (empleados.cod) se teclea UNA vez y sólo lo ve pipeline_validar_codigo, que es
--     security definer, cuenta los intentos SIN lanzar excepción (un raise haría rollback del
--     intento y el límite nunca se alcanzaría) y emite un token de operador ligado a la sesión.
--   · Las RPC del pipeline reciben `p_operador uuid default null` (el token). null = como hoy.
--     No reciben el código: así no hay forma de probar códigos llamando a las RPC directo.
--   · Se guarda además quién tenía la sesión (prenda_historial.registrado_por) para auditoría.
--
-- DECISIÓN DE LA SPEC §4 (extensión por inactividad): se implementa `private.tocar_operador`
-- (definer): cada acción exitosa con token renueva `expira_en` a now() + ventana. Se descartó la
-- expiración fija porque la spec §5 promete «10 minutos SIN ACTIVIDAD» a quien opera.
--
-- DEFAULTS DE NEGOCIO (no-negociable 5). Valores PROVISIONALES, no confirmados por el dueño,
-- editables desde /configuracion (apps/erp-web/lib/config-catalogo.ts) y anotados en
-- docs/pendientes-negocio.md:
--   codigo_max_intentos          = 5   fallos permitidos antes de bloquear la sesión
--   codigo_ventana_intentos_min  = 15  minutos que cuenta cada fallo
--   codigo_operador_min          = 10  minutos de operador activo sin actividad
--
-- PERMISOS. Las RPC del pipeline son `security invoker` (la RLS sigue mandando) y por eso los dos
-- helpers que llaman (`operador_de_token`, `tocar_operador`) llevan `grant execute to authenticated`
-- (patrón de 0037; el schema `private` no está expuesto por PostgREST). `empleado_por_codigo` NO
-- lleva grant: sólo la llama pipeline_validar_codigo, que es definer.
--
-- Cambiar la firma de una función crea una SOBRECARGA en vez de reemplazarla, y una llamada con los
-- argumentos viejos pasaría a ser ambigua. Por eso cada RPC se borra con `drop function if exists
-- <firma vieja>` antes de recrearse, y se vuelven a otorgar sus grants.
--
-- Idempotente: se puede reaplicar sin fallar (`if not exists`, `drop ... if exists`,
-- `create or replace`, `on conflict do nothing`).
--
-- Nota sobre la spec: dice `dispositivos.compartido`; la tabla real (0036) es
-- `dispositivos_autorizados`, y es ahí donde va la columna.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio. (Aquí es a propósito: las dos tablas nuevas las
--     escriben sólo funciones definer, que no pasan por RLS; llevan una policy `using (false)`.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Esquema
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Equipo compartido: el admin lo activa desde /dispositivos. default false → desplegar esto no
-- cambia nada para nadie.
alter table dispositivos_autorizados add column if not exists compartido boolean not null default false;

-- Quién tenía la sesión cuando se hizo el movimiento (auth.uid()). empleado_id pasa a ser el
-- operador real (el dueño del código) cuando hay token.
alter table prenda_historial add column if not exists registrado_por uuid;

-- Intentos de validar un código. Sólo los escribe pipeline_validar_codigo.
create table if not exists codigo_intentos (
  id         uuid primary key default gen_random_uuid(),
  sesion_uid uuid not null,
  device_id  text,
  ok         boolean not null,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_codigo_intentos_sesion on codigo_intentos(sesion_uid, creado_en desc);

-- Tokens de operador. Un token sólo vale para la sesión que lo pidió. Nadie lo lee por PostgREST.
create table if not exists codigo_operadores (
  token       uuid primary key default gen_random_uuid(),
  sesion_uid  uuid not null,
  empleado_id uuid not null references empleados(id) on delete cascade,
  device_id   text,
  creado_en   timestamptz not null default now(),
  expira_en   timestamptz not null
);
create index if not exists idx_codigo_operadores_sesion on codigo_operadores(sesion_uid);

alter table codigo_intentos   enable row level security;
alter table codigo_operadores enable row level security;

-- codigo_intentos: sólo el administrador lee (para investigar un bloqueo). Nadie escribe por
-- PostgREST. codigo_operadores: nadie lee ni escribe (los tokens no se leen).
drop policy if exists codigo_intentos_admin_select on codigo_intentos;
create policy codigo_intentos_admin_select on codigo_intentos for select
  using (private.app_es_admin());

-- Cierre explícito de escritura (y de lectura en codigo_operadores): `using (false)` es una policy
-- «for all» que no deja pasar a nadie por PostgREST. Las funciones definer no pasan por RLS. Se
-- escribe a propósito en vez de dejar la tabla sin policy: una tabla con RLS y sin policy parece un
-- olvido (es el patrón que dejó a empleado_tiendas fallando en silencio hasta la 0067).
drop policy if exists codigo_intentos_cerrada on codigo_intentos;
create policy codigo_intentos_cerrada on codigo_intentos for all using (false) with check (false);
drop policy if exists codigo_operadores_cerrada on codigo_operadores;
create policy codigo_operadores_cerrada on codigo_operadores for all using (false) with check (false);

revoke all on codigo_intentos   from anon, authenticated;
revoke all on codigo_operadores from anon, authenticated;
grant select on codigo_intentos to authenticated;   -- la policy lo reduce al administrador

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Parámetros (defaults provisionales — ver cabecera)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('codigo_max_intentos',         '5'),    -- default provisional (spec §4), sin confirmar
  ('codigo_ventana_intentos_min', '15'),   -- default provisional (spec §4), sin confirmar
  ('codigo_operador_min',         '10')    -- default provisional (spec §4/§5), sin confirmar
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Resolución de código y de token
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Código → empleado activo (o null). SIN grant: sólo la usa pipeline_validar_codigo.
create or replace function private.empleado_por_codigo(p_codigo text)
  returns uuid language sql stable security definer set search_path = public
as $$
  select e.id from public.empleados e
  where e.cod = btrim(p_codigo) and e.activo
  limit 1;
$$;
revoke execute on function private.empleado_por_codigo(text) from public, anon, authenticated;

-- Token → empleado (o null). Sólo vale si es de la sesión que llama, no venció y el empleado
-- sigue activo. `stable`: no escribe; la renovación la hace tocar_operador.
create or replace function private.operador_de_token(p_token uuid)
  returns uuid language sql stable security definer set search_path = public
as $$
  select o.empleado_id
  from public.codigo_operadores o
  join public.empleados e on e.id = o.empleado_id
  where o.token = p_token
    and o.sesion_uid = auth.uid()
    and o.expira_en > now()
    and e.activo
  limit 1;
$$;
revoke execute on function private.operador_de_token(uuid) from public, anon;
grant execute on function private.operador_de_token(uuid) to authenticated;

-- Renueva la ventana de inactividad de un token vigente de la sesión que llama.
create or replace function private.tocar_operador(p_token uuid)
  returns void language plpgsql volatile security definer set search_path = public
as $$
declare v_min int;
begin
  select coalesce((select valor::int from public.config where clave = 'codigo_operador_min'), 10) into v_min;
  update public.codigo_operadores
    set expira_en = now() + make_interval(mins => v_min)
    where token = p_token and sesion_uid = auth.uid() and expira_en > now();
end;
$$;
revoke execute on function private.tocar_operador(uuid) from public, anon;
grant execute on function private.tocar_operador(uuid) to authenticated;

-- Quién actúa en una RPC del pipeline: la sesión si no hay token; si hay, el dueño del token
-- (y se renueva su ventana). Token inválido, ajeno o vencido → excepción, y no se escribe nada.
-- `security invoker`: sólo ordena las llamadas de arriba; no ve nada que el llamador no vea.
create or replace function private.actor_pipeline(p_operador uuid)
  returns uuid language plpgsql volatile security invoker set search_path = public
as $$
declare v_actor uuid;
begin
  if p_operador is null then return auth.uid(); end if;
  v_actor := private.operador_de_token(p_operador);
  if v_actor is null then
    raise exception 'CODIGO: operador vencido, vuelve a ingresar tu código';
  end if;
  perform private.tocar_operador(p_operador);
  return v_actor;
end;
$$;
revoke execute on function private.actor_pipeline(uuid) from public, anon;
grant execute on function private.actor_pipeline(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) pipeline_validar_codigo — la ÚNICA puerta del código
--    Nunca lanza excepción por código malo: el intento tiene que quedar escrito.
--    Devuelve {ok, token, nombre, expira_en, ventana_min} | {ok:false, bloqueado_min} | {ok:false, intentos_restantes}
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pipeline_validar_codigo(p_codigo text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_sesion uuid := auth.uid();
  v_max int; v_ventana int; v_op_min int;
  v_fallos int; v_levanta timestamptz; v_min int;
  v_emp uuid; v_nombre text; v_token uuid; v_exp timestamptz;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  select coalesce((select valor::int from config where clave = 'codigo_max_intentos'), 5),
         coalesce((select valor::int from config where clave = 'codigo_ventana_intentos_min'), 15),
         coalesce((select valor::int from config where clave = 'codigo_operador_min'), 10)
    into v_max, v_ventana, v_op_min;

  -- 1) ¿Sesión bloqueada? El bloqueo se levanta cuando el fallo que lo completó sale de la ventana.
  select count(*) into v_fallos from codigo_intentos
    where sesion_uid = v_sesion and not ok and creado_en > now() - make_interval(mins => v_ventana);
  if v_fallos >= v_max then
    select creado_en + make_interval(mins => v_ventana) into v_levanta from codigo_intentos
      where sesion_uid = v_sesion and not ok and creado_en > now() - make_interval(mins => v_ventana)
      order by creado_en asc offset (v_fallos - v_max) limit 1;
    v_min := greatest(1, ceil(extract(epoch from (v_levanta - now())) / 60.0)::int);
    return jsonb_build_object('ok', false, 'bloqueado_min', v_min);
  end if;

  -- 2) Registrar el intento (siempre) y resolver el código.
  v_emp := private.empleado_por_codigo(p_codigo);
  insert into codigo_intentos (sesion_uid, device_id, ok) values (v_sesion, p_device, v_emp is not null);

  if v_emp is null then
    return jsonb_build_object('ok', false, 'intentos_restantes', greatest(v_max - v_fallos - 1, 0));
  end if;

  -- 3) Emitir el token. De paso se barren los tokens vencidos hace más de un día.
  delete from codigo_operadores where expira_en < now() - interval '1 day';
  v_exp := now() + make_interval(mins => v_op_min);
  insert into codigo_operadores (sesion_uid, empleado_id, device_id, expira_en)
    values (v_sesion, v_emp, p_device, v_exp) returning token into v_token;
  select nombre into v_nombre from empleados where id = v_emp;

  return jsonb_build_object('ok', true, 'token', v_token, 'nombre', v_nombre, 'expira_en', v_exp,
                            'ventana_min', v_op_min);
end;
$$;
revoke execute on function pipeline_validar_codigo(text, text) from public, anon;
grant execute on function pipeline_validar_codigo(text, text) to authenticated;

-- ¿Este equipo está marcado como compartido? La llama la server action (la tabla
-- dispositivos_autorizados sólo la lee el admin por RLS, 0036). Devuelve sólo un booleano y sólo
-- para un equipo aprobado cuyo device_id (cookie httpOnly) ya conoce quien pregunta.
create or replace function dispositivo_compartido(p_device_id text)
  returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select d.compartido from public.dispositivos_autorizados d
      where d.device_id = p_device_id and d.estado = 'aprobado'), false);
$$;
revoke execute on function dispositivo_compartido(text) from public, anon;
grant execute on function dispositivo_compartido(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) Las RPC del pipeline. Mismo cuerpo que su última definición, salvo:
--      · v_actor sale de private.actor_pipeline(p_operador) (null → auth.uid(), como hoy);
--      · prenda_historial guarda además registrado_por = auth.uid().
--    Última definición de cada una: avanzar 0086 · avanzar_tanda 0011 · rechazar 0009 ·
--    enviar 0055 · deshacer 0010 · dividir 0086 · deshacer_division 0054 · calificar 0013.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

drop function if exists pipeline_avanzar(uuid, text);
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

  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
  values (p_id, v_etapa, p_destino, v_actor, null, v_sesion);

  if v_pts > 0 then
    insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end, now());
  end if;
  return coalesce(v_pts, 0);
end;
$$;
revoke execute on function pipeline_avanzar(uuid, text, uuid) from public;
grant execute on function pipeline_avanzar(uuid, text, uuid) to authenticated;

-- Tanda: el token se resuelve ANTES del bucle. El bucle traga las excepciones por prenda (las que
-- no se pueden avanzar se omiten); un token malo no debe convertirse en «no movió nada».
drop function if exists pipeline_avanzar_tanda(uuid[], text);
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
revoke execute on function pipeline_avanzar_tanda(uuid[], text, uuid) from public;
grant execute on function pipeline_avanzar_tanda(uuid[], text, uuid) to authenticated;

drop function if exists pipeline_enviar(uuid, text);
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
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
    values (p_id, 'listo', 'enviado', v_actor, 'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede, v_sesion);

  -- Fase 7 tarea 2 (0055): el activo vinculado sale del pipeline y queda disponible.
  if v_activo_id is not null then
    update inventario_activo
      set estado = 'disponible'
      where id = v_activo_id and estado in ('codificando', 'en_pipeline', 'en_compostura');
  end if;
end;
$$;
revoke execute on function pipeline_enviar(uuid, text, uuid) from public;
grant execute on function pipeline_enviar(uuid, text, uuid) to authenticated;

drop function if exists pipeline_rechazar(uuid, text);
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
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
    values (p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino, v_sesion);

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
$$;
revoke execute on function pipeline_rechazar(uuid, text, uuid) from public;
grant execute on function pipeline_rechazar(uuid, text, uuid) to authenticated;

drop function if exists pipeline_deshacer(uuid, text);
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
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
    values (p_id, v_etapa, p_etapa_anterior, v_actor, 'Deshacer', v_sesion);
  delete from pipeline_puntos where id = (
    select id from pipeline_puntos
    where pasada_id = p_id and empleado_id = v_actor and puntos > 0
    order by fecha desc limit 1
  );
end;
$$;
revoke execute on function pipeline_deshacer(uuid, text, uuid) from public;
grant execute on function pipeline_deshacer(uuid, text, uuid) to authenticated;

drop function if exists pipeline_dividir(uuid);
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
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs, registrado_por)
    values (v_saco, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo, v_sesion);

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_pant;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs, registrado_por)
    values (v_pant, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo, v_sesion);

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
    values (p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón', v_sesion);
end;
$$;
revoke execute on function pipeline_dividir(uuid, uuid) from public;
grant execute on function pipeline_dividir(uuid, uuid) to authenticated;

drop function if exists pipeline_deshacer_division(uuid);
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

  delete from pipeline_puntos where pasada_id = any(v_hijos);
  delete from prenda_pasada where id = any(v_hijos);

  update prenda_pasada set
    dividida = false, dividida_en = null, etapa = v_etapa_original, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
    values (p_id, 'dividido', v_etapa_original, v_actor, 'Deshacer división: vuelve a ' || v_etapa_original, v_sesion);
end;
$$;
revoke execute on function pipeline_deshacer_division(uuid, uuid) from public;
grant execute on function pipeline_deshacer_division(uuid, uuid) to authenticated;

drop function if exists pipeline_calificar(uuid, boolean, text, text);
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
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
      values (p_id, v_etapa, 'recibido', v_actor, 'Recibida y aceptada en tienda', v_sesion);
  else
    update prenda_pasada set etapa = p_destino, envio_id = null, aprobada = false, fecha_actualizado = now()
      where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por)
      values (p_id, v_etapa, p_destino, v_actor,
              'Observada en tienda → ' || p_destino || coalesce(': ' || nullif(p_obs, ''), ''), v_sesion);
  end if;
end;
$$;
revoke execute on function pipeline_calificar(uuid, boolean, text, text, uuid) from public;
grant execute on function pipeline_calificar(uuid, boolean, text, text, uuid) to authenticated;

-- Prueba de ataque: packages/db/pruebas/0112_codigo_personal.prueba.sql
--   bash tools/probar-migracion.sh 0112
