-- 0175 — Envíos y calificaciones de prendas: se leen con RLS y se escriben sólo por RPC.
-- Prueba: packages/db/pruebas/0175_envios_solo_rpc.prueba.sql (escrita antes). Idempotente.
-- No-negociable 2 (todo avance de prenda pasa por una RPC). Auditoría 1, 19-oct-2026.
--
-- Antes: envios_rw y calif_rw (0006) eran FOR ALL. Un encargado podía marcar un envío como recibido
-- y validado, borrarlo, o insertar una calificación a nombre de otra persona con un update/insert
-- plano. Las escrituras legítimas ya van por RPC security definer (pipeline_enviar,
-- pipeline_enviar_tanda, pipeline_calificar, pipeline_anular_envio, lavanderia_enviar), que no
-- dependen de estas policies. La lectura queda con la misma condición de siempre.
--
-- prenda_pasada.pasada_insert NO se toca: lo usan pedido_crear/pedido_devolver (security invoker,
-- módulo comercial fuera de alcance). Queda anotado como pendiente.

drop policy if exists envios_rw  on public.envios_prendas;
drop policy if exists envios_sel on public.envios_prendas;
create policy envios_sel on public.envios_prendas for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_destino_cod in (select private.app_sedes()));
revoke insert, update, delete, truncate on public.envios_prendas from authenticated, anon;

drop policy if exists calif_rw  on public.prenda_calificacion;
drop policy if exists calif_sel on public.prenda_calificacion;
create policy calif_sel on public.prenda_calificacion for select
  using (
    private.app_es_admin() or private.app_es_almacen()
    or exists (select 1 from public.prenda_pasada p
               where p.id = prenda_calificacion.pasada_id and p.sede_origen_cod in (select private.app_sedes()))
    or exists (select 1 from public.envios_prendas e
               where e.id = prenda_calificacion.envio_id and e.sede_destino_cod in (select private.app_sedes()))
  );
revoke insert, update, delete, truncate on public.prenda_calificacion from authenticated, anon;
