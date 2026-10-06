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
-- ENMIENDA 06-oct-2026 (spec §0; auditorías docs/auditorias/2026-10-06-{pipeline,seguridad}.md):
--   · El código deja de ser empleados.cod (4 dígitos, además usuario de login): se teclea
--     usuario (cod) + un PIN propio de ≥ codigo_pin_min_largo dígitos, guardado sólo como hash
--     bcrypt en codigo_pines. Cada persona lo define con pipeline_definir_pin; el admin lo borra.
--   · El límite de intentos cuenta por PERSONA (contra quien se apunta) además de por sesión.
--   · empleados.cuenta_compartida: para esa cuenta las RPC rechazan p_operador null (la exigencia
--     vive en la base, no sólo en la server action).
--   · pipeline_puntos.historial_id: deshacer borra los puntos DEL MOVIMIENTO deshecho (de quien
--     lo hizo), no los del actor; y sólo deshace el último movimiento de la prenda (H-1, H-2).
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
--   codigo_operador_max_h        = 8   horas máximas de vida de un token desde su emisión (un
--                                      turno), aunque se renueve por actividad (spec §8)
--   codigo_pin_min_largo         = 6   dígitos mínimos del PIN personal (enmienda 06-oct, spec §0)
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

-- Cuenta con la que se abre un equipo compartido (la marca el admin desde /dispositivos). Para
-- ella las RPC del pipeline exigen token: sin código no se mueve nada (spec §0 E-3).
alter table empleados add column if not exists cuenta_compartida boolean not null default false;

-- El movimiento que originó cada punto: deshacer borra los puntos de ESE movimiento (spec §0 E-4).
alter table pipeline_puntos add column if not exists historial_id uuid
  references prenda_historial(id) on delete set null;
create index if not exists idx_pipeline_puntos_historial on pipeline_puntos(historial_id)
  where historial_id is not null;

-- PIN personal: sólo el hash bcrypt. Nadie lo lee por PostgREST; lo escriben y comparan funciones
-- definer.
create table if not exists codigo_pines (
  empleado_id    uuid primary key references empleados(id) on delete cascade,
  pin_hash       text not null,
  actualizado_en timestamptz not null default now()
);
alter table codigo_pines enable row level security;
drop policy if exists codigo_pines_cerrada on codigo_pines;
create policy codigo_pines_cerrada on codigo_pines for all using (false) with check (false);
revoke all on codigo_pines from anon, authenticated;

-- Intentos de validar un código. Sólo los escriben pipeline_validar_codigo y pipeline_definir_pin.
create table if not exists codigo_intentos (
  id         uuid primary key default gen_random_uuid(),
  sesion_uid uuid not null,
  device_id  text,
  ok         boolean not null,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_codigo_intentos_sesion on codigo_intentos(sesion_uid, creado_en desc);
-- Persona contra la que se apuntó (el usuario tecleado). El límite también cuenta por persona.
alter table codigo_intentos add column if not exists empleado_id uuid;
create index if not exists idx_codigo_intentos_empleado on codigo_intentos(empleado_id, creado_en desc)
  where empleado_id is not null;

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
  ('codigo_operador_min',         '10'),   -- default provisional (spec §4/§5), sin confirmar
  ('codigo_operador_max_h',       '8'),    -- default provisional (spec §8: un turno), sin confirmar
  ('codigo_pin_min_largo',        '6')     -- default provisional (spec §0 E-1), sin confirmar
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Resolución de código y de token
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Lee un parámetro entero de config tolerando basura: si el administrador guarda «5.5» o texto, se
-- usa la parte entera o el default en vez de romper la validación para todos.
create or replace function private.codigo_param(p_clave text, p_defecto int)
  returns int language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select case when c.valor ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then greatest(floor(c.valor::numeric)::int, 1) end
       from public.config c where c.clave = p_clave),
    p_defecto);
$$;
revoke execute on function private.codigo_param(text, int) from public, anon, authenticated;

