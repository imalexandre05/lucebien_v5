-- 0005_pipeline_schema.sql — Fase 3 (pipeline de lavandería): lleva el modelo rico del
-- sistema viejo (tabla `prendas` de 23 columnas + 6 tablas auxiliares) a Postgres.
-- Cierra el hallazgo H4 (el pipeline estaba subdimensionado en el schema nuevo).
--
-- SOLO ESTRUCTURA (aditivo, idempotente). No toca datos ni RLS:
--   · la RLS de las tablas nuevas + las policies que faltan en historial/puntos/envios
--     van en 0006_pipeline_rls.sql (depende de confirmar la regla de visibilidad del
--     almacén — ver nota al final).
--   · el ETL de las 93 prendas reales corre con el cliente admin (service_role), que
--     bypasea RLS, así que no necesita las policies para cargar.
--
-- Mapeo viejo→nuevo (pseudo-FK por nombre/código TEXT → FK real uuid a empleados):
--   prendas.cod_lavador      → prenda_pasada.lavador_id
--   prendas.cod_planchador   → prenda_pasada.planchador_id
--   prendas.envio_id (int)   → prenda_pasada.envio_id (uuid)
--   prendas.lista_lavanderia_id (text) → prenda_pasada.lista_lavanderia_id (uuid)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Tablas auxiliares nuevas (orden: padres antes que hijas por las FK)
-- ─────────────────────────────────────────────────────────────────────────────

-- Envíos de accesorios a granel (flujo paralelo al de prendas: almacén → tienda).
create table if not exists envios_accesorios (
  id              uuid primary key default gen_random_uuid(),
  sede_destino_cod text not null references sedes(cod),
  fecha           timestamptz not null,
  responsable_id  uuid references empleados(id),
  validado_tienda boolean default false,
  validado_por_id uuid references empleados(id),
  fecha_validado  timestamptz,
  obs             text,
  created_at      timestamptz default now()
);

create table if not exists envio_accesorios_items (
  id        uuid primary key default gen_random_uuid(),
  envio_id  uuid not null references envios_accesorios(id) on delete cascade,
  tipo      text not null,
  cantidad  integer default 0,
  obs       text
);

-- Movimientos de accesorios sueltos (corbatas, michis, etc.) en almacén.
create table if not exists accesorios_log (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null,
  cantidad        integer default 0,
  responsable_id  uuid references empleados(id),
  fecha           timestamptz not null,
  sede_origen_cod text default 'AL' references sedes(cod),
  enviado         boolean default false,
  envio_id        uuid references envios_accesorios(id),
  sustento        text,
  origen          text default 'almacen',
  created_at      timestamptz default now()
);

-- Listas de lavandería (flujo legacy tienda→almacén; se conserva por compatibilidad).
-- resp_inv / resp_traslado quedan como TEXT a propósito: en el viejo guardan nombres
-- sueltos y resolverlos a uuid es ambiguo (riesgo de homónimos). Se migran tal cual.
create table if not exists listas_lavanderia (
  id              uuid primary key default gen_random_uuid(),
  codigo_legacy   text,                       -- el id TEXT del sistema viejo
  sede_cod        text not null references sedes(cod),
  tipo            text not null,
  estado          text default 'En proceso',
  validado_tienda boolean default false,
  obs_retorno     text,
  fecha           timestamptz not null,
  resp_inv        text,
  resp_traslado   text,
  camisas         integer default 0,
  corbatas        integer default 0,
  michis          integer default 0,
  corbatones      integer default 0,
  porta_ternos    integer default 0,
  zapatos         integer default 0,
  created_at      timestamptz default now()
);

create table if not exists lista_items (
  id             uuid primary key default gen_random_uuid(),
  lista_id       uuid not null references listas_lavanderia(id) on delete cascade,
  cod            text not null,
  tipo           text,
  color          text,
  talla          text,
  obs            text,
  motivo         text,
  devolver       text,
  estado_proceso text,
  estado_retorno text
);

-- Calificación de prendas al recibirlas en tienda (aceptada / observada).
create table if not exists prenda_calificacion (
  id             uuid primary key default gen_random_uuid(),
  pasada_id      uuid not null references prenda_pasada(id) on delete cascade,
  envio_id       uuid references envios_prendas(id),
  aceptada       boolean default true,
  obs            text,
  calificador_id uuid references empleados(id),
  fecha          timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Columnas que faltaban en tablas ya existentes
-- ─────────────────────────────────────────────────────────────────────────────

-- envios_prendas: observación que deja la tienda al validar el envío.
alter table envios_prendas
  add column if not exists obs_tienda text;

-- prenda_pasada: el modelo rico del pipeline (lavador/planchador, observaciones por
-- etapa, aprobación, envío, lista, división de ternos).
alter table prenda_pasada
  add column if not exists color               text,
  add column if not exists talla               text,
  add column if not exists lavador_id          uuid references empleados(id),
  add column if not exists planchador_id       uuid references empleados(id),
  add column if not exists necesita_compostura boolean default false,
  add column if not exists obs_refaccion       text,
  add column if not exists obs_compostura      text,
  add column if not exists obs_calidad         text,
  add column if not exists obs_general         text,
  add column if not exists aprobada            boolean default false,
  add column if not exists envio_id            uuid references envios_prendas(id),
  add column if not exists lista_lavanderia_id uuid references listas_lavanderia(id),
  add column if not exists dividida_en         text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS en las tablas nuevas (habilitada, SIN policy todavía → solo service_role
--    entra hasta 0006). Es el estado interino seguro: nada se expone a authenticated.
-- ─────────────────────────────────────────────────────────────────────────────
alter table envios_accesorios       enable row level security;
alter table envio_accesorios_items  enable row level security;
alter table accesorios_log          enable row level security;
alter table listas_lavanderia       enable row level security;
alter table lista_items             enable row level security;
alter table prenda_calificacion     enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Índices de performance (el kanban agrupa por etapa; las hijas se filtran por FK)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_pasada_etapa        on prenda_pasada(etapa);
create index if not exists idx_pasada_envio        on prenda_pasada(envio_id);
create index if not exists idx_pasada_lista        on prenda_pasada(lista_lavanderia_id);
create index if not exists idx_hist_pasada         on prenda_historial(pasada_id);
create index if not exists idx_puntos_emp          on pipeline_puntos(empleado_id);
create index if not exists idx_calif_pasada        on prenda_calificacion(pasada_id);
create index if not exists idx_lista_items_lista   on lista_items(lista_id);
create index if not exists idx_acc_items_envio     on envio_accesorios_items(envio_id);

-- Nota para 0006_pipeline_rls (decisión de negocio pendiente de confirmar):
--   prenda_pasada hoy se filtra por sede_origen_cod. Pero el pipeline es un flujo
--   CENTRAL: las prendas de todas las sedes pasan por almacén. Hay que confirmar si
--   los roles de almacén/confección ven TODAS las prendas (probable) o solo las de
--   su sede. De eso depende si 0006 agrega un helper app_es_almacen() o no.
