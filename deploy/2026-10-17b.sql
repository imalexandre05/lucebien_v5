-- Release 2026-10-17b: migraciones 0133–0138 en orden. Idempotente. NO registra en schema_migrations.
-- Generado concatenando packages/db/migrations/0133..0138. Aplicar con backup previo.
begin;

-- ===== 0133_temporadas.sql =====
-- 0133_temporadas.sql — temporadas con pago por hora y metas propios (ticket 15).
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-temporadas-pago-y-metas-design.md
-- Prueba: packages/db/pruebas/0133_temporadas.prueba.sql
--
-- Sin temporadas inventadas: la tabla nace VACÍA. El administrador crea las suyas.
-- Lectura: cualquier usuario activo (parámetros de la empresa, no datos de una persona).
-- Escritura: sólo administrador/dueño, por RPC; la tabla no acepta escritura directa.
-- Idempotente: create ... if not exists, drop policy/trigger if exists, create or replace.

create table if not exists public.temporadas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(btrim(nombre)) > 0),
  desde         date not null,
  hasta         date not null,
  pago_por_hora numeric(8,2) check (pago_por_hora is null or pago_por_hora >= 0),
  meta_semanal  numeric(10,2) check (meta_semanal is null or meta_semanal >= 0),
  meta_por_hora numeric(10,4) check (meta_por_hora is null or meta_por_hora >= 0),
  creado_por    uuid references public.empleados(id) on delete set null,
  creado_en     timestamptz not null default now(),
  check (hasta >= desde)
);

alter table public.temporadas enable row level security;
drop policy if exists temporadas_select on public.temporadas;
create policy temporadas_select on public.temporadas for select to authenticated
  using (exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo));

revoke all on public.temporadas from anon, authenticated;
grant select on public.temporadas to authenticated;

drop trigger if exists temporadas_audit on public.temporadas;
create trigger temporadas_audit after insert or update or delete on public.temporadas
  for each row execute function private.audit_log_trigger();

create or replace function public.temporada_guardar(
  p_id uuid, p_nombre text, p_desde date, p_hasta date,
  p_pago_por_hora numeric, p_meta_semanal numeric, p_meta_por_hora numeric
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona las temporadas'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'La temporada necesita un nombre'; end if;
  if p_desde is null or p_hasta is null then raise exception 'Indica desde y hasta'; end if;
  if p_hasta < p_desde then raise exception 'La fecha «hasta» no puede ser anterior a «desde»'; end if;
  if coalesce(p_pago_por_hora, 0) < 0 or coalesce(p_meta_semanal, 0) < 0 or coalesce(p_meta_por_hora, 0) < 0 then
    raise exception 'Los montos no pueden ser negativos';
  end if;
  if exists (
    select 1 from temporadas t
    where t.id is distinct from p_id and t.desde <= p_hasta and p_desde <= t.hasta
  ) then
    raise exception 'Esas fechas se cruzan con otra temporada';
  end if;
  if p_id is null then
    insert into temporadas (nombre, desde, hasta, pago_por_hora, meta_semanal, meta_por_hora, creado_por)
      values (btrim(p_nombre), p_desde, p_hasta, p_pago_por_hora, p_meta_semanal, p_meta_por_hora, auth.uid())
      returning id into v_id;
  else
    update temporadas
       set nombre = btrim(p_nombre), desde = p_desde, hasta = p_hasta,
           pago_por_hora = p_pago_por_hora, meta_semanal = p_meta_semanal, meta_por_hora = p_meta_por_hora
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Temporada no encontrada'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.temporada_eliminar(p_id uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona las temporadas'; end if;
  delete from temporadas where id = p_id;
end;
$$;

revoke execute on function public.temporada_guardar(uuid, text, date, date, numeric, numeric, numeric) from public, anon;
revoke execute on function public.temporada_eliminar(uuid) from public, anon;
grant  execute on function public.temporada_guardar(uuid, text, date, date, numeric, numeric, numeric) to authenticated;
grant  execute on function public.temporada_eliminar(uuid) to authenticated;


-- ===== 0134_candidatos.sql =====
-- 0134_candidatos.sql — ingreso de personal: candidatos, entrevista y prueba (ticket 14).
-- Spec: docs/superpowers/specs/empleados/2026-10-11-candidatos-entrevista-prueba-design.md
-- Prueba: packages/db/pruebas/0134_candidatos.prueba.sql
--
-- Datos personales (DNI, teléfono) de gente que aún no es colaboradora: SÓLO administrador/dueño
-- (private.app_es_admin()) leen y escriben, y toda escritura pasa por RPC. Sin escritura directa.
-- Default no confirmado (docs/pendientes-negocio.md): personal_prueba_dias = 3 (dato del Excel).
-- Idempotente: create ... if not exists, drop policy/trigger if exists, create or replace, on conflict.

create table if not exists public.candidatos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(btrim(nombre)) > 0),
  dni              text,
  telefono         text,
  rol_cod          text,
  sede_cod         text,
  estado           text not null default 'por_entrevistar'
                   check (estado in ('por_entrevistar','entrevistado','en_prueba','prueba_cerrada','contratado','descartado')),
  entrevista_fecha date,
  entrevista_obs   text,
  prueba_desde     date,
  prueba_hasta     date,
  resultado        text check (resultado in ('bueno','regular','malo')),
  resultado_obs    text,
  empleado_id      uuid unique references public.empleados(id) on delete restrict,
  creado_por       uuid references public.empleados(id) on delete set null,
  creado_en        timestamptz not null default now()
);

alter table public.candidatos enable row level security;
drop policy if exists candidatos_select on public.candidatos;
create policy candidatos_select on public.candidatos for select to authenticated using (private.app_es_admin());

revoke all on public.candidatos from anon, authenticated;
grant select on public.candidatos to authenticated;

drop trigger if exists trg_audit_candidatos on public.candidatos;
create trigger trg_audit_candidatos after insert or update or delete on public.candidatos
  for each row execute function private.audit_log_trigger();

insert into public.config (clave, valor) values
  ('personal_prueba_dias', '3')   -- DEFAULT del Excel («Prueba (3 días)»), editable en /configuracion
on conflict (clave) do nothing;

-- Guard común: admin + candidato existente + transición válida. Devuelve la fila bloqueada.
create or replace function private.candidato_cargar(p_id uuid, p_hacia text)
  returns public.candidatos language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.candidatos;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona candidatos'; end if;
  select * into c from public.candidatos where id = p_id for update;
  if not found then raise exception 'Candidato no encontrado'; end if;
  if not (
    (c.estado = 'por_entrevistar' and p_hacia in ('entrevistado','descartado')) or
    (c.estado = 'entrevistado'    and p_hacia in ('en_prueba','descartado')) or
    (c.estado = 'en_prueba'       and p_hacia in ('prueba_cerrada','descartado')) or
    (c.estado = 'prueba_cerrada'  and p_hacia in ('contratado','entrevistado','descartado')) or
    (c.estado = 'descartado'      and p_hacia = 'por_entrevistar')
  ) then
    raise exception 'No se puede pasar de «%» a «%»: primero entrevista y prueba, en ese orden (transición no válida)', c.estado, p_hacia;
  end if;
  return c;
end;
$$;
revoke all on function private.candidato_cargar(uuid, text) from public, anon, authenticated;

