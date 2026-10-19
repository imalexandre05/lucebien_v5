-- Prueba de la migración 0181_recepcion_en_tienda.sql (auditoría 1, no-negociable 2).
-- Escrita ANTES que la migración. Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0181

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
create or replace function pg_temp.filas(p_sql text) returns text language plpgsql as $f$
declare n int;
begin execute p_sql; get diagnostics n = row_count; return n::text;
exception when others then raise notice '%', sqlerrm; return 'error'; end $f$;

create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  r text := '';
  e_alm uuid; e_a uuid; e_b uuid; e_adm uuid; p1 uuid; p2 uuid; p3 uuid; v_n int; v_err text; v_etapa text; v_cal uuid;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values ('P181A', 'P0181 Tienda A'), ('P181B', 'P0181 Tienda B'), ('P181X', 'P0181 Almacen');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P181-AL','Prueba 0181 Almacen','AL','encargado_almacen','P181X') returning id into e_alm;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P181-A','Prueba 0181 Tienda A','TA','encargado_tienda','P181A') returning id into e_a;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P181-B','Prueba 0181 Tienda B','TB','encargado_tienda','P181B') returning id into e_b;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P181-AD','Prueba 0181 Admin','AD','admin','P181X') returning id into e_adm;
  delete from config where clave in ('codigo_siempre');
  insert into config (clave, valor) values ('codigo_siempre', 'false');
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P181-1','Saco','P181X','listo') returning id into p1;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P181-2','Saco','P181X','listo') returning id into p2;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P181-3','Saco','P181X','listo') returning id into p3;
  perform pg_temp.como(e_adm);
  perform pipeline_enviar_tanda(array[p1, p2], 'P181A', null);
  perform pipeline_enviar(p3, 'P181B', null);
  perform pg_temp.dueno();

  -- 1) almacén no ve los despachos ni califica
  perform pg_temp.como(e_alm);
  select count(*) into v_n from prendas_despachadas where codigo like 'P181-%';
  v_err := pg_temp.mensaje(format('select pipeline_calificar(%L, true, %L, %L, null)', p1, '', ''));
  perform pg_temp.dueno();
  if v_n = 0 and v_err like '%no encontrada%' then r := r || '[ok] caso 1: almacén ni ve ni califica;';
  else r := r || format('[FALLA] caso 1: ve=%s err=%s;', v_n, v_err); end if;

  -- 2) otra tienda no califica lo de A
  perform pg_temp.como(e_b);
  v_err := pg_temp.mensaje(format('select pipeline_calificar(%L, true, %L, %L, null)', p1, '', ''));
  select count(*) into v_n from prendas_despachadas where codigo in ('P181-1','P181-2');
  perform pg_temp.dueno();
  if v_n = 0 and v_err like '%no encontrada%' then r := r || '[ok] caso 2: otra tienda no ve ni califica;';
  else r := r || format('[FALLA] caso 2: ve=%s err=%s;', v_n, v_err); end if;

  -- 3) devolver sin nota → MOTIVO; con nota a codificación → vuelve, queda la nota y el dueño
  perform pg_temp.como(e_a);
  v_err := pg_temp.mensaje(format('select pipeline_calificar(%L, false, %L, %L, null)', p1, 'lavado', ''));
  if v_err like 'MOTIVO:%' then r := r || '[ok] caso 3a: devolver exige nota;';
  else r := r || format('[FALLA] caso 3a: %s;', v_err); end if;
  v_err := pg_temp.mensaje(format('select pipeline_calificar(%L, false, %L, %L, null)', p1, 'codificacion', 'mancha, regresar a lavado'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p1;
  select count(*) into v_n from prenda_historial where pasada_id = p1 and empleado_id = e_a and etapa_nueva = 'codificacion' and obs like '%mancha%';
  if v_err = 'ok' and v_etapa = 'codificacion' and v_n = 1 then r := r || '[ok] caso 3b: devuelta a codificación con nota a nombre de quien califica;';
  else r := r || format('[FALLA] caso 3b: err=%s etapa=%s hist=%s;', v_err, v_etapa, v_n); end if;
  if (select obs_calidad from prenda_pasada where id = p1) like '%mancha%' then r := r || '[ok] caso 3c: la nota queda como aviso;';
  else r := r || '[FALLA] caso 3c;'; end if;

  -- 4) tanda atómica: una ajena aborta todas
  perform pg_temp.como(e_a);
  v_err := pg_temp.mensaje(format('select pipeline_calificar_tanda(array[%L, %L]::uuid[], true, %L, %L, null)', p2, p3, '', ''));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where id in (p2, p3) and etapa = 'enviado';
  if v_err <> 'ok' and v_n = 2 then r := r || '[ok] caso 4a: la tanda con una ajena no cambia nada;';
  else r := r || format('[FALLA] caso 4a: err=%s enviadas=%s;', v_err, v_n); end if;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P181-4','Saco','P181X','listo') returning id into p3;
  perform pg_temp.como(e_adm);
  perform pipeline_enviar(p3, 'P181A', null);
  perform pg_temp.como(e_a);
  v_err := pg_temp.mensaje(format('select pipeline_calificar_tanda(array[%L, %L]::uuid[], true, %L, %L, null)', p2, p3, '', ''));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where id in (p2, p3) and etapa = 'recibido';
  if v_err = 'ok' and v_n = 2 then r := r || '[ok] caso 4b: aceptar varias juntas;';
  else r := r || format('[FALLA] caso 4b: err=%s recibidas=%s;', v_err, v_n); end if;

  -- 5) el admin sí puede
  perform pg_temp.como(e_adm);
  v_err := pg_temp.mensaje(format('select pipeline_calificar(%L, false, %L, %L, null)', (select id from prenda_pasada where codigo = 'P181-3'), 'planchado', 'revisar plancha'));
  perform pg_temp.dueno();
  if v_err = 'ok' then r := r || '[ok] caso 5: admin califica;';
  else r := r || format('[FALLA] caso 5: %s;', v_err); end if;

  raise exception 'RESULTADO 0181 --> %', r;
end $$;
