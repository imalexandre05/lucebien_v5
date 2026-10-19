-- 0165_asistencia_revisada.sql — marca de «día revisado» para la lista «Por revisar» de la ficha.
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md §5
-- (decisión del dueño n.º 4, 18-oct-2026). Prueba: packages/db/pruebas/0165_asistencia_revisada.prueba.sql.
--
-- No cambia ningún cálculo: `sueldo_entrada` no lee estas columnas. Sólo dice «el administrador ya
-- miró este día» (una tardanza, una falta o una hora estimada que acepta tal cual). La escribe el
-- administrador por la policy `asist_admin_write` de siempre (0025): no hace falta policy nueva.
-- Si después cambia una hora o la condición del día, la marca se borra sola: el dato cambió y hay
-- que volver a mirarlo.
--
-- Sin parámetros de negocio. Idempotente.

alter table asistencias add column if not exists revisada_en  timestamptz;
alter table asistencias add column if not exists revisada_por uuid references empleados(id) on delete set null;

comment on column asistencias.revisada_en is
  'Cuándo el administrador dio el día por revisado en «Por revisar» (0165). No cambia el pago. Se
   vuelve null sola si cambia una hora o la condición del día.';

create or replace function private.asistencia_revisada_se_borra() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Sólo si esta misma escritura no está tocando la marca (quien la pone no se la borra).
  if new.revisada_en is not distinct from old.revisada_en
     and (new.hora_entrada is distinct from old.hora_entrada
          or new.hora_salida is distinct from old.hora_salida
          or new.condicion is distinct from old.condicion) then
    new.revisada_en := null;
    new.revisada_por := null;
  end if;
  return new;
end $$;

drop trigger if exists asistencia_revisada_se_borra on asistencias;
create trigger asistencia_revisada_se_borra before update on asistencias
  for each row execute function private.asistencia_revisada_se_borra();