create or replace function public.candidato_crear(p_nombre text, p_dni text, p_telefono text, p_rol text, p_sede text)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona candidatos'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'El candidato necesita un nombre'; end if;
  insert into candidatos (nombre, dni, telefono, rol_cod, sede_cod, creado_por)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_dni, '')), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
            nullif(p_rol, ''), nullif(p_sede, ''), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.candidato_entrevistar(p_id uuid, p_obs text)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'entrevistado');
  update candidatos set estado = 'entrevistado', entrevista_fecha = (now() at time zone 'America/Lima')::date,
         entrevista_obs = nullif(btrim(coalesce(p_obs, '')), '') where id = p_id;
end;
$$;

create or replace function public.candidato_iniciar_prueba(p_id uuid, p_desde date)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_dias int;
begin
  perform private.candidato_cargar(p_id, 'en_prueba');
  if p_desde is null then raise exception 'Indica desde qué día empieza la prueba'; end if;
  select ceil(coalesce(nullif(btrim(valor), '')::numeric, 3))::int into v_dias from config where clave = 'personal_prueba_dias';
  v_dias := greatest(coalesce(v_dias, 3), 1);
  update candidatos set estado = 'en_prueba', prueba_desde = p_desde, prueba_hasta = p_desde + (v_dias - 1),
         resultado = null, resultado_obs = null where id = p_id;
end;
$$;

create or replace function public.candidato_cerrar_prueba(p_id uuid, p_resultado text, p_obs text)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.candidatos;
begin
  c := private.candidato_cargar(p_id, 'prueba_cerrada');
  if p_resultado is null or p_resultado not in ('bueno','regular','malo') then
    raise exception 'El resultado debe ser bueno, regular o malo';
  end if;
  if (now() at time zone 'America/Lima')::date < c.prueba_hasta then
    raise exception 'La prueba termina el %: se cierra desde el día de fin en adelante', to_char(c.prueba_hasta, 'DD/MM/YYYY');
  end if;
  update candidatos set estado = 'prueba_cerrada', resultado = p_resultado,
         resultado_obs = nullif(btrim(coalesce(p_obs, '')), '') where id = p_id;
end;
$$;

create or replace function public.candidato_repetir_prueba(p_id uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'entrevistado');
  update candidatos set estado = 'entrevistado' where id = p_id;
end;
$$;

create or replace function public.candidato_descartar(p_id uuid, p_motivo text)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'descartado');
  update candidatos set estado = 'descartado', resultado_obs = nullif(btrim(coalesce(p_motivo, '')), '') where id = p_id;
end;
$$;

create or replace function public.candidato_reactivar(p_id uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'por_entrevistar');
  update candidatos set estado = 'por_entrevistar' where id = p_id;   -- el rastro queda en la auditoría
end;
$$;

-- Pasar a alta: se llama DESPUÉS de crear al empleado. Un candidato se vincula una sola vez.
create or replace function public.candidato_vincular(p_id uuid, p_empleado uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'contratado');
  if not exists (select 1 from empleados where id = p_empleado) then raise exception 'Persona no encontrada'; end if;
  update candidatos set estado = 'contratado', empleado_id = p_empleado where id = p_id;
end;
$$;

revoke execute on function public.candidato_crear(text, text, text, text, text)  from public, anon;
revoke execute on function public.candidato_entrevistar(uuid, text)             from public, anon;
revoke execute on function public.candidato_iniciar_prueba(uuid, date)          from public, anon;
revoke execute on function public.candidato_cerrar_prueba(uuid, text, text)     from public, anon;
revoke execute on function public.candidato_repetir_prueba(uuid)                from public, anon;
revoke execute on function public.candidato_descartar(uuid, text)               from public, anon;
revoke execute on function public.candidato_reactivar(uuid)                     from public, anon;
revoke execute on function public.candidato_vincular(uuid, uuid)                from public, anon;
grant  execute on function public.candidato_crear(text, text, text, text, text)  to authenticated;
grant  execute on function public.candidato_entrevistar(uuid, text)             to authenticated;
grant  execute on function public.candidato_iniciar_prueba(uuid, date)          to authenticated;
grant  execute on function public.candidato_cerrar_prueba(uuid, text, text)     to authenticated;
grant  execute on function public.candidato_repetir_prueba(uuid)                to authenticated;
grant  execute on function public.candidato_descartar(uuid, text)               to authenticated;
grant  execute on function public.candidato_reactivar(uuid)                     to authenticated;
grant  execute on function public.candidato_vincular(uuid, uuid)                to authenticated;


-- ===== 0135_codigo_todos_los_movimientos.sql =====
-- 0135 — Código personal en todos los movimientos del pipeline + código de movimiento.
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-codigo-en-todos-los-movimientos-design.md
-- Prueba: packages/db/pruebas/0135_codigo_todos_los_movimientos.prueba.sql (escrita antes).
-- Ticket: lucebien-tablero #16. Idempotente: se puede reaplicar.
--
-- 1) pipeline_registrar_prenda, lavanderia_enviar y lavanderia_validar_retorno aceptan el token de
--    operador (0112) y lo resuelven con private.actor_pipeline, igual que pipeline_avanzar.
-- 2) Cada fila nueva de prenda_historial recibe un código de movimiento (trigger).

-- ═══ 1) Esquema ═══════════════════════════════════════════════════════════════════════════════
alter table prenda_historial add column if not exists codigo_mov text;
create unique index if not exists uq_prenda_historial_codigo_mov
  on prenda_historial(codigo_mov) where codigo_mov is not null;
create sequence if not exists prenda_mov_seq;
alter table listas_lavanderia add column if not exists validado_por uuid references empleados(id);

-- DEFAULT INVENTADO (regla 5): el dueño no definió el formato del código de movimiento. Prefijo
-- editable en /configuracion; el resto (AAMMDD hora Perú + correlativo de 5 dígitos) es fijo.
-- Anotado en docs/pendientes-negocio.md.
insert into config (clave, valor) values ('pipeline_mov_prefijo', 'MOV') on conflict (clave) do nothing;

-- ═══ 2) Código de movimiento ══════════════════════════════════════════════════════════════════
-- Fecha: la de la propia fila, en hora Perú (nunca la del reloj del servidor en UTC).
create or replace function private.asignar_codigo_mov()
  returns trigger language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare v_pref text;
begin
  if new.codigo_mov is null then
    select nullif(trim(valor), '') into v_pref from config where clave = 'pipeline_mov_prefijo';
    new.codigo_mov := coalesce(v_pref, 'MOV') || '-'
      || to_char(coalesce(new.fecha, now()) at time zone 'America/Lima', 'YYMMDD') || '-'
      || lpad(nextval('prenda_mov_seq')::text, 5, '0');
  end if;
  return new;
end;
$fn$;
revoke execute on function private.asignar_codigo_mov() from public, anon;

drop trigger if exists trg_prenda_historial_codigo_mov on prenda_historial;
create trigger trg_prenda_historial_codigo_mov before insert on prenda_historial
  for each row execute function private.asignar_codigo_mov();

