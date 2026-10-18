-- 0151 — La tienda destino ve las prendas que le despachan (lucebien-tablero #43).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-tienda-ve-lo-que-le-despachan-design.md
-- Prueba: packages/db/pruebas/0151_tienda_ve_despachos.prueba.sql (escrita antes). Idempotente.
--
-- Decidido por el dueño (18-oct-2026): la tienda ve toda prenda que le fue enviada, sin importar por
-- qué sede entró, y SOLO esas. En vez de abrir la tabla prenda_pasada (que expone lavador,
-- planchador, pedido y observaciones internas), se entrega una VISTA con columnas limitadas. La vista
-- corre con los privilegios de su dueño; la visibilidad la fija su where: admin, almacén o sede
-- destino del envío en app_sedes() (la misma regla que envios_rw). pasada_select no cambia.
create or replace view public.prendas_despachadas with (security_barrier = true) as
select p.id, p.codigo, p.tipo, p.color, p.talla, p.sede_origen_cod, p.etapa, p.fecha_actualizado,
       e.id as envio_id, e.sede_destino_cod, e.fecha as fecha_envio, e.estado as estado_envio
from public.prenda_pasada p
join public.envios_prendas e on e.id = p.envio_id
where private.app_es_admin() or private.app_es_almacen()
   or e.sede_destino_cod in (select private.app_sedes());

-- Solo lectura: se quita todo (incluidos los privilegios por defecto de authenticated) y se da SELECT.
revoke all on public.prendas_despachadas from public, anon, authenticated;
grant select on public.prendas_despachadas to authenticated;
