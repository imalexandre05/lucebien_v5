-- 0056_solicitudes.sql — Fase 11 del plan de perfeccionamiento: Solicitudes (tienda → almacén).
-- Módulo COMPLETO del sistema viejo que no existía en el ERP nuevo. Fuente: routes/solicitudes.js
-- (120 líneas) + public/js/solicitudes.js ("Solicitudes v8", el catálogo vigente — hay un catálogo
-- v3 muerto más arriba en el mismo archivo que NUNCA se usa en el render, no se porta).
-- Idempotente: create table if not exists, add column if not exists, create or replace en
-- funciones, on conflict do nothing en seeds.
--
-- ⚠️ No se pudo aplicar en este entorno: no hay SUPABASE_DB_URL en apps/erp-web/.env.local y no
-- hay MCP de Supabase disponible en esta sesión. Queda escrita y verificada por lectura contra el
-- resto del schema (FKs, RLS, funciones private.* — todas ya viven en la base según 0037/0045/
-- 0055); aplíquese en orden 0050→0051→0052→0053→0054→0055→0056 cuando haya acceso. El código de
-- la app (lib/solicitudes-repo.ts) degrada con elegancia si esta migración no está aplicada
-- todavía (ver esTablaInexistente ahí) — la pantalla /solicitudes avisa en vez de dar 500.
--
-- Pseudo-FK resueltas (CLAUDE.md): `solicitudes.solicitante` / `aprobado_por` / `entregado_por` /
-- `confirmado_por` / `rechazado_por` eran TEXT (nombre) en el sistema viejo → ahora
-- `empleado_id uuid references empleados(id)`. Excepción deliberada: `recibe_en_tienda` queda TEXT
-- libre (NO FK) — el viejo permitía anotar a alguien que recibe en tienda sin que sea
-- necesariamente un empleado del sistema (botón "+ Otro" en seAddOtro(), public/js/
-- solicitudes.js:373-386, para un familiar/cadete que recoge el pedido); forzarlo a `empleados`
-- rompería ese caso real de uso sin que el plan haya pedido cerrarlo.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) SOLICITUDES + SOLICITUD_ITEMS
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists solicitudes (
  id                          uuid primary key default gen_random_uuid(),
  sede_cod                    text not null references sedes(cod),
  solicitante_id              uuid not null references empleados(id),
  urgencia                    text not null default 'media' check (urgencia in ('alta', 'media', 'baja')),
  estado                      text not null default 'pendiente'
                                 check (estado in ('pendiente', 'aprobada', 'rechazada', 'entregada', 'confirmada')),
  obs                         text not null default '',
  obs_respuesta               text not null default '',
  aprobado_por_id             uuid references empleados(id),
  fecha_respuesta             timestamptz,
  entregado_por_id            uuid references empleados(id),
  fecha_entrega               timestamptz,
  recibe_en_tienda            text,                 -- NO es FK — ver comentario de cabecera
  codigos_prenda              jsonb,                -- { "<solicitud_item.id>": ["TN-042", ...] }
  confirmado                  boolean not null default false,
  confirmado_por_id           uuid references empleados(id),
  fecha_confirmacion          timestamptz,
  rechazado_por_id            uuid references empleados(id),
  motivo_rechazo              text,
  pedido_impreso               boolean not null default false,
  fecha_pedido_impreso         timestamptz,
  confirmacion_impresa        boolean not null default false,
  fecha_confirmacion_impresa  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists idx_solicitudes_sede_estado    on solicitudes(sede_cod, estado);
create index if not exists idx_solicitudes_estado_urgencia on solicitudes(estado, urgencia);

create table if not exists solicitud_items (
  id                 uuid primary key default gen_random_uuid(),
  solicitud_id       uuid not null references solicitudes(id) on delete cascade,
  categoria          text not null default 'prenda' check (categoria in ('prenda', 'articulo')),
  tipo               text not null,
  cantidad           integer not null default 1 check (cantidad > 0),
  color              text,
  talla              text,
  tela               text,
  modelo             text,
  detalle            text,
  obs                text,
  cantidad_enviada   integer not null default 0 check (cantidad_enviada >= 0),
  cantidad_recibida  integer not null default 0 check (cantidad_recibida >= 0),
  obs_recepcion      text,
  estado_item        text not null default 'pendiente'
                        check (estado_item in ('pendiente', 'aprobado', 'sin_stock')),
  created_at         timestamptz not null default now()
);
create index if not exists idx_solicitud_items_solicitud on solicitud_items(solicitud_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) RLS — mismo patrón que pipeline (0006) / incidencias (0024): admin, "almacén" (rol
--    encargado_almacen o confeccionista, ambos operan el flujo central) o la sede propia. La
--    AUTORIDAD fina de quién puede aprobar/entregar/rechazar/confirmar/deshacer vive en las RPC
--    de abajo (mismo modelo que pipeline_avanzar/pipeline_dividir: la RLS aísla por sede, la RPC
--    decide el rol) — no en la RLS, que solo aísla por sede como el resto del proyecto.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table solicitudes    enable row level security;
alter table solicitud_items enable row level security;

drop policy if exists solicitudes_rw on solicitudes;
create policy solicitudes_rw on solicitudes for all
  using      (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()))
  with check (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()));

