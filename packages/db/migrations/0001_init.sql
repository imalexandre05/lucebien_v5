-- 0001_init.sql — Schema unificado SCI-LB (Postgres / Supabase)
-- W4. Reemplaza el SQLite del ERP viejo: FKs REALES, resuelve los 7 pseudo-FK por nombre TEXT,
-- y une lo INTERNO (pipeline/RRHH) con lo COMERCIAL nuevo (inventario/clientes/pedidos).
--
-- Modelo clave (E5): un ACTIVO de inventario (maestro, código permanente TN-042) genera muchas
-- PASADAS por el pipeline de lavandería a lo largo de su vida (cada vuelta sucia = 1 pasada).
--
-- Alcance: núcleo (RRHH, pipeline, comercial, reportes FR-01, evaluaciones, pagos). Las tablas
-- periféricas (horarios v2, layout_zonas, valores360, garantías, préstamos, accesorios, audit_log)
-- se portan en 0002 para mantener esta migración revisable.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ─────────────────────────────────────────── Catálogos base ───────────────────────────────────
create table sedes (
  cod        text primary key,            -- LB, ST, TR, AL
  nombre     text not null,
  direccion  text default '',
  interna    boolean not null default false  -- AL = solo interno
);

create table empleados (
  id          uuid primary key default gen_random_uuid(),
  cod         text unique not null,        -- código corto (login operativo)
  nombre      text not null,
  iniciales   text not null,
  rol         text not null default 'confeccionista',
  sede_cod    text references sedes(cod),
  activo      boolean not null default true,
  estado      text not null default 'activo',
  password_hash text default '',           -- bcrypt; cod_plain/pass_plain NO se migran (DROP)
  -- PII
  dni text default '', telefono text default '', direccion text default '',
  fecha_nacimiento date, fecha_ingreso date, contacto_emergencia text default '',
  tel_emergencia text default '', salario_base numeric(10,2) default 0,
  notas text default '',
  created_at timestamptz not null default now()
);

create table empleado_tiendas (
  empleado_id uuid not null references empleados(id) on delete cascade,
  sede_cod    text not null references sedes(cod),
  primary key (empleado_id, sede_cod)
);

create table config (
  clave text primary key,
  valor text
);
comment on table config is 'Clave/valor: pesos pts_* (puntos pipeline), peso_* (evaluación), inc_*, precios.';

-- ─────────────────────────────────────────── Comercial (nuevo) ────────────────────────────────
create table clientes (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  dni       text default '',
  telefono  text default '',
  medidas   jsonb default '{}'::jsonb,     -- tallas/medidas para alquiler/confección
  sede_cod  text references sedes(cod),
  created_at timestamptz not null default now()
);

-- ACTIVO de inventario = entidad maestra (alquilable/vendible), código permanente, desgaste acumulado.
create table inventario_activo (
  id          uuid primary key default gen_random_uuid(),
  codigo      text unique not null,        -- TN-042 (global; sede es campo aparte, no va en el código)
  tipo        text not null,               -- TN (terno), CM (camisa), ...
  talla       text default '',
  color       text default '',
  sede_cod    text references sedes(cod),
  estado      text not null default 'disponible',  -- disponible | alquilado | en_lavanderia | baja
  precio_base    numeric(10,2) not null default 0,
  precio_alquiler numeric(10,2) default 0,
  precio_venta    numeric(10,2) default 0,
  usos_acumulados integer not null default 0,  -- alimenta la baja de precio por uso (regla E3, configurable)
  foto_url    text default '',
  created_at  timestamptz not null default now()
);

create table pedidos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid references clientes(id),
  tipo        text not null,               -- alquiler | venta | servicio
  sede_cod    text references sedes(cod),
  estado      text not null default 'abierto',
  fecha       date not null default current_date,
  fecha_devolucion date,                   -- solo alquiler
  total       numeric(10,2) default 0,
  created_at  timestamptz not null default now()
);

create table pedido_items (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references pedidos(id) on delete cascade,
  activo_id  uuid references inventario_activo(id),  -- null si es servicio sobre prenda del cliente
  descripcion text default '',
  precio     numeric(10,2) default 0
);

-- ─────────────────────────────────────────── Pipeline de lavandería (interno) ─────────────────
-- PASADA = una vuelta de una prenda por el pipeline. Liga al activo (E5). Si activo_id es NULL,
-- es prenda de un cliente que entró por un servicio suelto (pedido tipo 'servicio').
create table prenda_pasada (
  id          uuid primary key default gen_random_uuid(),
  activo_id   uuid references inventario_activo(id),    -- E5: un activo → muchas pasadas
  pedido_id   uuid references pedidos(id),              -- servicio/alquiler que la originó
  codigo      text not null,
  tipo        text default '',
  etapa       text not null default 'recepcion',        -- 9 etapas (ver @scilb/core ETAPAS_PIPELINE)
  tipo_lavado text default '',
  sede_origen_cod text references sedes(cod),
  dividida    boolean not null default false,           -- terno → saco+pantalón
  fecha_ingreso   timestamptz not null default now(),
  fecha_actualizado timestamptz not null default now()
);
create index idx_pasada_etapa on prenda_pasada(etapa);
create index idx_pasada_activo on prenda_pasada(activo_id);

