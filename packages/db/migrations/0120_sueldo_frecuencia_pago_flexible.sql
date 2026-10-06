-- 0120_sueldo_frecuencia_pago_flexible.sql — el contrato se paga mensual, quincenal, semanal o
-- cada N días, y se puede cambiar a mitad del contrato.
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-06-frecuencia-pago-flexible-design.md §4
-- (tickets lucebien-tablero#8 y #33). Número 0120 asignado por Alexander (0119 reservado por otra
-- sesión).
--
-- QUÉ CAMBIA:
--   1) `sueldo_acuerdos.modalidad` admite 'mensual' | 'quincenal' | 'semanal' | 'dias'.
--   2) `sueldo_acuerdos.cada_dias` (entero 1–62, obligatorio sólo con modalidad 'dias').
--   3) Tabla nueva `sueldo_acuerdo_cambios`: cada fila define la frecuencia y la cuota DESDE una
--      fecha. La vigente para una fecha es la última fila con `desde <= fecha`; sin filas, la del
--      contrato. RLS igual que `sueldo_acuerdos`: cada quien ve lo suyo, sólo admin escribe.
--
-- NO TOCA `sueldo_entrada` ni ninguna liquidación: la cuota vigente se resuelve en el core
-- (`calendarioDePagos`) y viaja en la entrada que el repo arma. Lo ya cerrado no se mueve.
--
-- RETROCOMPATIBLE: los contratos existentes quedan con su modalidad ('mensual' | 'semanal'),
-- `cada_dias` null y sin filas de cambios: exactamente como hoy.
--
-- DEFAULTS PROVISIONALES (no-negociable 5; anotados en docs/pendientes-negocio.md):
--   · «Quincenal» está ANCLADO al día de inicio de la frecuencia (del día d al d+14 y del d+15 al
--     día anterior a d del mes siguiente), no a quincenas fijas 1–15 / 16–fin de mes.
--   · El último pago más corto que la frecuencia se prorratea por días.
--   · «Cada N días»: N entre 1 y 62.
--   Nada de esto vive en la base como regla: está en el core y es editable por el administrador
--   en cada contrato.
--
-- Idempotente: se puede reaplicar sin fallar.

-- ═══ 1) sueldo_acuerdos: modalidad ampliada + cada_dias ═══════════════════════════════════════

alter table sueldo_acuerdos add column if not exists cada_dias int;

do $$
begin
  -- El check de 0072 se llama igual: se reemplaza por el ampliado.
  alter table sueldo_acuerdos drop constraint if exists sueldo_acuerdos_modalidad_chk;
  alter table sueldo_acuerdos add constraint sueldo_acuerdos_modalidad_chk
    check (modalidad in ('mensual', 'quincenal', 'semanal', 'dias'));

  -- coalesce: un `check` con NULL da NULL y PASA; sin él, 'dias' sin N se colaría.
  alter table sueldo_acuerdos drop constraint if exists sueldo_acuerdos_cada_dias_chk;
  alter table sueldo_acuerdos add constraint sueldo_acuerdos_cada_dias_chk check (
    case when modalidad = 'dias' then coalesce(cada_dias between 1 and 62, false)
         else cada_dias is null end
  );
end $$;

comment on column sueldo_acuerdos.cada_dias is
  'Sólo con modalidad = ''dias'': cada cuántos días se paga (1–62). Null en cualquier otra modalidad.';

-- ═══ 2) sueldo_acuerdo_cambios: historial de frecuencia y cuota ═══════════════════════════════

create table if not exists sueldo_acuerdo_cambios (
  id             uuid primary key default gen_random_uuid(),
  -- Sigue al acuerdo: si el acuerdo no puede borrarse con pagos, sus cambios tampoco importan.
  acuerdo_id     uuid not null references sueldo_acuerdos(id) on delete cascade,
  -- Primer día en que rigen la frecuencia y la cuota de esta fila.
  desde          date not null,
  modalidad      text not null,
  cada_dias      int,
  -- Cuota de CADA pago desde `desde` (la confirma el administrador; el sistema sólo la sugiere).
  sueldo_pactado numeric(12,2) not null,
  -- Lo anterior, para mostrar «quincenal S/325 (antes mensual S/650)» sin reconstruirlo.
  modalidad_anterior      text,
  cada_dias_anterior      int,
  sueldo_pactado_anterior numeric(12,2),
  creado_por     uuid references empleados(id) on delete set null,
  creado_en      timestamptz not null default now(),

  constraint sueldo_cambios_modalidad_chk check (modalidad in ('mensual', 'quincenal', 'semanal', 'dias')),
  constraint sueldo_cambios_cada_dias_chk check (
    case when modalidad = 'dias' then coalesce(cada_dias between 1 and 62, false)
         else cada_dias is null end
  ),
  constraint sueldo_cambios_pactado_chk check (sueldo_pactado >= 0),
  constraint sueldo_cambios_acuerdo_desde_uniq unique (acuerdo_id, desde)
);

create index if not exists idx_sueldo_cambios_acuerdo on sueldo_acuerdo_cambios(acuerdo_id, desde);

comment on table sueldo_acuerdo_cambios is
  'Historial de cambios de frecuencia y cuota de un acuerdo (spec frecuencia-pago-flexible §4). La frecuencia vigente para una fecha es la última fila con desde <= fecha; sin filas, la del acuerdo.';

-- `desde` tiene que caer dentro del contrato y después de su primer día: un cambio el primer día es
-- simplemente editar el contrato.
create or replace function sueldo_cambio_coherente() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_ini date; v_fin date;
begin
  select fecha_inicio, fecha_fin into v_ini, v_fin from sueldo_acuerdos where id = new.acuerdo_id;
  if new.desde <= v_ini or new.desde > v_fin then
    raise exception 'DATO:el cambio de frecuencia tiene que caer después del inicio y hasta el fin del contrato (% a %)', v_ini, v_fin;
  end if;
  return new;
end $$;

drop trigger if exists sueldo_cambio_coherente on sueldo_acuerdo_cambios;
create trigger sueldo_cambio_coherente before insert or update on sueldo_acuerdo_cambios
  for each row execute function sueldo_cambio_coherente();

-- RLS: igual que sueldo_acuerdos (0072). Cada persona ve el historial de SU contrato; sólo el
-- administrador escribe. `sueldo_acuerdo_es_mio` es el mismo helper que usa sueldo_acuerdo_turnos.
alter table sueldo_acuerdo_cambios enable row level security;

drop policy if exists sueldo_cambios_select on sueldo_acuerdo_cambios;
create policy sueldo_cambios_select on sueldo_acuerdo_cambios for select
  using (private.app_es_admin() or private.sueldo_acuerdo_es_mio(acuerdo_id));
drop policy if exists sueldo_cambios_admin on sueldo_acuerdo_cambios;
create policy sueldo_cambios_admin on sueldo_acuerdo_cambios for all
  using (private.app_es_admin()) with check (private.app_es_admin());