drop policy if exists solicitud_items_rw on solicitud_items;
create policy solicitud_items_rw on solicitud_items for all
  using (exists (
    select 1 from solicitudes s where s.id = solicitud_items.solicitud_id
      and (private.app_es_admin() or private.app_es_almacen() or s.sede_cod in (select private.app_sedes()))
  ))
  with check (exists (
    select 1 from solicitudes s where s.id = solicitud_items.solicitud_id
      and (private.app_es_admin() or private.app_es_almacen() or s.sede_cod in (select private.app_sedes()))
  ));

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) CATÁLOGOS — "van a tablas de configuración, no hardcodeados" (texto literal del plan).
--    Portados 1:1 de public/js/solicitudes.js:17-45 (v8, el que de verdad se renderiza).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 3a) Colores (18) — SOLI_COLORES. ⚠️ El hex de "Azul Noche" (#0a1628) coincide por pura
--    casualidad con el navy viejo DEPRECADO del propio sistema de diseño del ERP (ver CLAUDE.md:
--    "NO usar #0A1628"). Es dato de negocio portado literalmente (un color real de tela/terno que
--    los clientes piden), no un color de UI — no confundir con la paleta de la app.
create table if not exists solicitud_colores (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  hex     text not null,
  orden   integer not null default 0,
  activo  boolean not null default true
);
alter table solicitud_colores enable row level security;
drop policy if exists solicitud_colores_select on solicitud_colores;
create policy solicitud_colores_select on solicitud_colores for select using (auth.uid() is not null);
drop policy if exists solicitud_colores_admin on solicitud_colores;
create policy solicitud_colores_admin on solicitud_colores for all
  using (private.app_es_admin()) with check (private.app_es_admin());

insert into solicitud_colores (nombre, hex, orden) values
  ('Negro', '#1a1a1a', 1), ('Azul Noche', '#0a1628', 2), ('Azul Presidente', '#1a3a6b', 3),
  ('Azul Barcelona', '#004d98', 4), ('Azul Eléctrico', '#0040ff', 5), ('Azul Acero', '#4682b4', 6),
  ('Verde Petróleo', '#006d5b', 7), ('Verde Olivo', '#556b2f', 8), ('Celeste BB', '#b5d8f0', 9),
  ('Plomo', '#6b6b6b', 10), ('Plomo Oscuro', '#3d3d3d', 11), ('Plomo Rata', '#8a8a8a', 12),
  ('Beige', '#d4b896', 13), ('Marrón', '#5c3317', 14), ('Camello', '#c19a6b', 15),
  ('Vino', '#722f37', 16), ('Blanco', '#f5f5f5', 17), ('Perla', '#eae0c8', 18)
on conflict (nombre) do nothing;

-- ── 3b) Artículos (34, "~40" en el texto del plan — el catálogo real de SOLI_ARTICULOS trae 34)
--    agrupados Limpieza/Empaque/Oficina/Costura/Varios.
create table if not exists solicitud_articulos (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null check (categoria in ('Limpieza', 'Empaque', 'Oficina', 'Costura', 'Varios')),
  nombre     text not null,
  orden      integer not null default 0,
  activo     boolean not null default true,
  unique (categoria, nombre)
);
alter table solicitud_articulos enable row level security;
drop policy if exists solicitud_articulos_select on solicitud_articulos;
create policy solicitud_articulos_select on solicitud_articulos for select using (auth.uid() is not null);
drop policy if exists solicitud_articulos_admin on solicitud_articulos;
create policy solicitud_articulos_admin on solicitud_articulos for all
  using (private.app_es_admin()) with check (private.app_es_admin());