create table prenda_historial (
  id           uuid primary key default gen_random_uuid(),
  pasada_id    uuid not null references prenda_pasada(id) on delete cascade,
  etapa_anterior text,
  etapa_nueva  text not null,
  empleado_id  uuid references empleados(id),  -- ← pseudo-FK #5 (era prenda_historial.responsable TEXT)
  obs          text,
  fecha        timestamptz not null default now()
);

create table pipeline_puntos (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id),  -- ← pseudo-FK #4 (era pipeline_puntos.emp_nombre TEXT)
  pasada_id   uuid references prenda_pasada(id),
  etapa       text not null,
  puntos      numeric(6,2) not null default 0,   -- ½ para pieza no-terno (regla E1)
  detalle     text,
  fecha       timestamptz not null default now()
);

create table envios_prendas (
  id            uuid primary key default gen_random_uuid(),
  sede_destino_cod text not null references sedes(cod),
  responsable_id uuid references empleados(id),
  estado        text not null default 'enviado',
  validado_tienda boolean not null default false,
  fecha         timestamptz not null default now()
);

-- ─────────────────────────────────────────── Reportes diarios FR-01 ───────────────────────────
create table reportes (
  id          text primary key,            -- 'DD-MM-YY_TURNO-SEDE'
  sede_cod    text not null references sedes(cod),
  turno       text not null,               -- M | T | C
  fecha       date not null,
  encargado_id uuid references empleados(id),  -- ← pseudo-FK #1 (era reportes.encargado TEXT)
  puntaje     integer default 0,
  evaluado    boolean not null default false,
  bloqueado   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table reporte_trabajadores (
  id          uuid primary key default gen_random_uuid(),
  reporte_id  text not null references reportes(id) on delete cascade,
  empleado_id uuid references empleados(id)   -- ← pseudo-FK #6 (era reporte_trabajadores.nombre TEXT)
);

create table reporte_actividades (
  id          uuid primary key default gen_random_uuid(),
  reporte_id  text not null references reportes(id) on delete cascade,
  cod         text not null,
  nombre      text not null,
  realizada   boolean not null default false,
  calificacion numeric(4,2) default 1,
  obs         text
);

create table reporte_extras (
  id            uuid primary key default gen_random_uuid(),
  reporte_id    text not null references reportes(id) on delete cascade,
  tipo          text not null,
  nombre        text not null,
  cantidad      integer default 1,
  monto_total   numeric(10,2) default 0,
  registrado_por_id uuid references empleados(id)  -- ← pseudo-FK #7 (era reporte_extras.registrado_por TEXT)
);

-- ─────────────────────────────────────────── Incidencias / evaluaciones / RRHH ────────────────
create table incidencias (
  id            uuid primary key default gen_random_uuid(),
  sede_cod      text not null references sedes(cod),
  fecha         date not null,
  tipo          text not null,
  descripcion   text,
  nivel         text not null default 'Medio',
  responsable_id   uuid references empleados(id),  -- ← pseudo-FK #2 (era incidencias.responsable TEXT)
  reportado_por_id uuid references empleados(id),  -- ← pseudo-FK #3 (era incidencias.reportado_por TEXT)
  puntos_penalidad numeric(6,2) default 0,
  created_at    timestamptz not null default now()
);

create table evaluaciones_mensuales (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id),
  mes         text not null,               -- 'YYYY-MM'
  nota_final  numeric(5,2) default 0,
  pesos_usados jsonb,
  ciclo_desde date, ciclo_hasta date,
  created_at  timestamptz not null default now(),
  unique (empleado_id, mes)
);

create table asistencias (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  fecha       date not null,
  turno       text not null default 'M',
  hora_entrada time, hora_salida time,
  minutos_tardanza integer not null default 0,
  fuente      text not null default 'manual',
  unique (empleado_id, fecha, turno)
);

create table pagos (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references empleados(id),
  evaluacion_id uuid references evaluaciones_mensuales(id),
  monto         numeric(10,2) not null default 0,
  bonus         numeric(10,2) default 0,
  descuentos    numeric(10,2) default 0,
  estado        text not null default 'pendiente',
  metodo        text default 'efectivo',
  fecha_pago    date,
  anulado       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index idx_pagos_emp on pagos(empleado_id);
