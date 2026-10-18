-- 0156 — Anular un envío equivocado (lucebien-tablero #39, bloque «Envíos»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-anular-envio-design.md
-- Prueba: packages/db/pruebas/0156_anular_envio.prueba.sql (escrita antes). Idempotente.
--
-- La prenda en «enviado» vuelve a «listo» sin envío; el envío no se borra: queda «anulado» cuando
-- ya no tiene prendas. Motivo obligatorio (3..500 letras, mismo criterio que la 0154: defaults de
-- la RPC anotados en docs/pendientes-negocio.md). Lo anula quien tiene acceso por sede de origen
-- (pipeline_exigir_acceso), nunca la tienda destino. Una sola firma, sin execute para anon.
create or replace function public.pipeline_anular_envio(p_id uuid, p_motivo text default null, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid; v_motivo text;
  v_etapa text; v_envio uuid; v_activo_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'MOTIVO: escribe por qué se anula el envío (entre 3 y 500 letras)';
  end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  select etapa, envio_id, activo_id into v_etapa, v_envio, v_activo_id
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'enviado' or v_envio is null then
    raise exception 'TRANSICION: sólo se anula el envío de una prenda que la tienda aún no calificó';
  end if;

  update prenda_pasada set etapa = 'listo', envio_id = null, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, 'enviado', 'listo', v_actor,
    'Envío ' || substr(v_envio::text, 1, 8) || ' anulado: ' || v_motivo);
  if not exists (select 1 from prenda_pasada where envio_id = v_envio) then
    update envios_prendas set estado = 'anulado' where id = v_envio;
  end if;
  -- El envío había dejado disponible al activo; vuelve al taller (si ya cambió de estado, no se toca).
  if v_activo_id is not null then
    update inventario_activo set estado = 'en_pipeline' where id = v_activo_id and estado = 'disponible';
  end if;
end;
$$;
revoke execute on function public.pipeline_anular_envio(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_anular_envio(uuid, text, uuid) to authenticated;