insert into solicitud_articulos (categoria, nombre, orden) values
  ('Limpieza', 'Limpiavidrios', 1), ('Limpieza', 'Detergente', 2), ('Limpieza', 'Downy', 3),
  ('Limpieza', 'POETT', 4), ('Limpieza', 'Lejía', 5), ('Limpieza', 'Ambientador', 6),
  ('Limpieza', 'Trapo (especificar)', 7), ('Limpieza', 'Trapeador', 8), ('Limpieza', 'Escoba', 9),
  ('Limpieza', 'Recogedor', 10), ('Limpieza', 'Escobilla normal', 11), ('Limpieza', 'Escobilla para ternos', 12),
  ('Limpieza', 'Tacho de basura', 13), ('Limpieza', 'Bolsas de basura', 14),
  ('Empaque', 'Bolsas de terno', 1), ('Empaque', 'Bolsa de camisa', 2), ('Empaque', 'Bolsa de venta', 3),
  ('Empaque', 'Cinta adhesiva', 4), ('Empaque', 'Cinta de embalaje', 5),
  ('Oficina', 'Cuadernos (boletas)', 1), ('Oficina', 'Papel bond', 2), ('Oficina', 'Papel térmico', 3),
  ('Oficina', 'Lapiceros', 4), ('Oficina', 'Plumón negro permanente', 5), ('Oficina', 'Etiquetas', 6),
  ('Costura', 'Agujas', 1), ('Costura', 'Botones', 2), ('Costura', 'Cinta métrica', 3),
  ('Costura', 'Trapo de plancha', 4), ('Costura', 'Cojín para plancha', 5),
  ('Varios', 'Papel higiénico', 1), ('Varios', 'Pulverizadores', 2), ('Varios', 'Periódicos', 3), ('Varios', 'Otros', 4)
