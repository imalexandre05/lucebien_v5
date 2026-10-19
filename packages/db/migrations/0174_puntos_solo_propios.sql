-- 0174 — Los puntos del pipeline sólo los ven cada persona y el administrador.
-- Spec: docs/superpowers/specs/pipeline/2026-10-10-puntos-solo-propios-design.md (decisión 2 del dueño,
-- 10-oct-2026). Prueba: packages/db/pruebas/0174_puntos_solo_propios.prueba.sql (escrita antes).
-- AISLAMIENTO (no-negociable 3). Idempotente. La escritura no cambia: sólo por RPC (0115).
--
-- Antes: dos policies de lectura permisivas (puntos_sel 0115 y puntos_select 0122) dejaban leer los
-- puntos de cualquier prenda de una sede del lector y, por app_es_almacen(), de todas las sedes al
-- almacén y al confeccionista. pipeline_ranking_hoy() devolvía el top 10 del día de todos.

drop policy if exists puntos_select on public.pipeline_puntos;
drop policy if exists puntos_sel    on public.pipeline_puntos;
create policy puntos_sel on public.pipeline_puntos for select
  using (private.app_es_admin() or empleado_id = auth.uid());

-- Misma firma y mismo cuerpo que la 0011 (revocado a anon en la 0018), más el filtro por persona.
create or replace function public.pipeline_ranking_hoy()
  returns table(nombre text, total numeric, acciones bigint)
  language sql stable security definer set search_path = public
as $$
  select e.nombre, sum(pp.puntos)::numeric as total, count(*)::bigint as acciones
  from pipeline_puntos pp
  join empleados e on e.id = pp.empleado_id
  where pp.fecha >= (date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima')
    and pp.puntos > 0
    and (private.app_es_admin() or pp.empleado_id = auth.uid())
  group by e.id, e.nombre
  order by total desc
  limit 10;
$$;
revoke execute on function public.pipeline_ranking_hoy() from public, anon;
grant  execute on function public.pipeline_ranking_hoy() to authenticated;
