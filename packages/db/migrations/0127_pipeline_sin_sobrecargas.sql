-- 0127 — Las RPC del pipeline sin sobrecargas.
-- Spec: docs/superpowers/specs/pipeline/2026-10-07-pipeline-sin-sobrecargas-design.md
--
-- La 0122 recrea las RPC con la firma antigua (sin p_operador) y la 0112/0115 las dejaron con
-- `p_operador uuid default null`: en orden numérico quedaban las dos firmas, la llamada sin operador
-- era ambigua y la antigua saltaba el token de operador. Se quedan las versiones con p_operador.
-- Idempotente: `drop function if exists` no falla si ya no existen.

drop function if exists public.pipeline_avanzar(uuid, text);
drop function if exists public.pipeline_avanzar_tanda(uuid[], text);
drop function if exists public.pipeline_enviar(uuid, text);
drop function if exists public.pipeline_rechazar(uuid, text);
drop function if exists public.pipeline_deshacer(uuid, text);
drop function if exists public.pipeline_dividir(uuid);
drop function if exists public.pipeline_deshacer_division(uuid);
drop function if exists public.pipeline_calificar(uuid, boolean, text, text);

-- lavanderia_enviar: portero y definer de la 0122 + historial por prenda de la 0115 (spec, segunda colisión).
create or replace function public.lavanderia_enviar(
  p_sede text, p_tipo text, p_resp_inv text, p_resp_traslado text,
  p_generales jsonb default '{}'::jsonb, p_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
  v_item  jsonb;
  v_pasada uuid;
  v_etapa text;
  v_activo_id uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  -- Reemplaza al with check de listas_rw, que esta función deja de tener encima al ser definer.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes enviar a lavandería desde la sede %', p_sede;
  end if;

  insert into listas_lavanderia (
    sede_cod, tipo, fecha, resp_inv, resp_traslado,
    camisas, corbatas, michis, corbatones, porta_ternos, zapatos
  ) values (
    p_sede, p_tipo, now(), nullif(p_resp_inv, ''), nullif(p_resp_traslado, ''),
    coalesce((p_generales->>'camisas')::int, 0),
    coalesce((p_generales->>'corbatas')::int, 0),
    coalesce((p_generales->>'michis')::int, 0),
    coalesce((p_generales->>'corbatones')::int, 0),
    coalesce((p_generales->>'porta_ternos')::int, 0),
    coalesce((p_generales->>'zapatos')::int, 0)
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'cod', '') = '' then continue; end if;

    insert into lista_items (lista_id, cod, tipo, color, talla, obs, motivo)
    values (v_id, v_item->>'cod', v_item->>'tipo', v_item->>'color', v_item->>'talla',
            v_item->>'obs', v_item->>'motivo');

    -- Auto-insert al pipeline (mismo comportamiento que routes/lavanderia.js): refacción
    -- siempre a compostura; el resto entra a recepción salvo que la tienda marque el ítem.
    v_etapa := case
      when p_tipo = 'REF' or v_item->>'destino' = 'compostura' then 'compostura'
      else 'recepcion'
    end;

    select id into v_activo_id from inventario_activo where codigo = v_item->>'cod' limit 1;

    insert into prenda_pasada (
      activo_id, codigo, tipo, color, talla, sede_origen_cod, etapa, lista_lavanderia_id
    ) values (
      v_activo_id, v_item->>'cod', v_item->>'tipo', v_item->>'color', v_item->>'talla',
      p_sede, v_etapa, v_id
    ) returning id into v_pasada;

    -- prenda_historial usa empleado_id (uuid, ya migrado del pseudo-FK por nombre TEXT que
    -- describe CLAUDE.md) — v_actor es quien ejecuta el envío, no resp_traslado (nombre libre
    -- sin garantía de tener cuenta en el sistema). El id sale del propio insert: la búsqueda
    -- por (lista, código) de la 0066 elegía UNA prenda cuando el mismo código venía dos veces
    -- en la lista y dejaba a la otra sin historial (arreglo de la 0115).
    perform private.prenda_historial_registrar(v_pasada, null, v_etapa, v_actor,
      'Lista ' || v_id || coalesce(' · traslado: ' || nullif(p_resp_traslado, ''), ''));
  end loop;

  return v_id;
end;
$$;