on conflict (categoria, nombre) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) EXTENSIÓN DE producto_tipos (Fase 7, 0055) — "si tu catálogo de prendas se solapa con
--    producto_tipos, reúsalo o extiéndelo, no crees un catálogo paralelo" (texto literal del
--    plan). 6 de los 12 tipos de SOLI_CFG YA existen en producto_tipos (terno/chaleco/camisa/
--    corbata/correa/panuelo) — se les agrega `campos_solicitud`. Los 6 restantes (blazer/
--    pisacorbata/gemelos/medias/azar/otro) son nuevas filas, con prefijos de 2 letras libres
--    (no chocan con TN/SC/PT/CM/CB/CH/PN/ZP/CR ya sembrados). `campos_solicitud` es jsonb: cada
--    campo (`color`/`talla`/`tela`/`mtela`/`mprenda`/`modelo`/`desc`) es `true` (usa el catálogo
--    general de colores) o un array fijo (override, ej. Gemelos solo en Dorado/Plata) — regla
--    resuelta y testeada en packages/core/src/solicitudes.ts::resolverOpciones.
--
--    Envuelto en un DO block: si 0055 todavía no está aplicada en este entorno (no lo estaba al
--    escribir esta migración — ver cabecera), esta sección se salta entera en vez de romper toda
--    la 0056 por una tabla que otra fase todavía no creó. Cuando 0055 se aplique después, basta
--    correr 0056 de nuevo (idempotente) para que esta sección sí corra.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.producto_tipos') is not null then
    alter table producto_tipos add column if not exists campos_solicitud jsonb;

    update producto_tipos set campos_solicitud = '{
      "color": true,
      "talla": ["S","M","L","XL","2XL","4XL","0","2","4","6","8","10","12","14","16","18"],
      "tela": ["Casimir","Casimir Satinado","Casimir Bradford","Cardiff","Licra","Paño","Corduroy","Piel de durazno"],
      "mtela": ["Wafer","Mil rayas","Entero","Puntos","Liso","Lino","Jack","Jaspeado","Brocado","Cuadros"],
      "mprenda": ["Clásico","Slim Fit","Smoking","Cuello punta","Chino","Coreano"]
    }'::jsonb where cod = 'terno';

    update producto_tipos set campos_solicitud = '{
      "color": true,
      "talla": ["S","M","L","XL","2XL","4XL","0","2","4","6","8","10","12","14","16","18"],
      "tela": ["Casimir","Casimir Satinado","Casimir Bradford","Cardiff","Licra","Paño","Corduroy","Piel de durazno"],
      "mtela": ["Wafer","Mil rayas","Entero","Puntos","Liso","Lino","Jack","Jaspeado","Brocado","Cuadros"],
      "mprenda": ["Clásico","Slim Fit","Cruzado"]
    }'::jsonb where cod = 'chaleco';

    update producto_tipos set campos_solicitud = '{
      "color": true,
      "talla": ["S","M","L","XL","XXL","0","2","4","6","8","10","12","14","16","18"],
      "tela": ["Entero","Rayas","Wafer"]
    }'::jsonb where cod = 'camisa';

    update producto_tipos set campos_solicitud = '{
      "color": true,
      "talla": ["Adulto","Niño"],
      "modelo": ["Normal","Michi","Corbatón"]
    }'::jsonb where cod = 'corbata';

    update producto_tipos set campos_solicitud = '{
      "color": ["Negro","Marrón","Camello"],
      "talla": ["Adulto","Niño"],
      "modelo": ["Con botón","Normal"]
    }'::jsonb where cod = 'correa';

    update producto_tipos set campos_solicitud = '{
      "color": true,
      "talla": ["Adulto","Niño"],
      "modelo": ["Armable","Armado"]
    }'::jsonb where cod = 'panuelo';

    insert into producto_tipos (cod, nombre, prefijo, atributos_sugeridos, campos_solicitud) values
      ('blazer', 'Blazer', 'BZ', '[]'::jsonb, '{
        "color": true,
        "talla": ["S","M","L","XL","2XL","4XL","0","2","4","6","8","10","12","14","16","18"],
        "tela": ["Casimir","Casimir Satinado","Casimir Bradford","Cardiff","Licra","Paño","Corduroy","Piel de durazno"],
        "mtela": ["Wafer","Mil rayas","Entero","Puntos","Liso","Lino","Jack","Jaspeado","Brocado","Cuadros"],
        "mprenda": ["Clásico","Slim Fit","Smoking","Cuello punta","Chino","Coreano"]
      }'::jsonb),
      ('pisacorbata', 'Pisacorbata', 'PC', '[]'::jsonb, '{"color": ["Dorado","Plata"]}'::jsonb),
      ('gemelos', 'Gemelos', 'GM', '[]'::jsonb, '{"color": ["Dorado","Plata"]}'::jsonb),
      ('medias', 'Medias', 'MD', '[]'::jsonb, '{"color": ["Negro","Marrón","Azul noche"]}'::jsonb),
      ('azar', 'Azar', 'AZ', '[]'::jsonb, '{"color": true, "talla": ["Adulto","Niño"]}'::jsonb),
      ('otro', 'Otro', 'OT', '[]'::jsonb, '{"color": true, "desc": true}'::jsonb)
    on conflict (cod) do nothing;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) private.app_es_gestor_solicitudes() — autoridad de aprobar/entregar/rechazar (y, con la
--    misma autoridad, deshacerlas): admin | dueno | encargado_almacen, texto LITERAL del plan.
--    Deliberadamente MÁS ESTRECHO que private.app_es_almacen() (esa incluye confeccionista, que
--    solo tiene VISIBILIDAD del flujo — ver sección 2 — no autoridad de gestión). Vive directo en
--    `private` (creada en 0037): función nueva, no necesita el ritual "alter function set schema"
--    que sí hicieron las que se movieron desde `public`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.app_es_gestor_solicitudes()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from empleados e where e.id = auth.uid() and e.rol in ('admin', 'dueno', 'encargado_almacen')
  );
