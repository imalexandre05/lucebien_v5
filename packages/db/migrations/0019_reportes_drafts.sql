-- 0019_reportes_drafts.sql — autosave del reporte FR-01 mientras se llena.
-- Un único borrador por espacio de trabajo (sede/fecha/turno). Lo consume el cron de
-- auto-cierre: si al pasar el deadline hay draft con contenido → reporte auto_enviado.
-- payload jsonb = { trabajadores:[uuid], actividades:[{cod,nombre,cat,peso,realizada,obs}], extras:[…] }.

create table if not exists reporte_drafts (
  sede_cod     text not null references sedes(cod),
  fecha        date not null,
  turno        text not null,
  encargado_id uuid references empleados(id),
  payload      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (sede_cod, fecha, turno)
);

alter table reporte_drafts enable row level security;

-- RLS por sede, espejando 0017: admin/almacén ven todo, tiendas solo su sede.
drop policy if exists drafts_rw on reporte_drafts;
create policy drafts_rw on reporte_drafts for all
  using      (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()));
