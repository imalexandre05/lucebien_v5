-- 0035_caja.sql — Cajas y Cobros (contrato S13).
-- Reglas confirmadas con el responsable:
--  · Cobro ligado a un pedido; métodos varios; tipo adelanto/saldo/pago completo.
--    Saldo del pedido = total − Σ(cobros del pedido).
--  · Caja diaria con APERTURA y CIERRE (arqueo).
--  · Entran también EGRESOS y gastos.
--  · Garantías = depósito reembolsable del alquiler (ingreso; su devolución = egreso).
-- RLS por sede calcando el patrón comercial (admin OR sede propia; ped_rw/cli_rw).

create table if not exists caja_sesiones (
  id             uuid primary key default gen_random_uuid(),
  sede_cod       text not null references sedes(cod),
  fecha          date not null default (now() at time zone 'America/Lima')::date,
  estado         text not null default 'abierta',   -- 'abierta' | 'cerrada'
  monto_apertura numeric not null default 0,
  monto_cierre   numeric,                            -- arqueo declarado al cerrar
  abierta_por_id uuid references empleados(id),
  cerrada_por_id uuid references empleados(id),
  apertura_at    timestamptz not null default now(),
  cierre_at      timestamptz,
  obs            text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_caja_ses_sede_fecha on caja_sesiones(sede_cod, fecha);
-- Una sola caja abierta por sede a la vez.
create unique index if not exists uq_caja_ses_abierta on caja_sesiones(sede_cod) where estado = 'abierta';

create table if not exists caja_movimientos (
  id                uuid primary key default gen_random_uuid(),
  sesion_id         uuid references caja_sesiones(id) on delete set null,
  sede_cod          text not null references sedes(cod),
  fecha             date not null default (now() at time zone 'America/Lima')::date,
  tipo              text not null,          -- 'ingreso' | 'egreso'
  categoria         text not null,          -- 'cobro' | 'gasto' | 'garantia' | 'devolucion_garantia' | 'otro'
  monto             numeric not null,
  metodo            text,                   -- 'efectivo' | 'yape' | 'transferencia' | ...
  pedido_id         uuid references pedidos(id) on delete set null,
  cobro_tipo        text,                   -- 'adelanto' | 'saldo' | 'completo' (para cobros)
  descripcion       text,
  registrado_por_id uuid references empleados(id),
  created_at        timestamptz not null default now()
);
create index if not exists idx_caja_mov_sesion on caja_movimientos(sesion_id);
create index if not exists idx_caja_mov_pedido on caja_movimientos(pedido_id);
create index if not exists idx_caja_mov_sede_fecha on caja_movimientos(sede_cod, fecha);

alter table caja_sesiones    enable row level security;
alter table caja_movimientos enable row level security;

create policy caja_ses_rw on caja_sesiones for all
  using (app_es_admin() or (sede_cod in (select app_sedes())))
  with check (app_es_admin() or (sede_cod in (select app_sedes())));

create policy caja_mov_rw on caja_movimientos for all
  using (app_es_admin() or (sede_cod in (select app_sedes())))
  with check (app_es_admin() or (sede_cod in (select app_sedes())));