$$;
revoke execute on function private.app_es_gestor_solicitudes() from public;
grant execute on function private.app_es_gestor_solicitudes() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) RPC ATÓMICAS — cada transición valida el estado de ORIGEN adentro (no confía en el
--    cliente), mismo contrato que reportes_crear (0052) y pipeline_deshacer_division (0054):
--    `security invoker` (respeta RLS real del actor) + `set search_path = public` + errores
--    prefijados 'PREFIJO:detalle' que el repo (lib/solicitudes-repo.ts) parsea para la UI.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- 6a) Crear — cualquier autenticado (el viejo POST /solicitudes tampoco restringía rol; lo
--     restringe el módulo `solicitudes` en permisos_modulos, no la RPC). `p_sede` la manda el
--     server action con `sesion.usuario.sede` (Fase 2: "el dispositivo manda", sin selector).
create or replace function solicitud_crear(p_sede text, p_urgencia text, p_obs text, p_items jsonb)
  returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_actor        uuid := auth.uid();
  v_id           uuid;
  v_items_validos int;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if p_sede is null or trim(p_sede) = '' then raise exception 'Sede requerida'; end if;
  if p_urgencia not in ('alta', 'media', 'baja') then
    raise exception 'Urgencia inválida: %', p_urgencia;
  end if;
  -- Dos pasos separados a propósito: Postgres NO garantiza cortocircuito de OR con una subquery
  -- (jsonb_array_elements(null) revienta si se evalúa) — nada de "p_items is null or (select...)".
  if p_items is null then
    raise exception 'ITEMS_VACIOS:Agrega al menos un ítem con tipo';
  end if;
  select count(*) into v_items_validos from jsonb_array_elements(p_items) i where coalesce(i ->> 'tipo', '') <> '';
  if v_items_validos = 0 then
    raise exception 'ITEMS_VACIOS:Agrega al menos un ítem con tipo';
  end if;

  insert into solicitudes (sede_cod, solicitante_id, urgencia, obs)
  values (p_sede, v_actor, p_urgencia, coalesce(p_obs, ''))
  returning id into v_id;

  insert into solicitud_items (solicitud_id, categoria, tipo, cantidad, color, talla, tela, modelo, detalle, obs)
  select v_id,
         case when i ->> 'categoria' = 'articulo' then 'articulo' else 'prenda' end,
         i ->> 'tipo',
         greatest(coalesce((i ->> 'cantidad')::int, 1), 1),
         nullif(i ->> 'color', ''), nullif(i ->> 'talla', ''), nullif(i ->> 'tela', ''),
         nullif(i ->> 'modelo', ''), nullif(i ->> 'detalle', ''), nullif(i ->> 'obs', '')
  from jsonb_array_elements(p_items) i
  where coalesce(i ->> 'tipo', '') <> '';

  return v_id;
end;
$$;
revoke execute on function solicitud_crear(text, text, text, jsonb) from public;
grant execute on function solicitud_crear(text, text, text, jsonb) to authenticated;

