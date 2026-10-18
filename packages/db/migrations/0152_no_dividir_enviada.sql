-- 0152 — No se divide una prenda ya enviada o recibida (lucebien-tablero #39, bloque «Dividir»).
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-no-dividir-enviada-design.md
-- Prueba: packages/db/pruebas/0152_no_dividir_enviada.prueba.sql (escrita antes). Idempotente.
-- Mismo cuerpo que la 0128 más la guarda de etapa.
create or replace function public.pipeline_dividir(p_id uuid, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_pr prenda_pasada;
  v_saco uuid; v_pant uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — sin esto dos sesiones creaban 4 hijas y dejaban 2 huérfanas.
  select * into v_pr from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_pr.dividida then raise exception 'Esta prenda ya fue dividida'; end if;
  -- 0152: lo despachado ya no es del taller; las hijas nacerían sin envío y la tienda no las vería.
  if v_pr.etapa not in ('recepcion', 'codificacion', 'lavado', 'empatado', 'refaccion', 'compostura',
                        'planchado', 'control_calidad', 'listo') then
    raise exception 'TRANSICION: no se puede dividir una prenda en etapa "%"', v_pr.etapa;
  end if;

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-S', 'Saco', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_saco;
  perform private.prenda_historial_registrar(v_saco, null, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo);

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_pant;
  perform private.prenda_historial_registrar(v_pant, null, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo);

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  perform private.prenda_historial_registrar(p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón');
end;
$$;

revoke execute on function public.pipeline_dividir(uuid, uuid) from public, anon;
grant  execute on function public.pipeline_dividir(uuid, uuid) to authenticated;