-- ═══ 3) Las tres acciones con código personal ═════════════════════════════════════════════════
drop function if exists public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid);
create or replace function public.pipeline_registrar_prenda(
  p_codigo text, p_tipo text, p_color text, p_talla text, p_sede text,
  p_tipo_lavado text, p_necesita_compostura boolean, p_obs text,
  p_activo_id uuid default null, p_operador uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  -- Misma condición que la policy pasada_insert.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes registrar prendas de la sede %', p_sede;
  end if;
  v_actor := private.actor_pipeline(p_operador);   -- código personal (0112)
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

  -- El alta también es un movimiento: queda quién la codificó y con qué código de movimiento.
  perform private.prenda_historial_registrar(v_id, null, 'recepcion', v_actor, 'Alta / codificación');
  return v_id;
end;
$$;
revoke execute on function public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid, uuid) from public, anon;
grant  execute on function public.pipeline_registrar_prenda(text, text, text, text, text, text, boolean, text, uuid, uuid) to authenticated;

drop function if exists public.lavanderia_enviar(text, text, text, text, jsonb, jsonb);
create or replace function public.lavanderia_enviar(
  p_sede text, p_tipo text, p_resp_inv text, p_resp_traslado text,
  p_generales jsonb default '{}'::jsonb, p_items jsonb default '[]'::jsonb,
  p_operador uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_id    uuid;
  v_item  jsonb;
  v_pasada uuid;
  v_etapa text;
  v_activo_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  -- Reemplaza al with check de listas_rw, que esta función deja de tener encima al ser definer.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes enviar a lavandería desde la sede %', p_sede;
  end if;
  v_actor := private.actor_pipeline(p_operador);   -- código personal (0112): CODIGO: si falta o venció

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
    ) returning id into v_pasada;

    -- prenda_historial usa empleado_id (uuid, ya migrado del pseudo-FK por nombre TEXT que
    -- describe CLAUDE.md) — v_actor es quien ejecuta el envío, no resp_traslado (nombre libre
    -- sin garantía de tener cuenta en el sistema). El id sale del propio insert: la búsqueda
    -- por (lista, código) de la 0066 elegía UNA prenda cuando el mismo código venía dos veces
    -- en la lista y dejaba a la otra sin historial (arreglo de la 0115).
    perform private.prenda_historial_registrar(v_pasada, null, v_etapa, v_actor,
      'Lista ' || v_id || coalesce(' · traslado: ' || nullif(p_resp_traslado, ''), ''));
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.lavanderia_enviar(text, text, text, text, jsonb, jsonb, uuid) from public, anon;
grant  execute on function public.lavanderia_enviar(text, text, text, text, jsonb, jsonb, uuid) to authenticated;

drop function if exists public.lavanderia_validar_retorno(uuid, jsonb, text);
create or replace function public.lavanderia_validar_retorno(
  p_id uuid, p_items jsonb default '[]'::jsonb, p_obs_retorno text default null,
  p_operador uuid default null
) returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid;
  v_item  jsonb;
  v_hay_problemas boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  v_actor := private.actor_pipeline(p_operador);   -- código personal (0112)
  if not exists (select 1 from listas_lavanderia where id = p_id) then
    raise exception 'Lista % no encontrada', p_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    update lista_items set estado_retorno = v_item->>'estado'
    where id = (v_item->>'id')::uuid and lista_id = p_id;
  end loop;

  select bool_or(coalesce(estado_retorno, 'bien') <> 'bien') into v_hay_problemas
  from lista_items where lista_id = p_id;

  update listas_lavanderia
  set estado = case when coalesce(v_hay_problemas, false) then 'Devuelto-Observado' else 'Validado' end,
      validado_tienda = true,
      validado_por = v_actor,
      obs_retorno = coalesce(p_obs_retorno, obs_retorno)
  where id = p_id;
end;
$$;
revoke execute on function public.lavanderia_validar_retorno(uuid, jsonb, text, uuid) from public, anon;
grant  execute on function public.lavanderia_validar_retorno(uuid, jsonb, text, uuid) to authenticated;


-- ===== 0136_movimientos_periodo_cerrado.sql =====
-- 0136 — Movimientos con fecha en un período cerrado: se pregunta, nunca quedan huérfanos.
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-movimientos-periodo-cerrado-design.md
-- Prueba: packages/db/pruebas/0136_movimientos_periodo_cerrado.prueba.sql (escrita antes).
-- Ticket: lucebien-tablero #29. Decisión del dueño: se pregunta cada vez (siguiente período
-- abierto, o anular el cierre). Idempotente: se puede reaplicar.

-- Fecha con la que el administrador tipeó el movimiento cuando se tuvo que mover al siguiente
-- período. Null = la fila está en la fecha en que se hizo.
alter table sueldo_movimientos add column if not exists fecha_original date;

-- Estado de una fecha para una persona: cerrado | abierto | sin_contrato.
create or replace function private.sueldo_estado_fecha(p_empleado uuid, p_fecha date)
  returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare l record;
begin
  -- SECURITY DEFINER con execute para authenticated (lo llaman RPC invoker): sin esta guarda cualquier
  -- empleado conocería el estado de cierre del sueldo de otro. auth.uid() nulo = servicio/superusuario.
  if auth.uid() is not null and not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador consulta el estado de los períodos de sueldo';
  end if;
  select id, periodo_desde, periodo_hasta into l
    from sueldo_liquidaciones
   where empleado_id = p_empleado and estado = 'cerrada'
     and p_fecha between periodo_desde and periodo_hasta
   limit 1;
  if found then
    return jsonb_build_object('estado', 'cerrado', 'liquidacion_id', l.id,
                              'desde', l.periodo_desde, 'hasta', l.periodo_hasta);
  end if;
  if exists (select 1 from sueldo_acuerdos
              where empleado_id = p_empleado and p_fecha between fecha_inicio and fecha_fin) then
    return jsonb_build_object('estado', 'abierto');
  end if;
  return jsonb_build_object('estado', 'sin_contrato');
end;
$fn$;
revoke execute on function private.sueldo_estado_fecha(uuid, date) from public, anon;
grant  execute on function private.sueldo_estado_fecha(uuid, date) to authenticated;

-- Primera fecha >= p_fecha que está en un período abierto, o null si ya no hay ninguno.
-- Salta los tramos cerrados consecutivos y los huecos entre contratos.
create or replace function private.sueldo_siguiente_abierto(p_empleado uuid, p_fecha date)
  returns date language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare d date := p_fecha; st jsonb; v_ini date; i int;
begin
  for i in 1..400 loop
    st := private.sueldo_estado_fecha(p_empleado, d);
    if st->>'estado' = 'abierto' then return d; end if;
    if st->>'estado' = 'cerrado' then
      d := (st->>'hasta')::date + 1;
    else
      select min(fecha_inicio) into v_ini from sueldo_acuerdos
       where empleado_id = p_empleado and fecha_inicio > d;
      if v_ini is null then return null; end if;
      d := v_ini;
    end if;
  end loop;
  return null;
end;
$fn$;
revoke execute on function private.sueldo_siguiente_abierto(uuid, date) from public, anon;
grant  execute on function private.sueldo_siguiente_abierto(uuid, date) to authenticated;

-- Consulta para la pantalla: estado de la fecha y, si no está abierta, a dónde iría «al siguiente».
create or replace function public.sueldo_movimiento_estado_fecha(p_empleado uuid, p_fecha date)
  returns jsonb language plpgsql stable security invoker set search_path = public
as $fn$
declare st jsonb;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador carga movimientos de sueldo';
  end if;
  st := private.sueldo_estado_fecha(p_empleado, p_fecha);
  if st->>'estado' <> 'abierto' then
    st := st || jsonb_build_object('siguiente', private.sueldo_siguiente_abierto(p_empleado, p_fecha));
  end if;
  return st;
