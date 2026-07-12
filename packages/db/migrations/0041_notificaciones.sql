-- 0041_notificaciones.sql — S21: Notificaciones internas y reglas de alertas.
-- El motor de reglas vive en @scilb/core (alertas.ts, testeado); la generación (acción server /
-- futuro cron) evalúa el estado y hace UPSERT sobre `notificaciones` usando `dedup_key` para no
-- duplicar la misma alerta en cada corrida. `alertas_reglas` guarda qué condición está activa y
-- con qué umbral (configurable, no hardcode). RLS: admin ve todo; el resto ve lo de su sede,
-- lo dirigido a su persona o los avisos globales (sede nula).
-- Idempotente.

create table if not exists notificaciones (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null,
  titulo            text not null,
  mensaje           text not null,
  severidad         text not null default 'info',   -- 'info' | 'warn' | 'critica'
  destinatario_rol  text,
  destinatario_sede text,
  destinatario_id   uuid,
  leida             boolean not null default false,
  ref_tipo          text,
  ref_id            text,
  dedup_key         text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Una fila viva por condición (tipo + referencia): el UPSERT refresca en vez de duplicar.
create unique index if not exists uq_notif_dedup on notificaciones(dedup_key);
create index if not exists idx_notif_sede on notificaciones(destinatario_sede) where not leida;
create index if not exists idx_notif_leida on notificaciones(leida);

create table if not exists alertas_reglas (
  tipo         text primary key,
  descripcion  text not null,
  severidad    text not null default 'info',
  umbral       numeric,                 -- días de gracia / margen, según la regla
  activa       boolean not null default true,
  destinatario_rol text,
  config       jsonb not null default '{}'::jsonb
);

-- Reglas base (editables desde Configuración a futuro).
insert into alertas_reglas (tipo, descripcion, severidad, umbral, destinatario_rol) values
  ('devolucion_vencida',   'Alquiler cuya devolución ya venció',            'critica', 0, 'encargado_tienda'),
  ('devolucion_proxima',   'Devolución de alquiler por vencer',             'warn',    2, 'encargado_tienda'),
  ('stock_bajo',           'Material por debajo de su stock mínimo',        'warn',    null, 'encargado_almacen'),
  ('caja_sin_cerrar',      'Caja de un día anterior que sigue abierta',     'warn',    1, 'encargado_tienda'),
  ('reporte_sin_evaluar',  'Reporte FR-01 sin evaluar pasado el margen',    'info',    2, 'admin')
on conflict (tipo) do nothing;

alter table notificaciones enable row level security;
alter table alertas_reglas enable row level security;

drop policy if exists notif_sel on notificaciones;
create policy notif_sel on notificaciones for select using (
  private.app_es_admin()
  or destinatario_sede is null
  or destinatario_sede in (select private.app_sedes())
  or destinatario_id = auth.uid()
);

-- Escritura (generar / marcar leída): admin o dentro de la sede propia o dirigida a la persona.
drop policy if exists notif_rw on notificaciones;
create policy notif_rw on notificaciones for all
  using (
    private.app_es_admin()
    or destinatario_sede in (select private.app_sedes())
    or destinatario_id = auth.uid()
  )
  with check (
    private.app_es_admin()
    or destinatario_sede is null
    or destinatario_sede in (select private.app_sedes())
    or destinatario_id = auth.uid()
  );

-- Reglas: lectura para autenticados; escritura solo admin.
drop policy if exists reglas_sel on alertas_reglas;
create policy reglas_sel on alertas_reglas for select using (auth.uid() is not null);
drop policy if exists reglas_rw on alertas_reglas;
create policy reglas_rw on alertas_reglas for all
  using (private.app_es_admin())
  with check (private.app_es_admin());
