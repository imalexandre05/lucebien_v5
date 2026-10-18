-- 0151 — La tienda destino ve las prendas que le despachan (lucebien-tablero #43).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-tienda-ve-lo-que-le-despachan-design.md
-- Prueba: packages/db/pruebas/0151_tienda_ve_despachos.prueba.sql (escrita antes). Idempotente.
--
-- Solo cambia la LECTURA de prenda_pasada: además de admin, almacén y la sede de origen, ve la
-- prenda quien pertenece a la sede destino de su envío. No se amplía prenda_historial ni
-- pipeline_puntos (aislamiento) ni ninguna escritura. Pendiente de confirmar con el cliente.
create or replace function private.envio_es_de_mi_sede(p_envio uuid)
  returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select p_envio is not null and exists (
    select 1 from public.envios_prendas e
    where e.id = p_envio and e.sede_destino_cod in (select private.app_sedes())
  );
$$;
revoke execute on function private.envio_es_de_mi_sede(uuid) from public, anon;
grant  execute on function private.envio_es_de_mi_sede(uuid) to authenticated;

drop policy if exists pasada_select on prenda_pasada;
create policy pasada_select on prenda_pasada for select
  using (private.app_es_admin() or private.app_es_almacen()
         or sede_origen_cod in (select private.app_sedes())
         or private.envio_es_de_mi_sede(envio_id));