end;
$fn$;
revoke execute on function public.sueldo_movimiento_estado_fecha(uuid, date) from public, anon;
grant  execute on function public.sueldo_movimiento_estado_fecha(uuid, date) to authenticated;

-- Única vía de alta de movimientos. p_decision: null | 'siguiente' | 'anular_cierre'.
create or replace function public.sueldo_movimiento_crear(
  p_empleado uuid, p_fecha date, p_tipo text, p_monto numeric, p_cantidad int, p_motivo text,
  p_decision text default null
) returns uuid language plpgsql volatile security invoker set search_path = public
as $fn$
declare
  st jsonb; v_estado text; v_fecha date := p_fecha; v_orig date := null;
  v_motivo text := trim(coalesce(p_motivo, '')); v_sig date; v_id uuid; v_conteo boolean;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador carga movimientos de sueldo';
  end if;
  if p_decision is not null and p_decision not in ('siguiente', 'anular_cierre') then
    raise exception 'DATO:decisión desconocida "%"', p_decision;
  end if;
  if v_motivo = '' then raise exception 'DATO:el motivo es obligatorio'; end if;

  -- Carrera con el cierre: si hay un borrador que cubre la fecha, esperar a que termine un cierre en
  -- curso (el cierre lo bloquea `for update`) y recién entonces mirar el estado.
  perform 1 from sueldo_liquidaciones
   where empleado_id = p_empleado and estado = 'borrador' and p_fecha between periodo_desde and periodo_hasta
   for share;

  st := private.sueldo_estado_fecha(p_empleado, p_fecha);
  v_estado := st->>'estado';

  if v_estado <> 'abierto' then
    v_sig := private.sueldo_siguiente_abierto(p_empleado, p_fecha);
    if p_decision is null then
      raise exception 'PERIODO:la fecha % % (decide: cargarlo al siguiente período abierto o anular el cierre)',
        to_char(p_fecha, 'DD/MM/YYYY'),
        case v_estado when 'cerrado' then 'está en un período ya cerrado' else 'no tiene contrato' end;
    elsif p_decision = 'siguiente' then
      if v_sig is null then
        raise exception 'PERIODO:no hay un período siguiente abierto: crea el contrato siguiente o anula el cierre; no se guardó nada';
      end if;
      -- Carrera con el cierre del borrador que cubre la fecha destino: esperar a que termine y releer.
      perform 1 from sueldo_liquidaciones
       where empleado_id = p_empleado and estado = 'borrador' and v_sig between periodo_desde and periodo_hasta
       for share;
      if private.sueldo_estado_fecha(p_empleado, v_sig)->>'estado' <> 'abierto' then
        raise exception 'PERIODO:el período siguiente se cerró mientras tanto; vuelve a intentarlo; no se guardó nada';
      end if;
      v_orig := p_fecha;
      v_fecha := v_sig;
      v_motivo := v_motivo || ' (fecha original ' || to_char(p_fecha, 'DD/MM/YYYY')
                  || case v_estado when 'cerrado' then ', período cerrado)' else ', sin contrato)' end;
    else -- anular_cierre
      if v_estado <> 'cerrado' then
        raise exception 'PERIODO:la fecha % no tiene contrato: no hay cierre que anular; no se guardó nada',
          to_char(p_fecha, 'DD/MM/YYYY');
      end if;
      -- Pagos de toda la cadena de correcciones (private.sueldo_pagado_cadena, de la 0137; se resuelve al ejecutar).
      if private.sueldo_pagado_cadena((st->>'liquidacion_id')::uuid) > 0 then
        raise exception 'PERIODO:esa liquidación ya tiene pagos registrados; no se anula el cierre. Corrígela desde Liquidación y pago con «Corregir» (no anules pagos entregados); no se guardó nada';
      end if;
      perform sueldo_liquidacion_anular((st->>'liquidacion_id')::uuid,
        'Anulada para cargar un movimiento con fecha ' || to_char(p_fecha, 'DD/MM/YYYY') || ': ' || v_motivo);
    end if;
  end if;

  v_conteo := p_tipo in ('capacitacion', 'almuerzo_entregado');
  insert into sueldo_movimientos (empleado_id, fecha, fecha_original, tipo, monto, cantidad, motivo, creado_por)
    values (p_empleado, v_fecha, v_orig, p_tipo,
            case when v_conteo then null else p_monto end,
            case when v_conteo then coalesce(p_cantidad, 1) else 1 end,
            v_motivo, auth.uid())
    returning id into v_id;
  return v_id;
end;
$fn$;
revoke execute on function public.sueldo_movimiento_crear(uuid, date, text, numeric, int, text, text) from public, anon;
grant  execute on function public.sueldo_movimiento_crear(uuid, date, text, numeric, int, text, text) to authenticated;

-- Red de seguridad: ningún insert sin sello puede caer en un período cerrado, venga de donde venga.
create or replace function private.sueldo_mov_no_en_cerrado() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if new.liquidacion_id is null
     and private.sueldo_estado_fecha(new.empleado_id, new.fecha)->>'estado' in ('cerrado', 'sin_contrato') then
    raise exception 'PERIODO_CERRADO:la fecha % está en un período cerrado o sin contrato; usa sueldo_movimiento_crear y elige a qué período cargarlo',
      to_char(new.fecha, 'DD/MM/YYYY');
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_sueldo_mov_no_en_cerrado on sueldo_movimientos;
create trigger trg_sueldo_mov_no_en_cerrado before insert or update of fecha, empleado_id on sueldo_movimientos
  for each row execute function private.sueldo_mov_no_en_cerrado();


-- ===== 0137_corregir_con_abonos.sql =====
-- 0137 — Corregir una liquidación que ya tiene abonos: lo pagado se descuenta solo.
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-corregir-con-abonos-design.md
-- Prueba: packages/db/pruebas/0137_corregir_con_abonos.prueba.sql (escrita antes).
-- Ticket: lucebien-tablero #30. Decisión del dueño: lo ya entregado se descuenta automáticamente de
-- la liquidación corregida y queda el saldo; no se obliga a anular pagos reales. Idempotente.

-- La corregida apunta a la liquidación (anulada) que reemplaza. Los pagos no se mueven.
alter table sueldo_liquidaciones add column if not exists corrige_a uuid references sueldo_liquidaciones(id);
create index if not exists idx_sueldo_liq_corrige_a on sueldo_liquidaciones(corrige_a) where corrige_a is not null;
-- Una liquidación anulada la corrige a lo sumo una (respaldo del trigger, que también lo comprueba).
create unique index if not exists uq_sueldo_liq_corrige_a on sueldo_liquidaciones(corrige_a) where corrige_a is not null;

-- Lo pagado (abonos no anulados) de una liquidación y de toda la cadena de liquidaciones que corrige.
-- `union` (no `union all`) corta cualquier ciclo.
create or replace function private.sueldo_pagado_cadena(p_liq uuid)
  returns numeric language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare v numeric;
begin
  -- SECURITY DEFINER con execute para authenticated (lo llaman RPC invoker): sin esta guarda cualquier
  -- empleado conocería lo pagado en la liquidación de otro. auth.uid() nulo = servicio/superusuario.
  if auth.uid() is not null and not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador consulta los pagos de una liquidación por esta vía';
  end if;
  with recursive cadena(id) as (
    select p_liq
    union
    select l.corrige_a from sueldo_liquidaciones l join cadena c on l.id = c.id where l.corrige_a is not null
  )
  select coalesce(sum(p.monto), 0) into v
    from sueldo_liquidacion_pagos p join cadena c on p.liquidacion_id = c.id
   where not p.anulado;
  return v;