-- La versión anterior comparaba el código contra empleados.cod. Ya no existe (spec §0 E-1).
drop function if exists private.empleado_por_codigo(text);

-- ¿El PIN coincide con el hash guardado de esta persona? SIN grant: sólo la usan
-- pipeline_validar_codigo y pipeline_definir_pin, que son definer. pgcrypto vive en `extensions`
-- en Supabase: por eso el search_path.
create or replace function private.codigo_pin_valido(p_empleado uuid, p_pin text)
  returns boolean language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(
    (select p.pin_hash = crypt(coalesce(p_pin, ''), p.pin_hash)
       from public.codigo_pines p where p.empleado_id = p_empleado),
    false);
$$;
revoke execute on function private.codigo_pin_valido(uuid, text) from public, anon, authenticated;

-- PIN trivial: todos los dígitos iguales, una secuencia ascendente o descendente (123456, 654321)
-- o el propio usuario (cod). Sin grant.
create or replace function private.codigo_pin_trivial(p_pin text, p_cod text)
  returns boolean language plpgsql immutable set search_path = public
as $$
declare v_sube boolean := true; v_baja boolean := true; i int;
begin
  if p_pin ~ '^(.)\1*$' or p_pin = btrim(coalesce(p_cod, '')) then return true; end if;
  for i in 2..length(p_pin) loop
    if substr(p_pin, i, 1)::int <> (substr(p_pin, i - 1, 1)::int + 1) % 10 then v_sube := false; end if;
    if substr(p_pin, i, 1)::int <> (substr(p_pin, i - 1, 1)::int + 9) % 10 then v_baja := false; end if;
  end loop;
  return v_sube or v_baja;
end;
$$;
revoke execute on function private.codigo_pin_trivial(text, text) from public, anon, authenticated;

-- Minutos que faltan para que se levante el bloqueo de una sesión (p_sesion) o de una persona
-- (p_empleado); 0 si no está bloqueada. El bloqueo se levanta cuando el fallo que lo completó sale
-- de la ventana. Sin grant.
create or replace function private.codigo_min_bloqueo(p_sesion uuid, p_empleado uuid, p_max int, p_ventana int)
  returns int language plpgsql stable security definer set search_path = public
as $$
declare v_fallos int; v_levanta timestamptz;
begin
  if p_sesion is null and p_empleado is null then return 0; end if;
  select count(*) into v_fallos from public.codigo_intentos
    where not ok and creado_en > now() - make_interval(mins => p_ventana)
      and (p_sesion is null or sesion_uid = p_sesion)
      and (p_empleado is null or empleado_id = p_empleado);
  if v_fallos < p_max then return 0; end if;
  select creado_en + make_interval(mins => p_ventana) into v_levanta from public.codigo_intentos
    where not ok and creado_en > now() - make_interval(mins => p_ventana)
      and (p_sesion is null or sesion_uid = p_sesion)
      and (p_empleado is null or empleado_id = p_empleado)
    order by creado_en asc offset (v_fallos - p_max) limit 1;
  return greatest(1, ceil(extract(epoch from (v_levanta - now())) / 60.0)::int);
end;
$$;
revoke execute on function private.codigo_min_bloqueo(uuid, uuid, int, int) from public, anon, authenticated;

-- Registra un fallo y, si con él se completa el máximo de una sesión o de una persona, deja UNA
-- notificación para el admin (motor existente 0041/0109). Devuelve los intentos que quedan antes
-- del bloqueo (el menor entre sesión y persona). Sin grant.
create or replace function private.codigo_registrar_fallo(p_sesion uuid, p_device text, p_empleado uuid,
                                                           p_max int, p_ventana int)
  returns int language plpgsql volatile security definer set search_path = public
