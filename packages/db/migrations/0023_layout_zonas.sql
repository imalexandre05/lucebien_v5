-- 0023_layout_zonas.sql — mapa de zonas de limpieza por sede (FR-01 "Limpieza").
-- Cada zona tiene posición (pos_x/pos_y), tamaño, color, forma, peso y turno. El colaborador
-- marca en el mapa qué zonas limpió; al enviar el reporte se guardan como actividades OL_<cod>
-- (categoría IND = limpieza). Lectura por sede (los colaboradores la necesitan); escritura admin.
-- Espeja la tabla del sistema viejo (routes/layout.js), con sede → sede_cod (FK a sedes).

create table if not exists layout_zonas (
  id              bigint primary key generated always as identity,
  sede_cod        text not null references sedes(cod),
  cod             text not null default '',
  nombre          text not null default '',
  turno           text not null default 'ambos',
  tipo            text not null default 'mueble',
  peso            numeric not null default 1,
  pos_x           numeric not null default 0,
  pos_y           numeric not null default 0,
  ancho           numeric not null default 60,
  alto            numeric not null default 40,
  color           text not null default '#3b82f6',
  forma           text not null default 'rect',
  orden           integer not null default 0,
  nivel           text not null default 'piso',
  sobre_cod       text not null default '',
  frecuencia_dias integer not null default 0,
  dia_semana      text not null default ''
);

alter table layout_zonas enable row level security;

drop policy if exists layout_select on layout_zonas;
create policy layout_select on layout_zonas for select
  using (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()));

drop policy if exists layout_admin_write on layout_zonas;
create policy layout_admin_write on layout_zonas for all
  using (app_es_admin()) with check (app_es_admin());

create index if not exists idx_layout_sede on layout_zonas(sede_cod, turno, orden);
