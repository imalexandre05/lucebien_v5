-- 0154 — Rechazar en control de calidad exige un motivo (lucebien-tablero #39, bloque «Rechazar»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-rechazar-con-motivo-design.md
-- Prueba: packages/db/pruebas/0154_rechazar_motivo.prueba.sql (escrita antes). Idempotente.
-- Mismo cuerpo que la 0140 más el motivo (obligatorio, 3..500 letras: defaults de la RPC, anotados
-- en docs/pendientes-negocio.md), que se guarda en obs_calidad y en el historial. Una sola firma.
drop function if exists public.pipeline_rechazar(uuid, text, uuid);
create or replace function pipeline_rechazar(p_id uuid, p_destino text, p_operador uuid default null,
                                             p_motivo text default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_codigo text; v_motivo text;
  v_culpable uuid; v_pts numeric; v_hist uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  -- 0154: sin motivo no se rechaza (largo 3..500, defaults de la RPC a confirmar con el dueño).
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'MOTIVO: escribe por qué se rechaza la prenda (entre 3 y 500 letras)';
  end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  select etapa, codigo into v_etapa, v_codigo
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  -- H-7 (igual que la 0122 y la 0112): sólo lo que ofrece la pantalla. Cierra también el doble
  -- rechazo: tras el primero la prenda ya no está en control_calidad.
  if v_etapa <> 'control_calidad'
     or p_destino is null
     or not (p_destino = any(array['recepcion','lavado','empatado','refaccion','compostura','planchado'])) then
    raise exception 'TRANSICION: sólo se rechaza desde control de calidad hacia una etapa anterior';
  end if;

  select empleado_id into v_culpable from prenda_historial
    where pasada_id = p_id and etapa_anterior = p_destino and empleado_id is not null
    order by fecha desc limit 1;

  update prenda_pasada set etapa = p_destino, aprobada = false, obs_calidad = v_motivo, fecha_actualizado = now() where id = p_id;
  v_hist := private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino || ': ' || v_motivo);

  if v_culpable is not null then
    -- 0140: pierde TODOS los puntos de ese trabajo: lo que esa persona cobró en esa etapa para esta
    -- prenda (o su madre, si es hija de dividir), menos lo ya descontado por rechazos anteriores.
    -- Así el neto del trabajo queda en 0, sin depender del peso actual (`pts_*`) ni de si es media prenda.
    select coalesce(sum(pp.puntos), 0) into v_pts
      from pipeline_puntos pp
     where pp.empleado_id = v_culpable
       and pp.etapa in (p_destino, p_destino || '_rechazo')
       and pp.pasada_id in (
         -- la familia: la prenda, su madre y todas las hijas de esa madre (hermanas incluidas), para que
         -- los rechazos de una hermana cuenten y el culpable nunca quede bajo 0
         select p_id
         union
         select m.id from prenda_pasada m where m.dividida and m.dividida_en like '%' || p_id::text || '%'
         union
         select h.id from prenda_pasada m join prenda_pasada h on m.dividida_en like '%' || h.id::text || '%'
          where m.dividida and m.dividida_en like '%' || p_id::text || '%');
    if v_pts > 0 then
      perform private.pipeline_registrar_punto(v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino || '; pierde ' || v_pts || ' pts', v_hist);
    end if;
  end if;
end;
$$;

revoke execute on function public.pipeline_rechazar(uuid, text, uuid, text) from public, anon;
grant  execute on function public.pipeline_rechazar(uuid, text, uuid, text) to authenticated;