as $$
declare v_ses int; v_emp int := 0; v_tipo text; v_msg text; v_ref uuid;
begin
  insert into public.codigo_intentos (sesion_uid, device_id, empleado_id, ok)
    values (p_sesion, p_device, p_empleado, false);
  select count(*) into v_ses from public.codigo_intentos
    where sesion_uid = p_sesion and not ok and creado_en > now() - make_interval(mins => p_ventana);
  if p_empleado is not null then
    select count(*) into v_emp from public.codigo_intentos
      where empleado_id = p_empleado and not ok and creado_en > now() - make_interval(mins => p_ventana);
  end if;

  if v_emp = p_max then
    v_tipo := 'codigo_persona_bloqueada'; v_ref := p_empleado;
    v_msg := 'El PIN de ' || coalesce((select nombre from public.empleados where id = p_empleado), 'una persona')
      || ' se tecleó mal ' || p_max || ' veces en ' || p_ventana
      || ' minutos y quedó bloqueado. Puede ser un error al teclear o alguien probando su PIN.';
  elsif v_ses = p_max then
    v_tipo := 'codigo_sesion_bloqueada'; v_ref := p_sesion;
    v_msg := 'La sesión de ' || coalesce((select nombre from public.empleados where id = p_sesion), 'una persona')
      || ' falló ' || p_max || ' veces el código personal en ' || p_ventana
      || ' minutos y quedó bloqueada. Puede ser un error al teclear o alguien probando códigos.';
  end if;
  if v_tipo is not null then
    insert into public.notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol,
                                       ref_tipo, ref_id, dedup_key)
    values (v_tipo,
            case when v_tipo = 'codigo_persona_bloqueada' then 'PIN bloqueado por intentos'
                 else 'Sesión bloqueada por intentos de código' end,
            v_msg, 'warn', 'admin', 'empleado', v_ref::text,
            v_tipo || ':' || v_ref::text || ':' || extract(epoch from now())::bigint::text)
    on conflict (dedup_key) do nothing;
  end if;
  return greatest(p_max - greatest(v_ses, v_emp), 0);
end;
$$;
revoke execute on function private.codigo_registrar_fallo(uuid, text, uuid, int, int) from public, anon, authenticated;

-- ¿La sesión es la cuenta de un equipo compartido? Sin grant a anon.
create or replace function private.sesion_es_cuenta_compartida()
  returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select e.cuenta_compartida from public.empleados e where e.id = auth.uid()), false);
$$;
revoke execute on function private.sesion_es_cuenta_compartida() from public, anon;
grant execute on function private.sesion_es_cuenta_compartida() to authenticated;

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
    and o.creado_en + make_interval(hours => private.codigo_param('codigo_operador_max_h', 8)) > now()
    and e.activo and not e.cuenta_compartida
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
  v_min := private.codigo_param('codigo_operador_min', 10);
  -- La renovación nunca pasa de la vida máxima desde la emisión (codigo_operador_max_h).
  update public.codigo_operadores
    set expira_en = least(now() + make_interval(mins => v_min),
                          creado_en + make_interval(hours => private.codigo_param('codigo_operador_max_h', 8)))
    where token = p_token and sesion_uid = auth.uid() and expira_en > now();
end;
$$;
revoke execute on function private.tocar_operador(uuid) from public, anon;
grant execute on function private.tocar_operador(uuid) to authenticated;

-- «cambiar» en la pantalla: revoca el token en la base (no basta olvidarlo en el navegador). Sólo
-- borra tokens de la propia sesión, así que no sirve para tumbar el de otra persona.
create or replace function pipeline_cerrar_operador(p_token uuid)
  returns void language sql volatile security definer set search_path = public
as $$
  delete from public.codigo_operadores where token = p_token and sesion_uid = auth.uid();
$$;
revoke execute on function pipeline_cerrar_operador(uuid) from public, anon;
grant execute on function pipeline_cerrar_operador(uuid) to authenticated;