-- 6b) Aprobar — pendiente → aprobada. p_items opcional: [{id, cantidad_enviada}], corrige cuánto
--     hay disponible por ítem (estado_item se deriva: >0 → 'aprobado', 0 → 'sin_stock').
create or replace function solicitud_aprobar(p_id uuid, p_obs_respuesta text default '', p_items jsonb default null)
  returns void language plpgsql security invoker set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_estado text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if not private.app_es_gestor_solicitudes() then
    raise exception 'SIN_PERMISO:Solo admin, dueño o encargado de almacén puede aprobar';
  end if;

  select estado into v_estado from solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_estado <> 'pendiente' then
    raise exception 'ESTADO_INVALIDO:Solo se puede aprobar una solicitud pendiente (está en "%")', v_estado;
  end if;

  update solicitudes set
    estado = 'aprobada', aprobado_por_id = v_actor, fecha_respuesta = now(),
    obs_respuesta = coalesce(p_obs_respuesta, ''), updated_at = now()
  where id = p_id;

  if p_items is not null then
    update solicitud_items si set
      cantidad_enviada = greatest(coalesce((i ->> 'cantidad_enviada')::int, 0), 0),
      estado_item = case when coalesce((i ->> 'cantidad_enviada')::int, 0) > 0 then 'aprobado' else 'sin_stock' end
    from jsonb_array_elements(p_items) i
    where si.id = (i ->> 'id')::uuid and si.solicitud_id = p_id;
  end if;
end;
$$;
revoke execute on function solicitud_aprobar(uuid, text, jsonb) from public;
grant execute on function solicitud_aprobar(uuid, text, jsonb) to authenticated;

-- 6c) Rechazar — pendiente → rechazada. Motivo obligatorio (a diferencia del viejo, que lo exigía
--     solo en el cliente — routes/solicitudes.js:86 sí lo valida server-side; aquí se conserva).
create or replace function solicitud_rechazar(p_id uuid, p_motivo text)
  returns void language plpgsql security invoker set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_estado text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if not private.app_es_gestor_solicitudes() then
    raise exception 'SIN_PERMISO:Solo admin, dueño o encargado de almacén puede rechazar';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_REQUERIDO:El motivo de rechazo es obligatorio';
  end if;

  select estado into v_estado from solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_estado <> 'pendiente' then
    raise exception 'ESTADO_INVALIDO:Solo se puede rechazar una solicitud pendiente (está en "%")', v_estado;
  end if;

  update solicitudes set
    estado = 'rechazada', rechazado_por_id = v_actor, motivo_rechazo = trim(p_motivo),
    fecha_respuesta = now(), updated_at = now()
  where id = p_id;
end;
$$;
revoke execute on function solicitud_rechazar(uuid, text) from public;
grant execute on function solicitud_rechazar(uuid, text) to authenticated;

-- 6d) Entregar — aprobada → entregada. Registra quién recibe en tienda (texto libre, ver cabecera)
--     y los códigos de prenda asignados por ítem.
create or replace function solicitud_entregar(p_id uuid, p_recibe_en_tienda text, p_codigos_prenda jsonb default null)
  returns void language plpgsql security invoker set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_estado text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if not private.app_es_gestor_solicitudes() then
    raise exception 'SIN_PERMISO:Solo admin, dueño o encargado de almacén puede registrar la entrega';
  end if;
  if coalesce(trim(p_recibe_en_tienda), '') = '' then
    raise exception 'RECIBE_REQUERIDO:Indica quién recibe en la tienda';
  end if;

  select estado into v_estado from solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_estado <> 'aprobada' then
    raise exception 'ESTADO_INVALIDO:Solo se puede entregar una solicitud aprobada (está en "%")', v_estado;
  end if;

  update solicitudes set
    estado = 'entregada', entregado_por_id = v_actor, fecha_entrega = now(),
    recibe_en_tienda = trim(p_recibe_en_tienda), codigos_prenda = p_codigos_prenda, updated_at = now()
  where id = p_id;
end;
$$;
revoke execute on function solicitud_entregar(uuid, text, jsonb) from public;
grant execute on function solicitud_entregar(uuid, text, jsonb) to authenticated;

