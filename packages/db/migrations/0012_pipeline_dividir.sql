-- 0012_pipeline_dividir.sql — "Dividir terno" del tablero: parte un terno en dos prendas
-- hijas (Saco '-S' y Pantalón '-P') que continúan el pipeline desde la MISMA etapa, y marca
-- el original como dividido (sale del tablero, conserva su historial). Las piezas son medias
-- prendas → valen ½ punto al avanzar (ya lo maneja pipeline_avanzar). Sin puntos por dividir.
-- Portado de routes/pipeline.js (POST /:id/dividir). RPC atómico, security invoker.
create or replace function pipeline_dividir(p_id uuid)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_pr prenda_pasada;
  v_saco uuid; v_pant uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select * into v_pr from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_pr.dividida then raise exception 'Esta prenda ya fue dividida'; end if;

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso, lista_lavanderia_id, obs_general)
    values (v_pr.codigo || '-S', 'Saco', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id, 'Dividido de terno ' || v_pr.codigo)
    returning id into v_saco;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    values (v_saco, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo);

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso, lista_lavanderia_id, obs_general)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id, 'Dividido de terno ' || v_pr.codigo)
    returning id into v_pant;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    values (v_pant, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo);

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón');
end;
$$;
revoke execute on function pipeline_dividir(uuid) from public;
grant execute on function pipeline_dividir(uuid) to authenticated;
