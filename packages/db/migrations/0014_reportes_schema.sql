-- 0014_reportes_schema.sql — Módulo Reportes FR-01 (reporte diario por turno M/T/C).
-- Lleva el modelo rico del sistema viejo a Postgres: completa `reportes` (le faltaban ~7
-- columnas), `reporte_actividades`/`reporte_extras`, y crea `actividades_config` (157 filas
-- reales) + `actividades_pendientes`. Solo estructura, aditivo e idempotente.
-- reportes.id sigue siendo TEXT (se preserva el id del viejo) → las hijas lo referencian igual.

-- ── reportes: columnas que faltaban (evaluación, auto-envío por cron, conteos) ──
alter table reportes
  add column if not exists puntaje_eval       integer,
  add column if not exists act_total          integer default 0,
  add column if not exists act_done           integer default 0,
  add column if not exists evaluador_id       uuid references empleados(id),
  add column if not exists auto_enviado        boolean default false,
  add column if not exists auto_enviado_razon  text,
  add column if not exists no_evaluable        boolean default false;

-- ── reporte_actividades: categoría + peso de la actividad ──
alter table reporte_actividades
  add column if not exists cat  text,
  add column if not exists peso integer default 0;

-- ── reporte_extras: precio unitario + detalle ──
alter table reporte_extras
  add column if not exists precio_unitario numeric default 0,
  add column if not exists detalle         text;

-- ── actividades_config: catálogo configurable de actividades por sede (admin) ──
create table if not exists actividades_config (
  id              uuid primary key default gen_random_uuid(),
  sede_cod        text not null references sedes(cod),
  cod             text not null,
  nombre          text not null,
  categoria       text default 'PO',
  tipo_act        text default 'obligatoria',
  peso            numeric default 5,
  activa          boolean default true,
  aparece_dia     integer default 0,
  frecuencia_dias integer default 0,
  turno           text default 'ambos',
  dia_semana      text,
  acumula         boolean default true,
  precio_unitario numeric default 0,
  unidad          text default 'unidad',
  orden           integer default 0,
  unique (sede_cod, cod)
);

-- ── actividades_pendientes: actividades arrastradas de un turno a otro ──
create table if not exists actividades_pendientes (
  id           uuid primary key default gen_random_uuid(),
  act_cod      text not null,
  sede_cod     text not null references sedes(cod),
  desde_fecha  date,
  desde_turno  text,
  resuelta     boolean default false,
  resuelta_en  timestamptz,
  unique (act_cod, sede_cod, desde_fecha, desde_turno)
);

-- RLS habilitada en las nuevas (sin policy aún → solo service_role; policies en 0015).
alter table actividades_config     enable row level security;
alter table actividades_pendientes enable row level security;

-- Índices
create index if not exists idx_reportes_sede_fecha on reportes(sede_cod, fecha);
create index if not exists idx_rep_act_reporte     on reporte_actividades(reporte_id);
create index if not exists idx_act_config_sede      on actividades_config(sede_cod, activa);