-- 6e) Confirmar — entregada → confirmada. Autoridad: la sede que solicitó (private.app_sedes(),
--     cubre empleados multi-tienda) o admin/dueño — NO encargado_almacen desde otra sede (mismo
--     criterio que puedeConfirmarSolicitud en packages/core/src/solicitudes.ts).
create or replace function solicitud_confirmar(p_id uuid, p_items jsonb default null)
  returns void language plpgsql security invoker set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_estado text;
  v_sede   text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  select estado, sede_cod into v_estado, v_sede from solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_estado <> 'entregada' then
    raise exception 'ESTADO_INVALIDO:Solo se puede confirmar una solicitud entregada (está en "%")', v_estado;
  end if;
  if not (private.app_es_admin() or v_sede in (select private.app_sedes())) then
    raise exception 'SIN_PERMISO:Solo la tienda que solicitó puede confirmar la recepción';
  end if;

  update solicitudes set
    estado = 'confirmada', confirmado = true, confirmado_por_id = v_actor, fecha_confirmacion = now(),
    updated_at = now()
  where id = p_id;

  if p_items is not null then
    update solicitud_items si set
      cantidad_recibida = greatest(coalesce((i ->> 'cantidad_recibida')::int, 0), 0),
      obs_recepcion = coalesce(i ->> 'obs_recepcion', '')
    from jsonb_array_elements(p_items) i
    where si.id = (i ->> 'id')::uuid and si.solicitud_id = p_id;
  end if;
end;
$$;
revoke execute on function solicitud_confirmar(uuid, jsonb) from public;
grant execute on function solicitud_confirmar(uuid, jsonb) to authenticated;

-- 6f) Deshacer — el estado anterior se DERIVA del actual (no se recibe del cliente; ver el
--     comentario de estadoAnterior en packages/core/src/solicitudes.ts sobre el bug del sistema
--     viejo). La autoridad exigida es la MISMA que pudo causar la transición que se revierte
--     (puedeDeshacerSolicitud, mismo archivo): deshacer aprobar/rechazar/entregar exige gestor de
--     almacén; deshacer confirmar exige la sede que confirmó (o admin/dueño).
--     Limpieza de campos — el sistema viejo (PUT /:id/deshacer) dejaba basura al deshacer
--     'entregada'→'aprobada' (nunca limpiaba recibe_en_tienda/codigos_prenda, routes/
--     solicitudes.js:102-104): esta versión sí los limpia, cumpliendo "limpiando los campos que
--     correspondan" del plan.
create or replace function solicitud_deshacer(p_id uuid)
  returns void language plpgsql security invoker set search_path = public as $$
declare
  v_actor   uuid := auth.uid();
  v_estado  text;
  v_sede    text;
  v_destino text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  select estado, sede_cod into v_estado, v_sede from solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;

  v_destino := case v_estado
    when 'aprobada'   then 'pendiente'
    when 'rechazada'  then 'pendiente'
    when 'entregada'  then 'aprobada'
    when 'confirmada' then 'entregada'
    else null
  end;
  if v_destino is null then
    raise exception 'NADA_QUE_DESHACER:No hay nada que deshacer desde el estado "%"', v_estado;
  end if;

  if v_destino = 'entregada' then
    if not (private.app_es_admin() or v_sede in (select private.app_sedes())) then
      raise exception 'SIN_PERMISO:Solo la tienda que confirmó (o admin/dueño) puede deshacer la confirmación';
    end if;
  else
    if not private.app_es_gestor_solicitudes() then
      raise exception 'SIN_PERMISO:Solo admin, dueño o encargado de almacén puede deshacer esta acción';
    end if;
  end if;

  if v_destino = 'pendiente' then
    update solicitudes set
      estado = 'pendiente', aprobado_por_id = null, fecha_respuesta = null, obs_respuesta = '',
      rechazado_por_id = null, motivo_rechazo = null, updated_at = now()
    where id = p_id;
    update solicitud_items set cantidad_enviada = 0, estado_item = 'pendiente' where solicitud_id = p_id;
  elsif v_destino = 'aprobada' then
    update solicitudes set
      estado = 'aprobada', entregado_por_id = null, fecha_entrega = null,
      recibe_en_tienda = null, codigos_prenda = null,
      confirmacion_impresa = false, fecha_confirmacion_impresa = null, updated_at = now()
    where id = p_id;
  elsif v_destino = 'entregada' then
    update solicitudes set
      estado = 'entregada', confirmado = false, confirmado_por_id = null, fecha_confirmacion = null,
      confirmacion_impresa = false, fecha_confirmacion_impresa = null, updated_at = now()
    where id = p_id;
    update solicitud_items set cantidad_recibida = 0, obs_recepcion = '' where solicitud_id = p_id;
  end if;