end;
$fn$;
revoke execute on function private.sueldo_pagado_cadena(uuid) from public, anon;
grant  execute on function private.sueldo_pagado_cadena(uuid) to authenticated;

-- Vínculo automático: una liquidación nueva se enlaza con una anulada del mismo contrato y
-- EXACTAMENTE el mismo período que tenga abonos vigentes en su cadena y sea la punta de la cadena (nadie la corrige todavía). Así los
-- abonos no quedan huérfanos aunque el borrador se cree en un segundo intento.
create or replace function private.sueldo_liq_enlazar_correccion() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare t record;
begin
  if TG_OP = 'INSERT' and new.corrige_a is null then
    select l.id into new.corrige_a
      from sueldo_liquidaciones l
     where l.acuerdo_id = new.acuerdo_id and l.empleado_id = new.empleado_id
       and l.periodo_desde = new.periodo_desde and l.periodo_hasta = new.periodo_hasta
       and l.estado = 'anulada'
       and private.sueldo_pagado_cadena(l.id) > 0
       and not exists (select 1 from sueldo_liquidaciones s where s.corrige_a = l.id)
     order by l.anulada_en desc nulls last
     limit 1;
    -- Sin coincidencia exacta pero con una anulada que se solapa, con abonos y sin corrector: crearla
    -- sin enlace dejaría esos abonos huérfanos y permitiría pagar dos veces lo mismo.
    if new.corrige_a is null and new.estado <> 'anulada' and exists (
         select 1 from sueldo_liquidaciones l
          where l.empleado_id = new.empleado_id and l.estado = 'anulada'
            and l.periodo_desde <= new.periodo_hasta and l.periodo_hasta >= new.periodo_desde
            and private.sueldo_pagado_cadena(l.id) > 0
            and not exists (select 1 from sueldo_liquidaciones s where s.corrige_a = l.id)) then
      raise exception 'PERIODO:hay una liquidación anulada que se solapa con este período y ya tiene pagos; corrígela con el mismo contrato y período, o anula antes esos pagos con su motivo';
    end if;
  end if;

  -- Un vínculo ya hecho no se suelta ni se cambia: soltarlo dejaría los abonos huérfanos y se podría
  -- pagar dos veces el mismo período.
  if TG_OP = 'UPDATE' and old.corrige_a is not null and new.corrige_a is distinct from old.corrige_a then
    raise exception 'CONGELADA:el vínculo con la liquidación corregida no se puede cambiar ni quitar';
  end if;

  if new.corrige_a is not null and (TG_OP = 'INSERT' or new.corrige_a is distinct from old.corrige_a) then
    select id, empleado_id, acuerdo_id, estado into t from sueldo_liquidaciones where id = new.corrige_a;
    if not found or new.corrige_a = new.id or t.estado <> 'anulada'
       or t.empleado_id <> new.empleado_id or t.acuerdo_id <> new.acuerdo_id
       or exists (select 1 from sueldo_liquidaciones s where s.corrige_a = new.corrige_a and s.id <> new.id) then
      raise exception 'DATO:una liquidación sólo puede corregir a una anulada del mismo empleado y contrato que nadie corrija ya';
    end if;
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_sueldo_liq_enlazar_correccion on sueldo_liquidaciones;
create trigger trg_sueldo_liq_enlazar_correccion before insert or update of corrige_a on sueldo_liquidaciones
  for each row execute function private.sueldo_liq_enlazar_correccion();

-- La anulación común sigue bloqueada con abonos; sólo la RPC de corrección (que fija la variable
-- local de la transacción con el id de la liquidación) la deja pasar.
create or replace function private.sueldo_liq_pagos_bloquean_anular() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_n    int;
  v_suma numeric;
begin
  if new.estado = 'anulada' and old.estado <> 'anulada'
     and coalesce(current_setting('scilb.corrigiendo', true), '') <> new.id::text then
    select count(*), coalesce(sum(monto), 0) into v_n, v_suma
    from sueldo_liquidacion_pagos
    where liquidacion_id = new.id and not anulado;

    if v_n > 0 then
      raise exception 'ESTADO:esta liquidación tiene % pago(s) vigente(s) por S/%; anulalos con motivo antes de anularla',
        v_n, v_suma;
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_sueldo_liq_pagos_vigentes on sueldo_liquidaciones;
create trigger trg_sueldo_liq_pagos_vigentes before update on sueldo_liquidaciones
  for each row execute function private.sueldo_liq_pagos_bloquean_anular();

-- El anti-sobrepago de la base cuenta la cadena de correcciones.
create or replace function private.sueldo_pago_inmutable() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_estado  text;
  v_total   numeric;
  v_pagado  numeric;
begin
  if TG_OP = 'DELETE' then
    raise exception 'CONGELADA:un pago de liquidación no se borra; se anula con motivo, el rastro tiene que quedar';
  end if;

  if TG_OP = 'INSERT' then
    -- `registrado_por` no lleva `not null` en la columna (así puede quedar en null si el empleado
    -- que lo cargó se borra después — on delete set null), pero AL NACER un pago siempre tiene
    -- que traer quién lo registró. Sin este guard, un insert directo por SQL crudo deja un pago
    -- sin autor desde el origen, no sólo después de un borrado.
    if new.registrado_por is null then
      raise exception 'DATO:un pago tiene que quedar con quién lo registró';
    end if;

    select l.estado, l.total into v_estado, v_total
    from sueldo_liquidaciones l where l.id = new.liquidacion_id for update;

    if v_estado is distinct from 'cerrada' then
      raise exception 'ESTADO:sólo se paga una liquidación cerrada (está %)', coalesce(v_estado, 'inexistente');
    end if;

    -- Anti-sobrepago acá también. Un pago que nace ya anulado (caso raro, pero la tabla lo
    -- permite) no cuenta contra el saldo: no se le está pidiendo plata a nadie con esa fila.
    -- 'NaN' cae solo: por cómo Postgres ordena numeric, NaN es "mayor" que cualquier total, así
    -- que la comparación de abajo lo rechaza igual (y el check de la tabla lo cierra aparte).
    if not new.anulado then
      -- Cuenta también lo pagado en las liquidaciones que ésta corrige (0137).
      v_pagado := private.sueldo_pagado_cadena(new.liquidacion_id);

      if v_pagado + new.monto > v_total then
        raise exception 'SALDO:este abono deja % pagado contra un total de %; supera lo que falta cobrar',
          (v_pagado + new.monto), v_total;
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: única transición permitida es anular (false → true), con motivo y autor, sin tocar
  -- ninguna otra columna. La comparación va por jsonb, como private.sueldo_liq_inmutable() de la
  -- 0072: así cualquier columna que se agregue después queda protegida sola.
  if old.anulado = false
     and new.anulado = true
     and coalesce(length(trim(new.anulado_motivo)), 0) > 0
     and new.anulado_por is not null
     and new.anulado_en is not null
     and (to_jsonb(new) - 'anulado' - 'anulado_motivo' - 'anulado_por' - 'anulado_en')
       = (to_jsonb(old) - 'anulado' - 'anulado_motivo' - 'anulado_por' - 'anulado_en')
  then
    return new;
  end if;

  raise exception 'CONGELADA:un pago no se modifica; la única transición permitida es anularlo una vez, con motivo y autor';
