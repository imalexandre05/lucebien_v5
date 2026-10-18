-- 0150_incidencias_puntos_catalogo.sql — los puntos de una incidencia salen del catálogo en la base.
--
-- Implementa el addendum de docs/superpowers/specs/2026-10-18-incidencias-servidor-valida-design.md.
-- La policy inc_insert (0046) deja insertar a cualquier usuario de la sede (o de almacén) con el
-- `puntos_penalidad` que quiera, llamando directo a PostgREST. Esos puntos descuentan de la nota y,
-- por ahí, del sueldo (no-negociable 1). Las acciones del servidor ya los toman del catálogo; esto
-- cierra el camino que las evita.
--
-- Para quien NO es administrador: el trigger fija `puntos_penalidad` al `puntos_default` del tipo
-- activo y rechaza un tipo que no exista. El administrador conserva su valor. La policy no cambia
-- (no se rompe el reporte de turno de los operativos).
--
-- Idempotente: create or replace + drop trigger if exists.

create or replace function incidencias_puntos_desde_catalogo()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_puntos numeric;
begin
  if private.app_es_admin() then
    return new;
  end if;
  select puntos_default into v_puntos
    from incidencia_tipos
   where tipo = new.tipo and activo;
  if not found then
    raise exception 'DATO:ese tipo de incidencia no existe o está desactivado';
  end if;
  new.puntos_penalidad := v_puntos;
  return new;
end;
$fn$;

revoke execute on function incidencias_puntos_desde_catalogo() from public, anon, authenticated;

drop trigger if exists trg_incidencias_puntos_catalogo on incidencias;
create trigger trg_incidencias_puntos_catalogo
  before insert on incidencias
  for each row execute function incidencias_puntos_desde_catalogo();