-- Quién actúa en una RPC del pipeline: la sesión si no hay token; si hay, el dueño del token
-- (y se renueva su ventana). Token inválido, ajeno o vencido → excepción, y no se escribe nada.
-- Si la sesión es una cuenta de equipo compartido, el token es OBLIGATORIO (spec §0 E-3).
-- `security invoker`: sólo ordena las llamadas de arriba; no ve nada que el llamador no vea.
create or replace function private.actor_pipeline(p_operador uuid)
  returns uuid language plpgsql volatile security invoker set search_path = public
as $$
declare v_actor uuid;
begin
  if p_operador is null then
    if private.sesion_es_cuenta_compartida() then
      raise exception 'CODIGO: esta cuenta es de un equipo compartido, ingresa tu código';
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
grant execute on function private.actor_pipeline(uuid) to authenticated;

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
-- 4) pipeline_validar_codigo — la ÚNICA puerta del código (usuario + PIN)
--    Nunca lanza excepción por PIN malo: el intento tiene que quedar escrito.
--    Devuelve {ok, token, nombre, expira_en, ventana_min} | {ok:false, motivo:'equipo_no_compartido'}
--           | {ok:false, bloqueado_min} | {ok:false, intentos_restantes[, motivo:'sin_pin']}
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop function if exists pipeline_validar_codigo(text, text);
create or replace function pipeline_validar_codigo(p_usuario text, p_pin text, p_device text)
  returns jsonb language plpgsql security definer set search_path = public
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
  if not coalesce(dispositivo_compartido(p_device), false) then
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4b) PIN personal: definirlo (la propia persona), borrarlo (admin) y saber si existe
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- La persona define o cambia SU PIN desde su sesión. Para cambiarlo debe dar el actual; un actual
-- equivocado cuenta como fallo contra ella misma (si no, sería un atajo para probar PIN sin
-- límite). Al cambiarlo se revocan sus tokens vivos.
-- Devuelve {ok:true} | {ok:false, motivo: 'pin_corto'|'pin_trivial'|'pin_actual_incorrecto'|
--          'cuenta_compartida'|'sin_permiso', largo_min?, intentos_restantes?, bloqueado_min?}
create or replace function pipeline_definir_pin(p_pin_nuevo text, p_pin_actual text default null)
  returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp uuid := auth.uid();
  v_cod text; v_activo boolean; v_compartida boolean;
  v_largo int; v_max int; v_ventana int; v_min int;
begin
  if v_emp is null then raise exception 'No autenticado'; end if;
  select cod, activo, cuenta_compartida into v_cod, v_activo, v_compartida from empleados where id = v_emp;
  if not found or not v_activo then
    return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  end if;
  if v_compartida then
    return jsonb_build_object('ok', false, 'motivo', 'cuenta_compartida');
  end if;

  v_largo := private.codigo_param('codigo_pin_min_largo', 6);
  if p_pin_nuevo is null or p_pin_nuevo !~ '^[0-9]+$' or length(p_pin_nuevo) < v_largo then
    return jsonb_build_object('ok', false, 'motivo', 'pin_corto', 'largo_min', v_largo);
  end if;
  if private.codigo_pin_trivial(p_pin_nuevo, v_cod) then
    return jsonb_build_object('ok', false, 'motivo', 'pin_trivial');
  end if;

  perform pg_advisory_xact_lock(hashtext('codigo-sesion:' || v_emp::text));
  perform pg_advisory_xact_lock(hashtext('codigo-persona:' || v_emp::text));
  if exists (select 1 from codigo_pines where empleado_id = v_emp) then
    v_max     := private.codigo_param('codigo_max_intentos', 5);
    v_ventana := private.codigo_param('codigo_ventana_intentos_min', 15);
    v_min := private.codigo_min_bloqueo(null, v_emp, v_max, v_ventana);
    if v_min > 0 then
      return jsonb_build_object('ok', false, 'bloqueado_min', v_min);
    end if;
    if not private.codigo_pin_valido(v_emp, p_pin_actual) then
      return jsonb_build_object('ok', false, 'motivo', 'pin_actual_incorrecto', 'intentos_restantes',
        private.codigo_registrar_fallo(v_emp, null, v_emp, v_max, v_ventana));
    end if;
  end if;

  insert into codigo_pines (empleado_id, pin_hash, actualizado_en)
    values (v_emp, crypt(p_pin_nuevo, gen_salt('bf')), now())
    on conflict (empleado_id) do update set pin_hash = excluded.pin_hash, actualizado_en = now();
  delete from codigo_operadores where empleado_id = v_emp;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function pipeline_definir_pin(text, text) from public, anon;