end;
$$;
-- sueldo_liquidacion_pagar: mismo cuerpo que la 0080, pero el pagado es el de la cadena.
create or replace function sueldo_liquidacion_pagar(
  p_liquidacion_id uuid,
  p_fecha          date,
  p_monto          numeric,
  p_metodo         text,
  p_nota           text default null
) returns uuid language plpgsql volatile security invoker set search_path = public as $fn$
declare
  l        record;
  v_pagado numeric;
  v_id     uuid;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador registra pagos de liquidación';
  end if;
  p_monto := round(p_monto, 2);
  if p_fecha is null then raise exception 'DATO:hace falta la fecha del pago'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'DATO:el monto tiene que ser mayor a cero'; end if;
  if coalesce(length(trim(coalesce(p_metodo, ''))), 0) = 0 then
    raise exception 'DATO:hace falta el método de pago';
  end if;

  select * into l from sueldo_liquidaciones where id = p_liquidacion_id for update;
  if not found then raise exception 'DATO:la liquidación no existe o no es visible'; end if;
  if l.estado <> 'cerrada' then
    raise exception 'ESTADO:esta liquidación está %; sólo se paga una cerrada', l.estado;
  end if;

  v_pagado := private.sueldo_pagado_cadena(p_liquidacion_id);
  if v_pagado + p_monto > l.total then
    raise exception 'SALDO:este abono deja % pagado contra un total de %; supera lo que falta cobrar',
      (v_pagado + p_monto), l.total;
  end if;

  insert into sueldo_liquidacion_pagos (liquidacion_id, fecha, monto, metodo, nota, registrado_por)
  values (p_liquidacion_id, p_fecha, p_monto, trim(p_metodo), nullif(trim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke execute on function sueldo_liquidacion_pagar(uuid, date, numeric, text, text) from public, anon;
grant  execute on function sueldo_liquidacion_pagar(uuid, date, numeric, text, text) to authenticated;

-- Corregir: anula aunque haya abonos vigentes (que quedan intactos y pasan a la corregida).
create or replace function sueldo_liquidacion_corregir_anular(p_liquidacion uuid, p_motivo text)
  returns jsonb language plpgsql volatile security invoker set search_path = public as $fn$
declare v_pagado numeric; r jsonb;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador corrige una liquidación';
  end if;
  v_pagado := private.sueldo_pagado_cadena(p_liquidacion);
  perform set_config('scilb.corrigiendo', p_liquidacion::text, true);
  r := sueldo_liquidacion_anular(p_liquidacion, p_motivo);
  perform set_config('scilb.corrigiendo', '', true);
  return r || jsonb_build_object('yaPagado', v_pagado);
end;
$fn$;
revoke execute on function sueldo_liquidacion_corregir_anular(uuid, text) from public, anon;
grant  execute on function sueldo_liquidacion_corregir_anular(uuid, text) to authenticated;

-- Abonos de la cadena de cada liquidación pedida (incluidos los de las anuladas que reemplaza).
create or replace function sueldo_pagos_de_cadena(p_ids uuid[])
  returns table (consulta_id uuid, id uuid, liquidacion_id uuid, fecha date, monto numeric, metodo text,
                 nota text, registrado_por uuid, anulado boolean, anulado_motivo text,
                 anulado_en timestamptz, creado_en timestamptz)
  language sql stable security invoker set search_path = public
as $fn$
  with recursive cadena(raiz, id) as (
    select x, x from unnest(p_ids) x
    union
    select c.raiz, l.corrige_a from sueldo_liquidaciones l join cadena c on l.id = c.id where l.corrige_a is not null
  )
  select c.raiz, p.id, p.liquidacion_id, p.fecha, p.monto, p.metodo, p.nota, p.registrado_por,
         p.anulado, p.anulado_motivo, p.anulado_en, p.creado_en
    from cadena c join sueldo_liquidacion_pagos p on p.liquidacion_id = c.id
   order by p.fecha desc, p.creado_en desc;
$fn$;
revoke execute on function sueldo_pagos_de_cadena(uuid[]) from public, anon;
grant  execute on function sueldo_pagos_de_cadena(uuid[]) to authenticated;


-- ===== 0138_examenes.sql =====
-- 0138_examenes.sql — exámenes de software, escritos online y presencial de habilidades.
-- Spec: docs/superpowers/specs/capacitacion/2026-10-17-examenes-design.md
-- Prueba: packages/db/pruebas/0138_examenes.prueba.sql (escrita antes). ZONA CRÍTICA: alimenta la nota → pago.
-- Ticket: lucebien-tablero #12.
--
-- NO cambia la RPC de la evaluación (0132). Cada calificación inserta una fila «Examen integral» en
-- capacitacion_examenes con la nota consolidada; esa fila es la vigente (la última por fecha y
-- created_at) y la leen igual el cierre de la capacitación (0131) y la evaluación.
-- Aislamiento: el banco (con la respuesta correcta) solo lo lee el administrador; intentos y notas
-- presenciales hereden la visibilidad de la capacitación. Toda escritura es por RPC definer.
-- Defaults inventados (anotados en docs/pendientes-negocio.md): ver sección 3.
-- Idempotente: create ... if not exists, drop policy if exists, create or replace, on conflict.

-- ── 1) Tablas ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.examen_preguntas (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('software', 'escrito')),
  tema       text not null default '',
  enunciado  text not null check (length(btrim(enunciado)) > 0),
  opciones   jsonb not null check (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) between 2 and 6),
  correcta   int  not null check (correcta >= 0),
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  check (correcta < jsonb_array_length(opciones))
);

create table if not exists public.examen_intentos (
  id              uuid primary key default gen_random_uuid(),
  capacitacion_id uuid not null references public.capacitaciones(id) on delete cascade,
  tipo            text not null check (tipo in ('software', 'escrito')),
  preguntas       jsonb not null,                       -- ids (texto) de las preguntas sorteadas, en orden
  respuestas      jsonb,
  nota            numeric(4,2) check (nota is null or (nota >= 0 and nota <= 20)),
  estado          text not null default 'en_curso' check (estado in ('en_curso', 'calificado')),
  creado_en       timestamptz not null default now(),
  calificado_en   timestamptz
);
create index if not exists examen_intentos_cap on public.examen_intentos (capacitacion_id, tipo);

create table if not exists public.examen_habilidades (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  orden  int  not null default 0,
  activo boolean not null default true
);

create table if not exists public.examen_presencial_notas (
  capacitacion_id uuid not null references public.capacitaciones(id) on delete cascade,
  habilidad_id    uuid not null references public.examen_habilidades(id),
  nota            numeric(4,2) not null check (nota >= 0 and nota <= 20),
  evaluador_id    uuid references public.empleados(id),
  fecha           timestamptz not null default now(),
  primary key (capacitacion_id, habilidad_id)
);

-- ── 2) RLS: lectura acotada, escritura solo por RPC ─────────────────────────────────────────
alter table public.examen_preguntas        enable row level security;
alter table public.examen_intentos         enable row level security;
alter table public.examen_habilidades      enable row level security;
alter table public.examen_presencial_notas enable row level security;

-- El banco trae la clave: solo el administrador lo lee.
drop policy if exists examen_preguntas_select on public.examen_preguntas;
create policy examen_preguntas_select on public.examen_preguntas for select to authenticated
  using (private.app_es_admin());
