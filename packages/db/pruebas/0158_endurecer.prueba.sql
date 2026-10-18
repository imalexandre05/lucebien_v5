-- Prueba de la migración 0158_endurecer.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-endurecer-almacen-obs-activo-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0158

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  r text := '';
  v_a text := 'P158A'; v_b text := 'P158B';
  e_on uuid; e_off uuid; e_cf uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; act1 uuid; act2 uuid; act3 uuid;
  v_n int; v_b1 boolean; v_b2 int; v_obs text; v_obs2 text; v_prev text; v_est text; v_err text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a,'P158 A'),(v_b,'P158 B');
  insert into empleados (cod,nombre,iniciales,rol) values ('P158-ON','P158 Almacen activo','ON','encargado_almacen') returning id into e_on;
  insert into empleados (cod,nombre,iniciales,rol,activo) values ('P158-OF','P158 Almacen inactivo','OF','encargado_almacen',false) returning id into e_off;
  insert into empleados (cod,nombre,iniciales,rol) values ('P158-CF','P158 Confeccionista','CF','confeccionista') returning id into e_cf;
  insert into config (clave, valor) values ('pts_control_calidad','1'), ('pts_planchado','1') on conflict (clave) do update set valor = excluded.valor;
  insert into inventario_activo (codigo,tipo,estado) values ('P158-T1','TN','en_compostura') returning id into act1;
  insert into inventario_activo (codigo,tipo,estado) values ('P158-T2','TN','en_compostura') returning id into act2;
  insert into inventario_activo (codigo,tipo,estado) values ('P158-T3','TN','disponible') returning id into act3;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,activo_id,aprobada) values ('P158-1','Saco',v_a,'listo',act1,true) returning id into p1;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,activo_id,aprobada) values ('P158-2','Saco',v_a,'listo',act2,true) returning id into p2;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,obs_calidad) values ('P158-3','Saco',v_a,'control_calidad','mancha en la solapa') returning id into p3;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,obs_calidad) values ('P158-4','Saco',v_a,'planchado','mancha vieja') returning id into p4;

  -- 1) almacén inactivo
  perform pg_temp.como(e_off);
  select count(*) into v_n from prenda_pasada where codigo like 'P158-%';
  v_b1 := private.app_es_almacen();
  perform pg_temp.como(e_on);
  select count(*) into v_b2 from prenda_pasada where codigo like 'P158-%';
  perform pg_temp.dueno();
  if v_n = 0 and v_b1 = false and v_b2 = 4 then r := r || '[ok] caso 1: un almacén inactivo no ve nada y el activo sigue viendo lo suyo;';
  else r := r || format('[FALLA] caso 1: inactivo ve=%s es_almacen=%s activo ve=%s;', v_n, v_b1, v_b2); end if;

  -- 2) obs_calidad: se limpia solo al aprobar
  perform pg_temp.como(e_cf);
  perform pipeline_avanzar(p4, 'control_calidad');
  perform pipeline_avanzar(p3, 'listo');
  perform pg_temp.dueno();
  select obs_calidad into v_obs from prenda_pasada where id = p3;
  select obs_calidad into v_obs2 from prenda_pasada where id = p4;
  if v_obs is null and v_obs2 = 'mancha vieja' then r := r || '[ok] caso 2: aprobar limpia el aviso; avanzar a otra etapa no;';
  else r := r || format('[FALLA] caso 2: aprobada=%s otra=%s;', v_obs, v_obs2); end if;

  -- 3) activo vuelve a su estado previo
  perform pg_temp.como(e_on);
  perform pipeline_enviar(p1, v_b);
  perform pg_temp.dueno();
  select estado into v_est from inventario_activo where id = act1;
  select activo_estado_previo into v_prev from prenda_pasada where id = p1;
  if v_est = 'disponible' and v_prev = 'en_compostura' then r := r || '[ok] caso 3a: enviar guarda el estado previo del activo;';
  else r := r || format('[FALLA] caso 3a: activo=%s previo=%s;', v_est, v_prev); end if;
  perform pg_temp.como(e_on);
  perform pipeline_anular_envio(p1, 'Se envió a la tienda equivocada');
  perform pg_temp.dueno();
  select estado into v_est from inventario_activo where id = act1;
  select activo_estado_previo into v_prev from prenda_pasada where id = p1;
  if v_est = 'en_compostura' and v_prev is null then r := r || '[ok] caso 3b: anular devuelve el activo a en_compostura y limpia la columna;';
  else r := r || format('[FALLA] caso 3b: activo=%s previo=%s;', v_est, v_prev); end if;

  -- 4) activo ya cambiado: no se toca; sin estado guardado: en_pipeline
  perform pg_temp.como(e_on);
  perform pipeline_enviar(p2, v_b);
  perform pg_temp.dueno();
  update inventario_activo set estado = 'alquilado' where id = act2;
  perform pg_temp.como(e_on);
  perform pipeline_anular_envio(p2, 'Anulado por prueba');
  perform pg_temp.dueno();
  select estado into v_est from inventario_activo where id = act2;
  if v_est = 'alquilado' then r := r || '[ok] caso 4a: un activo que cambió de estado no se toca;';
  else r := r || format('[FALLA] caso 4a: %s;', v_est); end if;
  insert into envios_prendas (sede_destino_cod, estado) values (v_b,'enviado') returning id into p1;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id,activo_id,aprobada) values ('P158-5','Saco',v_a,'enviado',p1,act3,true) returning id into p2;
  perform pg_temp.como(e_on);
  v_err := pg_temp.mensaje(format('select pipeline_anular_envio(%L, %L)', p2, 'Sin estado guardado'));
  perform pg_temp.dueno();
  select estado into v_est from inventario_activo where id = act3;
  if v_err = 'ok' and v_est = 'en_pipeline' then r := r || '[ok] caso 4b: sin estado guardado vuelve a en_pipeline;';
  else r := r || format('[FALLA] caso 4b: %s %s;', v_err, v_est); end if;

  -- 4c) estado viejo: p3 pasa a tener estado previo 'codificando' de un envío anterior; el activo
  --     ahora está en otro estado; al reenviar el valor viejo se borra y anular no lo resucita
  perform pg_temp.dueno();
  update inventario_activo set estado = 'en_pipeline' where id = act3;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,activo_id,aprobada,activo_estado_previo)
    values ('P158-6','Saco',v_a,'listo',act3,true,'codificando') returning id into p4;
  perform pg_temp.como(e_on);
  perform pipeline_enviar(p4, v_b);
  perform pg_temp.dueno();
  select activo_estado_previo into v_prev from prenda_pasada where id = p4;
  if v_prev = 'en_pipeline' then r := r || '[ok] caso 4c: reenviar reemplaza el estado previo viejo;';
  else r := r || format('[FALLA] caso 4c: previo=%s;', v_prev); end if;
  update inventario_activo set estado = 'baja' where id = act3;
  update prenda_pasada set activo_estado_previo = 'codificando' where id = p4;
  update inventario_activo set estado = 'baja' where id = act3;
  perform pg_temp.dueno();
  -- 4d) activo que no estaba en el taller al enviar: el estado previo se borra
  update inventario_activo set estado = 'alquilado' where id = act3;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,activo_id,aprobada,activo_estado_previo)
    values ('P158-7','Saco',v_a,'listo',act3,true,'codificando') returning id into p4;
  perform pg_temp.como(e_on);
  perform pipeline_enviar(p4, v_b);
  perform pg_temp.dueno();
  select activo_estado_previo into v_prev from prenda_pasada where id = p4;
  if v_prev is null then r := r || '[ok] caso 4d: si el activo no estaba en el taller, no queda estado previo viejo;';
  else r := r || format('[FALLA] caso 4d: previo=%s;', v_prev); end if;

  -- 1b) un almacén inactivo tampoco puede operar
  perform pg_temp.como(e_off);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p4, 'lavado'));
  perform pg_temp.dueno();
  if v_err like '%no encontrada%' then r := r || '[ok] caso 1b: un almacén inactivo no puede operar;';
  else r := r || format('[FALLA] caso 1b: %s;', v_err); end if;

  -- 5) firmas únicas, sin anon
  select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname in ('pipeline_avanzar','pipeline_enviar','pipeline_anular_envio');
  if v_n = 3 and not exists (select 1 from pg_proc pr where pr.proname in ('pipeline_avanzar','pipeline_enviar','pipeline_anular_envio') and has_function_privilege('anon', pr.oid, 'execute'))
  then r := r || '[ok] caso 5: una firma por función y sin execute para anon;';
  else r := r || format('[FALLA] caso 5: firmas=%s;', v_n); end if;

  raise exception 'RESULTADO 0158 --> %', r;
end $$;