end;
$$;
revoke execute on function solicitud_deshacer(uuid) from public;
grant execute on function solicitud_deshacer(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7) permisos_modulos — mismo criterio de siembra que 0045: operativos ven+crean (piden
--    insumos), encargado_almacen además "edita" (gestiona: aprobar/entregar/rechazar/confirmar/
--    deshacer — la autoridad fina la exige igual la RPC, esto solo gatea el módulo/botones en la
--    UI). admin/dueno no necesitan fila (puede() los deja pasar siempre).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into permisos_modulos (rol, modulo, acciones) values
  ('confeccionista',    'solicitudes', array['ver', 'crear']),
  ('ventas_junior',     'solicitudes', array['ver', 'crear']),
  ('ventas_junior_2',   'solicitudes', array['ver', 'crear']),
  ('encargado_tienda',  'solicitudes', array['ver', 'crear']),
  ('encargado_almacen', 'solicitudes', array['ver', 'crear', 'editar'])
on conflict (rol, modulo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr manualmente tras aplicar, contra una solicitud QA-F11-*):
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   -- 1) Ciclo feliz completo (como encargado_almacen o admin):
--   select solicitud_crear('LB', 'alta', 'Prueba F11',
--     '[{"categoria":"prenda","tipo":"Terno","cantidad":1,"color":"Negro","talla":"L"},
--       {"categoria":"articulo","tipo":"Detergente","cantidad":2}]'::jsonb);          -- → uuid, estado pendiente
--   select solicitud_aprobar('<id>', 'Hay stock', '[{"id":"<item-id>","cantidad_enviada":1}]'::jsonb);
--   select solicitud_entregar('<id>', 'Juan Pérez', '{"<item-id>":["TN-999"]}'::jsonb);
--   select solicitud_confirmar('<id>', '[{"id":"<item-id>","cantidad_recibida":1}]'::jsonb);
--   select estado, confirmado from solicitudes where id = '<id>';                     -- confirmada, true
--
--   -- 2) Deshacer + limpieza de campos:
--   select solicitud_deshacer('<id>');  -- confirmada → entregada
--   select confirmado, confirmado_por_id, fecha_confirmacion from solicitudes where id = '<id>';
--   -- esperado: false, null, null
--   select solicitud_deshacer('<id>');  -- entregada → aprobada
--   select recibe_en_tienda, codigos_prenda, entregado_por_id from solicitudes where id = '<id>';
--   -- esperado: null, null, null (a diferencia del sistema viejo, que dejaba basura acá)
--
--   -- 3) Validación de origen (no confiar en el cliente): intentar aprobar dos veces la misma
--   --    solicitud ya aprobada → ESTADO_INVALIDO. Intentar confirmar desde una sede distinta a la
--   --    solicitante (sin ser admin/dueño) → SIN_PERMISO. Rechazar sin motivo → MOTIVO_REQUERIDO.
--
--   -- 4) Catálogos:
--   select count(*) from solicitud_colores;    -- 18
--   select count(*) from solicitud_articulos;  -- 34
--   select cod, campos_solicitud from producto_tipos where campos_solicitud is not null order by cod;  -- 12 filas