drop policy if exists examen_habilidades_select on public.examen_habilidades;
create policy examen_habilidades_select on public.examen_habilidades for select to authenticated
  using (auth.uid() is not null);   -- catálogo sin datos de personas
-- Intentos y notas heredan la visibilidad de la capacitación (el subselect ya pasa por cap_select).
drop policy if exists examen_intentos_select on public.examen_intentos;
create policy examen_intentos_select on public.examen_intentos for select to authenticated
  using (exists (select 1 from public.capacitaciones c where c.id = capacitacion_id));
drop policy if exists examen_presencial_select on public.examen_presencial_notas;
create policy examen_presencial_select on public.examen_presencial_notas for select to authenticated
  using (exists (select 1 from public.capacitaciones c where c.id = capacitacion_id));

revoke all on public.examen_preguntas, public.examen_intentos, public.examen_habilidades,
              public.examen_presencial_notas from anon, authenticated;
grant select on public.examen_preguntas, public.examen_intentos, public.examen_habilidades,
                public.examen_presencial_notas to authenticated;

-- ── 3) Defaults (PROVISIONALES, no confirmados por el dueño; editables en /configuracion) ───
insert into public.config (clave, valor) values
  ('examen_preguntas_por_intento', '10'),   -- PROVISIONAL: cuántas preguntas se sortean por intento
  ('examen_intentos_max',          '3'),    -- PROVISIONAL: intentos por tipo y capacitación
  ('examen_peso_software',         '1'),    -- PROVISIONAL: pesos iguales = promedio simple
  ('examen_peso_escrito',          '1'),
  ('examen_peso_presencial',       '1'),
  ('examen_peso_manual',           '1')     -- PROVISIONAL: peso del último examen que carga el capacitador a mano
on conflict (clave) do nothing;

-- Habilidades iniciales: las dos que nombró el cliente; el administrador agrega el resto.
insert into public.examen_habilidades (nombre, orden)
select v.nombre, v.orden from (values ('Planchado', 1), ('Costura', 2)) as v(nombre, orden)
where not exists (select 1 from public.examen_habilidades);

-- ── 4) Funciones privadas ──────────────────────────────────────────────────────────────────
-- Parámetro numérico de config tolerando basura: si falta o no es número, el default.
create or replace function private.examen_param(p_clave text, p_defecto numeric)
  returns numeric language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select case when valor ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then btrim(valor)::numeric end
                     from public.config where clave = p_clave), p_defecto);
$$;
revoke all on function private.examen_param(text, numeric) from public, anon, authenticated;

-- Solo la persona nueva, sobre su capacitación en curso.
create or replace function private.examen_exigir_nuevo(p_cap uuid)
  returns public.capacitaciones language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare c public.capacitaciones;
begin
  select * into c from public.capacitaciones where id = p_cap;
  if not found or c.nuevo_id <> auth.uid()
     or not exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo) then
    raise exception 'Capacitación no encontrada';
  end if;
  if c.estado <> 'en_curso' then
    raise exception 'Esta capacitación ya está %', case c.estado when 'completada' then 'cerrada' else 'cancelada' end;
  end if;
  return c;
end;
$$;
revoke all on function private.examen_exigir_nuevo(uuid) from public, anon, authenticated;

-- Nota consolidada: promedio ponderado de lo que haya entre software, escrito y presencial (último valor
-- de cada tipo). Inserta una fila nueva en capacitacion_examenes, que pasa a ser la vigente.
create or replace function private.examen_consolidar(p_cap uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sw numeric; v_es numeric; v_pr numeric; v_ma numeric; v_tot int; v_hechas int; v_otros int := 0;
  w_sw numeric := private.examen_param('examen_peso_software', 1);
  w_es numeric := private.examen_param('examen_peso_escrito', 1);
  w_pr numeric := private.examen_param('examen_peso_presencial', 1);
  w_ma numeric := private.examen_param('examen_peso_manual', 1);
  v_suma numeric := 0; v_pesos numeric := 0;
begin
  select nota into v_sw from examen_intentos where capacitacion_id = p_cap and tipo = 'software' and estado = 'calificado'
    order by calificado_en desc, creado_en desc limit 1;
  select nota into v_es from examen_intentos where capacitacion_id = p_cap and tipo = 'escrito' and estado = 'calificado'
    order by calificado_en desc, creado_en desc limit 1;
  select count(*) into v_tot from examen_habilidades where activo;
  select count(*), avg(n.nota) into v_hechas, v_pr
    from examen_presencial_notas n join examen_habilidades h on h.id = n.habilidad_id and h.activo
   where n.capacitacion_id = p_cap;
  if v_tot = 0 or v_hechas < v_tot then v_pr := null; end if;   -- el presencial cuenta con todas las habilidades

  -- Último examen cargado a mano por el capacitador: entra en el promedio para que un examen online
  -- alto no pueda taparlo (la nota vigente es la última fila, y la integral lo sería).
  select nota into v_ma from capacitacion_examenes where capacitacion_id = p_cap and nombre <> 'Examen integral'
    order by fecha desc, created_at desc limit 1;
  v_otros := (v_sw is not null)::int + (v_es is not null)::int + (v_pr is not null)::int;

  if v_sw is not null then v_suma := v_suma + w_sw * v_sw; v_pesos := v_pesos + w_sw; end if;
  if v_es is not null then v_suma := v_suma + w_es * v_es; v_pesos := v_pesos + w_es; end if;
  if v_pr is not null then v_suma := v_suma + w_pr * v_pr; v_pesos := v_pesos + w_pr; end if;
  if v_ma is not null then v_suma := v_suma + w_ma * v_ma; v_pesos := v_pesos + w_ma; end if;
  -- Solo un examen manual y nada online/presencial: ese examen ya es el vigente, no hay nada que consolidar.
  if v_pesos <= 0 or v_otros = 0 then return; end if;

  -- created_at con clock_timestamp(): dos calificaciones en una misma transacción no pueden empatar,
  -- porque la nota vigente es la última por (fecha, created_at).
  insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha, registrado_por, created_at)
    values (p_cap, 'Examen integral', round(v_suma / v_pesos, 2), (now() at time zone 'America/Lima')::date,
            auth.uid(), clock_timestamp());
end;
$$;
revoke all on function private.examen_consolidar(uuid) from public, anon, authenticated;

-- ── 5) RPC ──
-- capacitacion_examen (0131) ahora también consolida: el examen manual entra en la nota integral.
create or replace function public.capacitacion_examen(p_cap uuid, p_nombre text, p_nota numeric)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform private.capacitacion_exigir_califica(p_cap);
  if p_nota is null or p_nota < 0 or p_nota > 20 then raise exception 'La nota debe estar entre 0 y 20'; end if;
  insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha, registrado_por, created_at)
    values (p_cap, coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), 'Examen'), p_nota,
            (now() at time zone 'America/Lima')::date, auth.uid(), clock_timestamp())
    returning id into v_id;
  perform private.examen_consolidar(p_cap);
  return v_id;