grant execute on function pipeline_definir_pin(text, text) to authenticated;

-- ¿La sesión ya definió su PIN? (La pantalla decide si pide el actual.)
create or replace function pipeline_tengo_pin()
  returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.codigo_pines where empleado_id = auth.uid());
$$;
revoke execute on function pipeline_tengo_pin() from public, anon;
grant execute on function pipeline_tengo_pin() to authenticated;

-- Admin: borra el PIN de una persona que lo olvidó (no lo ve ni lo define) y revoca sus tokens.
create or replace function pipeline_borrar_pin(p_empleado uuid)
  returns void language plpgsql security definer set search_path = public
as $$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO: sólo el administrador puede borrar un PIN';
  end if;
  delete from codigo_pines where empleado_id = p_empleado;
  delete from codigo_operadores where empleado_id = p_empleado;
end;
$$;
revoke execute on function pipeline_borrar_pin(uuid) from public, anon;
grant execute on function pipeline_borrar_pin(uuid) to authenticated;

-- Admin: marca o desmarca la cuenta con la que se abre un equipo compartido. Marcarla borra su PIN
-- y sus tokens (esa cuenta no opera por sí misma).
create or replace function empleado_marcar_cuenta_compartida(p_empleado uuid, p_valor boolean)
  returns void language plpgsql security definer set search_path = public
as $$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO: sólo el administrador marca una cuenta de equipo compartido';
  end if;
  update empleados set cuenta_compartida = coalesce(p_valor, false) where id = p_empleado;
  if not found then raise exception 'Empleado no encontrado'; end if;
  if coalesce(p_valor, false) then
    delete from codigo_pines where empleado_id = p_empleado;
    delete from codigo_operadores where empleado_id = p_empleado;
  end if;
end;
$$;
revoke execute on function empleado_marcar_cuenta_compartida(uuid, boolean) from public, anon;
grant execute on function empleado_marcar_cuenta_compartida(uuid, boolean) to authenticated;


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
  v_permitidos text[]; v_hist uuid;
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

  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
  values (p_id, v_etapa, p_destino, v_actor, null, v_sesion, clock_timestamp())
  returning id into v_hist;

  if v_pts > 0 then
    insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha, historial_id)
    values (v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end, now(),
            v_hist);
  end if;
  return coalesce(v_pts, 0);
