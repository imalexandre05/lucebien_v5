-- 0051_dispositivos_sede_fk_perfil_sede.sql — Fase 2 del plan de perfeccionamiento: sede única
-- (dispositivo → login → topbar) + perfiles de sede.
--
-- Decisión del dueño (2026-07-26): "el dispositivo manda" — el admin asigna cada equipo a una
-- sede en /dispositivos; el login pre-marca esa sede; el cambio de sede en el resto del sistema
-- vive solo en el topbar. Esta migración soporta esa decisión con dos cambios de esquema:
--
--   1) dispositivos_autorizados.sede_cod pasa de texto suelto a FK real hacia sedes(cod).
--   2) sedes.perfil ('pos' | 'almacen') reemplaza a `interna` como la fuente de verdad de qué
--      perfil de operación tiene una sede. `interna` se conserva (algunas pantallas ya la leen)
--      pero queda DERIVADA automáticamente por trigger — nadie debe volver a escribirla a mano.
--
-- Idempotente: add column/constraint if not exists + DO block con duplicate_object (mismo idiom
-- que 0050_empleados_roles_derivados.sql).
--
-- ⚠️ Aplicar DESPUÉS de 0050_empleados_roles_derivados.sql (esta no depende de sus columnas, pero
-- el plan pide ese orden). Si 0050 sigue sin aplicar, esta migración corre igual sin problema.

-- ── 1) sedes.perfil ('pos' | 'almacen') ─────────────────────────────────────────────────────
-- Backfill: AL (Almacén Central) → 'almacen' (pipeline + solicitudes, sin POS); LB/ST/TR → 'pos'
-- (pedidos + caja, sin pipeline). Se deriva 1:1 de `interna` (interna=true → almacen), que ya
-- distinguía exactamente el mismo caso (AL es la única sede interna hoy).
alter table sedes add column if not exists perfil text;
update sedes set perfil = case when interna then 'almacen' else 'pos' end where perfil is null;
alter table sedes alter column perfil set default 'pos';

do $$ begin
  alter table sedes add constraint sedes_perfil_check check (perfil in ('pos', 'almacen'));
exception when duplicate_object then null; end $$;

alter table sedes alter column perfil set not null;

-- `interna` queda como columna derivada (compatibilidad con lecturas existentes que no se hayan
-- migrado a `perfil` todavía) — un trigger la mantiene sincronizada para que nunca pueda
-- desalinearse de `perfil`, que es ahora la única que se escribe desde la app.
create or replace function sedes_sync_interna()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.interna := (new.perfil = 'almacen');
  return new;
end;
$$;

drop trigger if exists trg_sedes_sync_interna on sedes;
create trigger trg_sedes_sync_interna
  before insert or update of perfil on sedes
  for each row execute function sedes_sync_interna();

-- ── 2) dispositivos_autorizados.sede_cod → FK real a sedes(cod) ────────────────────────────
-- Hoy es `text` suelto (0036) y en la práctica casi nunca se completa (el único caller que
-- registraba un equipo, solicitarAcceso() en app/dispositivo/actions.ts, mandaba p_sede=''). Antes
-- de restringir: normaliza mayúsculas y limpia cualquier valor huérfano que no matchee una sede
-- real, para que la FK no falle al aplicarse.
update dispositivos_autorizados set sede_cod = upper(trim(sede_cod)) where sede_cod is not null;
update dispositivos_autorizados set sede_cod = null
  where sede_cod is not null and sede_cod not in (select cod from sedes);

do $$ begin
  alter table dispositivos_autorizados
    add constraint dispositivos_autorizados_sede_cod_fkey
    foreign key (sede_cod) references sedes(cod);
exception when duplicate_object then null; end $$;

-- ── Verificación (correr después de aplicar) ────────────────────────────────────────────────
-- select cod, perfil, interna from sedes order by cod;
--   -- esperado: AL → almacen/true; LB, ST, TR → pos/false
-- select count(*) from dispositivos_autorizados
--   where sede_cod is not null and sede_cod not in (select cod from sedes);
--   -- debe ser 0 (todo lo que no matcheaba ya se limpió arriba)