end;
$$;
-- ──────────────────────────────────────────────────────────────
create or replace function public.examen_pregunta_guardar(
  p_id uuid, p_tipo text, p_tema text, p_enunciado text, p_opciones jsonb, p_correcta int, p_activa boolean)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador edita el banco de preguntas'; end if;
  if p_tipo not in ('software', 'escrito') then raise exception 'El tipo debe ser software o escrito'; end if;
  if p_enunciado is null or length(btrim(p_enunciado)) = 0 then raise exception 'La pregunta necesita un enunciado'; end if;
  if p_opciones is null or jsonb_typeof(p_opciones) <> 'array' or jsonb_array_length(p_opciones) not between 2 and 6 then
    raise exception 'Una pregunta lleva entre 2 y 6 opciones';
  end if;
  if p_correcta is null or p_correcta < 0 or p_correcta >= jsonb_array_length(p_opciones) then
    raise exception 'La opción correcta no existe';
  end if;
  if p_id is null then
    insert into examen_preguntas (tipo, tema, enunciado, opciones, correcta, activa)
      values (p_tipo, coalesce(btrim(p_tema), ''), btrim(p_enunciado), p_opciones, p_correcta, coalesce(p_activa, true))
      returning id into v_id;
  else
    update examen_preguntas set tipo = p_tipo, tema = coalesce(btrim(p_tema), ''), enunciado = btrim(p_enunciado),
           opciones = p_opciones, correcta = p_correcta, activa = coalesce(p_activa, activa)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Pregunta no encontrada'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.examen_habilidad_guardar(p_id uuid, p_nombre text, p_orden int, p_activo boolean)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador edita las habilidades'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'La habilidad necesita un nombre'; end if;
  if p_id is null then
    insert into examen_habilidades (nombre, orden, activo)
      values (btrim(p_nombre), coalesce(p_orden, 0), coalesce(p_activo, true)) returning id into v_id;
  else
    update examen_habilidades set nombre = btrim(p_nombre), orden = coalesce(p_orden, orden),
           activo = coalesce(p_activo, activo) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Habilidad no encontrada'; end if;
  end if;
  return v_id;
end;
$$;

-- Empieza (o retoma) un examen online. Devuelve las preguntas SIN la respuesta correcta.
create or replace function public.examen_iniciar(p_cap uuid, p_tipo text)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c public.capacitaciones; it public.examen_intentos; v_max int; v_n int; v_ids text[]; v_por int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  c := private.examen_exigir_nuevo(p_cap);
  if p_tipo not in ('software', 'escrito') then raise exception 'El tipo debe ser software o escrito'; end if;

  select * into it from examen_intentos where capacitacion_id = p_cap and tipo = p_tipo and estado = 'en_curso'
    order by creado_en desc limit 1;
  if not found then
    v_max := greatest(floor(private.examen_param('examen_intentos_max', 3))::int, 1);
    select count(*) into v_n from examen_intentos where capacitacion_id = p_cap and tipo = p_tipo;
    if v_n >= v_max then
      raise exception 'Ya usaste los % intentos de este examen', v_max;
    end if;
    v_por := greatest(floor(private.examen_param('examen_preguntas_por_intento', 10))::int, 1);
    select coalesce(array_agg(id::text), '{}') into v_ids from (
      select id from examen_preguntas where tipo = p_tipo and activa order by random() limit v_por) s;
    if coalesce(array_length(v_ids, 1), 0) = 0 then
      raise exception 'Todavía no hay preguntas para este examen';
    end if;
    insert into examen_intentos (capacitacion_id, tipo, preguntas, creado_en)
      values (p_cap, p_tipo, to_jsonb(v_ids), clock_timestamp()) returning * into it;
  end if;

  return jsonb_build_object(
    'intento_id', it.id, 'tipo', it.tipo,
    'preguntas', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'enunciado', p.enunciado, 'opciones', p.opciones)
                                            order by t.ord), '[]'::jsonb)
                    from jsonb_array_elements_text(it.preguntas) with ordinality t(pid, ord)
                    join examen_preguntas p on p.id = t.pid::uuid));
end;
$$;

-- Califica en la base. Devuelve nota y aciertos; no revela cuáles fallaron ni la clave.
create or replace function public.examen_responder(p_intento uuid, p_respuestas jsonb)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  it public.examen_intentos; c public.capacitaciones; v_total int; v_ok int; v_nota numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into it from examen_intentos where id = p_intento for update;
  if not found then raise exception 'Intento no encontrado'; end if;
  c := private.examen_exigir_nuevo(it.capacitacion_id);
  if it.estado <> 'en_curso' then raise exception 'Este intento ya fue calificado'; end if;
  if p_respuestas is null or jsonb_typeof(p_respuestas) <> 'object' then raise exception 'Faltan las respuestas'; end if;

  select count(*), count(*) filter (where (p_respuestas ->> p.id::text) ~ '^[0-9]+$'
                                      and (p_respuestas ->> p.id::text)::int = p.correcta)
    into v_total, v_ok
    from jsonb_array_elements_text(it.preguntas) t(pid) join examen_preguntas p on p.id = t.pid::uuid;
  v_nota := case when v_total = 0 then 0 else round(20.0 * v_ok / v_total, 2) end;

  update examen_intentos set respuestas = p_respuestas, nota = v_nota, estado = 'calificado', calificado_en = clock_timestamp()
   where id = p_intento;
  perform private.examen_consolidar(it.capacitacion_id);
  return jsonb_build_object('nota', v_nota, 'aciertos', v_ok, 'total', v_total);
end;
$$;

-- Presencial: el capacitador (o el administrador, nunca la persona evaluada) pone nota a cada habilidad.
create or replace function public.examen_presencial_calificar(p_cap uuid, p_notas jsonb)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.capacitaciones; x jsonb; v_h uuid; v_nota numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  c := private.capacitacion_exigir_califica(p_cap);
  if p_notas is null or jsonb_typeof(p_notas) <> 'array' or jsonb_array_length(p_notas) = 0 then
    raise exception 'Faltan las notas';
  end if;
  for x in select * from jsonb_array_elements(p_notas) loop
    v_h := (x ->> 'habilidad')::uuid;
    v_nota := (x ->> 'nota')::numeric;
    if v_nota is null or v_nota < 0 or v_nota > 20 then raise exception 'La nota debe estar entre 0 y 20'; end if;
    if not exists (select 1 from examen_habilidades where id = v_h and activo) then
      raise exception 'Habilidad no encontrada';
    end if;
    insert into examen_presencial_notas (capacitacion_id, habilidad_id, nota, evaluador_id)
      values (p_cap, v_h, v_nota, auth.uid())
      on conflict (capacitacion_id, habilidad_id)
      do update set nota = excluded.nota, evaluador_id = excluded.evaluador_id, fecha = now();
  end loop;
  perform private.examen_consolidar(p_cap);
end;
$$;

revoke execute on function public.examen_pregunta_guardar(uuid, text, text, text, jsonb, int, boolean) from public, anon;
revoke execute on function public.examen_habilidad_guardar(uuid, text, int, boolean)                    from public, anon;
revoke execute on function public.examen_iniciar(uuid, text)                                           from public, anon;
revoke execute on function public.examen_responder(uuid, jsonb)                                        from public, anon;
revoke execute on function public.examen_presencial_calificar(uuid, jsonb)                             from public, anon;
grant  execute on function public.examen_pregunta_guardar(uuid, text, text, text, jsonb, int, boolean) to authenticated;
grant  execute on function public.examen_habilidad_guardar(uuid, text, int, boolean)                    to authenticated;
grant  execute on function public.examen_iniciar(uuid, text)                                           to authenticated;
grant  execute on function public.examen_responder(uuid, jsonb)                                        to authenticated;
grant  execute on function public.examen_presencial_calificar(uuid, jsonb)                             to authenticated;

commit;
