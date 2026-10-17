-- 0130_retrabajo_no_paga.sql — una etapa ya pagada para una prenda no vuelve a pagarse.
--
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-retrabajo-no-paga-design.md (decisión del dueño,
-- 13-oct-2026). Prueba: packages/db/pruebas/0130_retrabajo_no_paga.prueba.sql
--
-- Hoy una prenda observada en tienda vuelve a una etapa y al re-avanzarla se pagan otra vez los
-- puntos (+7 por ciclo). Se corrige en el único camino de escritura de puntos positivos del avance:
-- private.pipeline_registrar_punto devuelve null (sin insertar) si la prenda ya tiene un punto
-- positivo en esa etapa; pipeline_avanzar ya trata null como «avanza pero no cobra».
--
-- Deshacer borra el punto de su movimiento, así que re-avanzar tras deshacer sí paga (una vez).
-- La penalización por rechazo (etapa `<etapa>_rechazo`, negativa) no cuenta como pago y reabre la etapa.
--
-- `create or replace` con la misma firma de la 0115. Conserva H-4, security definer, search_path y
-- grants. Idempotente. No agrega ningún parámetro de negocio.

create or replace function private.pipeline_registrar_punto(
  p_empleado uuid, p_pasada uuid, p_etapa text, p_puntos numeric, p_detalle text, p_historial uuid default null)
  returns uuid language plpgsql volatile security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  -- H-4: sólo cobra (o se descuenta) quien tiene rol de pipeline. Sin rol → no se escribe nada.
  if not exists (
    select 1 from public.empleados e
    where e.id = p_empleado and e.rol in ('admin', 'dueno', 'encargado_almacen', 'confeccionista')
  ) then
    return null;
  end if;
  -- 0130: el retrabajo no paga. Una etapa ya pagada para esta prenda (o para su madre, si es una hija
  -- de dividir) no se vuelve a pagar. Un `<etapa>_rechazo` posterior al pago devuelve la etapa a
  -- «sin pagar»: el rechazo de calidad queda como antes (decisión del dueño pendiente).
  if p_puntos > 0 and exists (
    select 1 from public.pipeline_puntos pp
    where pp.etapa = p_etapa and pp.puntos > 0
      and pp.pasada_id in (
        select p_pasada
        union
        select m.id from public.prenda_pasada m
         where m.dividida and m.dividida_en like '%' || p_pasada::text || '%')
      and not exists (
        select 1 from public.pipeline_puntos r
        where r.etapa = p_etapa || '_rechazo' and r.fecha >= pp.fecha
          and r.pasada_id in (
            select p_pasada
            union
            select m.id from public.prenda_pasada m
             where m.dividida and m.dividida_en like '%' || p_pasada::text || '%'))
  ) then
    return null;
  end if;
  insert into public.pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha, historial_id)
    values (p_empleado, p_pasada, p_etapa, p_puntos, p_detalle, now(), p_historial)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) from public, anon;
grant  execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) to authenticated;