end;
$$;
revoke execute on function pipeline_avanzar(uuid, text, uuid) from public, anon;
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
revoke execute on function pipeline_avanzar_tanda(uuid[], text, uuid) from public, anon;
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
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
    values (p_id, 'listo', 'enviado', v_actor, 'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede, v_sesion, clock_timestamp());

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

drop function if exists pipeline_rechazar(uuid, text);
create or replace function pipeline_rechazar(p_id uuid, p_destino text, p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_tipo text; v_tlav text; v_codigo text;
  v_culpable uuid; v_clave text; v_peso numeric; v_pts numeric; v_media boolean; v_hist uuid;
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
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
    values (p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino, v_sesion, clock_timestamp())
    returning id into v_hist;

  if v_culpable is not null then
    if p_destino = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
    else v_clave := 'pts_' || p_destino; end if;
    select valor::numeric into v_peso from config where clave = v_clave;
    if v_peso is null then v_peso := 1; end if;
    v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
               and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
    v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;
    if v_pts > 0 then
      insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha, historial_id)
      values (v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino, now(), v_hist);
    end if;
  end if;
end;
$$;
revoke execute on function pipeline_rechazar(uuid, text, uuid) from public, anon;
grant execute on function pipeline_rechazar(uuid, text, uuid) to authenticated;

-- Deshacer (spec §0 E-4, auditoría de pipeline H-1/H-2): sólo deshace el ÚLTIMO movimiento de la
-- prenda (p_etapa_anterior tiene que ser su etapa_anterior y la prenda tiene que seguir en su
-- etapa_nueva) y borra los puntos DE ESE movimiento, sean de quien sean. Antes borraba «el último
-- punto positivo del actor»: si B deshacía lo de A, A conservaba el punto y B perdía uno suyo.
drop function if exists pipeline_deshacer(uuid, text);
create or replace function pipeline_deshacer(p_id uuid, p_etapa_anterior text, p_operador uuid default null)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_sesion uuid := auth.uid(); v_actor uuid; v_etapa text; v_ult prenda_historial;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);
  select etapa into v_etapa from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa = 'dividido' then
    raise exception 'TRANSICION: una prenda dividida se deshace con «deshacer división»';
  end if;

  select * into v_ult from prenda_historial where pasada_id = p_id order by fecha desc limit 1;
  if v_ult.id is null or v_ult.etapa_anterior is null
     or v_ult.etapa_nueva is distinct from v_etapa
     or v_ult.etapa_anterior is distinct from p_etapa_anterior then
    raise exception 'TRANSICION: sólo se deshace el último movimiento de la prenda (de "%" a "%")',
      coalesce(v_ult.etapa_anterior, '—'), coalesce(v_ult.etapa_nueva, '—');
  end if;

  update prenda_pasada set etapa = p_etapa_anterior, fecha_actualizado = now() where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
    values (p_id, v_etapa, p_etapa_anterior, v_actor, 'Deshacer', v_sesion, clock_timestamp());

  delete from pipeline_puntos where historial_id = v_ult.id;
  -- Puntos de antes de historial_id: el último positivo de esa prenda y esa etapa, sin mirar quién.
  if not found and v_ult.obs is null then
    delete from pipeline_puntos where id = (
      select id from pipeline_puntos
      where pasada_id = p_id and historial_id is null and etapa = v_ult.etapa_anterior and puntos > 0
      order by fecha desc limit 1
    );
  end if;
end;
$$;
revoke execute on function pipeline_deshacer(uuid, text, uuid) from public, anon;
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
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs, registrado_por, fecha)
    values (v_saco, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo, v_sesion, clock_timestamp());

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_pant;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs, registrado_por, fecha)
    values (v_pant, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo, v_sesion, clock_timestamp());

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
    values (p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón', v_sesion, clock_timestamp());
end;
$$;
revoke execute on function pipeline_dividir(uuid, uuid) from public, anon;
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
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
    values (p_id, 'dividido', v_etapa_original, v_actor, 'Deshacer división: vuelve a ' || v_etapa_original, v_sesion, clock_timestamp());
end;
$$;
revoke execute on function pipeline_deshacer_division(uuid, uuid) from public, anon;
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
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
      values (p_id, v_etapa, 'recibido', v_actor, 'Recibida y aceptada en tienda', v_sesion, clock_timestamp());
  else
    update prenda_pasada set etapa = p_destino, envio_id = null, aprobada = false, fecha_actualizado = now()
      where id = p_id;
    insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, registrado_por, fecha)
      values (p_id, v_etapa, p_destino, v_actor,
              'Observada en tienda → ' || p_destino || coalesce(': ' || nullif(p_obs, ''), ''), v_sesion, clock_timestamp());
  end if;
end;
$$;
revoke execute on function pipeline_calificar(uuid, boolean, text, text, uuid) from public, anon;
grant execute on function pipeline_calificar(uuid, boolean, text, text, uuid) to authenticated;

-- Prueba de ataque: packages/db/pruebas/0112_codigo_personal.prueba.sql
--   bash tools/probar-migracion.sh 0112
