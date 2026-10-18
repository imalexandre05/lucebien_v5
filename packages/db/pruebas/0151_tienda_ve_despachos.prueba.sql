-- Prueba de la migración 0151_tienda_ve_despachos.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-tienda-ve-lo-que-le-despachan-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0151

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
create or replace function pg_temp.ve(p_uid uuid, p_cod text) returns int language plpgsql as $f$
declare n int;
begin
  perform pg_temp.como(p_uid);
  select count(*) into n from prenda_pasada where codigo = p_cod;
  perform pg_temp.dueno();
  return n;
end $f$;

create or replace function pg_temp.ve_vista(p_uid uuid, p_cod text) returns int language plpgsql as $f$
declare n int;
begin
  perform pg_temp.como(p_uid);
  select count(*) into n from prendas_despachadas where codigo = p_cod;
  perform pg_temp.dueno();
  return n;
end $f$;

do $$
declare
  r text := '';
  sa text := 'P151A'; sb text := 'P151B'; sc text := 'P151C';
  ea uuid; eb uuid; ec uuid; e_hist uuid;
  env_ab uuid; env_ac uuid;
  p_ab uuid; p_ac uuid; p_proc uuid; p_obs uuid;
  v_err text; v_n int; v_n2 int; v_etapa text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (sa,'P151 A'), (sb,'P151 B'), (sc,'P151 C');
  insert into empleados (cod,nombre,iniciales,rol,sede_cod) values ('P151-A','P151 Enc A','EA','encargado_tienda',sa) returning id into ea;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod) values ('P151-B','P151 Enc B','EB','encargado_tienda',sb) returning id into eb;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod) values ('P151-C','P151 Enc C','EC','encargado_tienda',sc) returning id into ec;
  insert into envios_prendas (sede_destino_cod, estado) values (sb, 'enviado') returning id into env_ab;
  insert into envios_prendas (sede_destino_cod, estado) values (sc, 'enviado') returning id into env_ac;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P151-AB','Saco',sa,'enviado',env_ab) returning id into p_ab;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P151-AC','Saco',sa,'enviado',env_ac) returning id into p_ac;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P151-PROC','Saco',sa,'lavado') returning id into p_proc;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P151-OBS','Saco',sa,'lavado',null) returning id into p_obs;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs) values (p_ab,'listo','enviado',ea,'Envío x');
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha) values (ea, p_ab, 'planchado', 1, 'prueba', now());

  -- 1) Destino ve lo despachado en la vista; la tabla no le deja leer la fila
  if pg_temp.ve_vista(eb,'P151-AB') = 1 then r := r || '[ok] caso 1a: la tienda destino ve la prenda despachada en la vista;';
  else r := r || '[FALLA] caso 1a;'; end if;
  if pg_temp.ve(eb,'P151-AB') = 0 then r := r || '[ok] caso 4: la tabla no le deja a B leer la fila completa;';
  else r := r || '[FALLA] caso 4: B lee la fila de prenda_pasada;'; end if;
  if pg_temp.ve(ea,'P151-AB') = 1 and pg_temp.ve(ea,'P151-PROC') = 1 then r := r || '[ok] caso 1b: el origen sigue viendo lo suyo en la tabla;';
  else r := r || '[FALLA] caso 1b;'; end if;

  -- 2) No ve lo que sigue en proceso ni lo enviado a otra tienda; C no ve A→B
  if pg_temp.ve_vista(eb,'P151-PROC') = 0 and pg_temp.ve_vista(eb,'P151-AC') = 0 then r := r || '[ok] caso 2: B no ve prendas en proceso ni enviadas a otra tienda;';
  else r := r || '[FALLA] caso 2;'; end if;
  if pg_temp.ve_vista(ec,'P151-AB') = 0 and pg_temp.ve_vista(ec,'P151-PROC') = 0 and pg_temp.ve_vista(ec,'P151-AC') = 1 then r := r || '[ok] caso 2b: una tienda solo ve sus envíos;';
  else r := r || '[FALLA] caso 2b;'; end if;

  -- 3) Observada (envio_id null) no está en la vista
  if pg_temp.ve_vista(eb,'P151-OBS') = 0 and pg_temp.ve_vista(ea,'P151-OBS') = 0 then r := r || '[ok] caso 3a: una prenda observada (sin envío) no está en la vista;';
  else r := r || '[FALLA] caso 3a;'; end if;

  -- 5a) Columnas limitadas
  select count(*) into v_n from information_schema.columns
    where table_schema = 'public' and table_name = 'prendas_despachadas'
      and (column_name in ('lavador_id','planchador_id','pedido_id') or column_name like 'obs%');
  if v_n = 0 then r := r || '[ok] caso 5: la vista no expone lavador, planchador, pedido ni observaciones;';
  else r := r || format('[FALLA] caso 5: columnas sensibles=%s;', v_n); end if;
  -- anon no lee la vista
  v_err := pg_temp.mensaje('set local role anon; select count(*) from prendas_despachadas');
  perform pg_temp.dueno();
  if v_err like '%permission denied%' then r := r || '[ok] caso 8: anon no puede leer la vista;';
  else r := r || format('[FALLA] caso 8: %s;', v_err); end if;

  -- 5) B no gana permisos de escritura
  perform pg_temp.como(eb);
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p_ab));
  v_n := (select count(*) from (select 1) x);
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p_ab;
  if v_err like '%no encontrada%' and v_etapa = 'enviado' then r := r || '[ok] caso 5a: B no puede dividir una prenda que solo le despacharon;';
  else r := r || format('[FALLA] caso 5a: %s %s;', v_err, v_etapa); end if;
  perform pg_temp.como(eb);
  v_err := pg_temp.mensaje(format('update prenda_pasada set etapa = ''listo'' where id = %L', p_ab));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p_ab;
  if v_etapa = 'enviado' then r := r || '[ok] caso 5b: B no puede actualizar directo;';
  else r := r || '[FALLA] caso 5b;'; end if;

  -- 6) B no ve historial ni puntos de la prenda
  perform pg_temp.como(eb);
  select count(*) into v_n from prenda_historial where pasada_id = p_ab;
  select count(*) into v_n2 from pipeline_puntos where pasada_id = p_ab;
  perform pg_temp.dueno();
  if v_n = 0 and v_n2 = 0 then r := r || '[ok] caso 6: B no ve historial ni puntos;';
  else r := r || format('[FALLA] caso 6: historial=%s puntos=%s;', v_n, v_n2); end if;

  -- 7) B califica y la sigue viendo como recibida
  perform pg_temp.como(eb);
  v_err := pg_temp.mensaje(format('select pipeline_calificar(%L, true, null, null)', p_ab));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p_ab;
  if v_err = 'ok' and v_etapa = 'recibido' and pg_temp.ve_vista(eb,'P151-AB') = 1 then r := r || '[ok] caso 3b/7: B califica y la prenda recibida sigue en la vista;';
  else r := r || format('[FALLA] caso 7: %s %s;', v_err, v_etapa); end if;

  raise exception 'RESULTADO 0151 --> %', r;
end $$;
