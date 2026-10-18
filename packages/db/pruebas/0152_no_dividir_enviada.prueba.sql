-- Prueba de la migración 0152_no_dividir_enviada.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-no-dividir-enviada-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0152

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
  v_a text := 'P152A';
  e_alm uuid; env uuid; p_env uuid; p_rec uuid; p_lav uuid; p_lis uuid;
  v_err text; v_n int; v_hist int; v_hist2 int; v_etapa text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P152 A');
  insert into empleados (cod,nombre,iniciales,rol) values ('P152-AL','P152 Almacen','AL','encargado_almacen') returning id into e_alm;
  insert into envios_prendas (sede_destino_cod, estado) values (v_a, 'enviado') returning id into env;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P152-ENV','Terno completo',v_a,'enviado',env) returning id into p_env;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P152-REC','Terno completo',v_a,'recibido',env) returning id into p_rec;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P152-LAV','Terno completo',v_a,'lavado') returning id into p_lav;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P152-LIS','Terno completo',v_a,'listo') returning id into p_lis;

  -- 1) enviado
  select count(*) into v_hist from prenda_historial;
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p_env));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo like 'P152-ENV-%';
  select count(*) into v_hist2 from prenda_historial;
  select etapa into v_etapa from prenda_pasada where id = p_env;
  if v_err like 'TRANSICION:%' and v_n = 0 and v_hist2 = v_hist and v_etapa = 'enviado' then
    r := r || '[ok] caso 1: no se divide una prenda enviada y no se escribe nada;';
  else r := r || format('[FALLA] caso 1: %s hijas=%s etapa=%s;', v_err, v_n, v_etapa); end if;

  -- 2) recibido
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p_rec));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo like 'P152-REC-%';
  if v_err like 'TRANSICION:%' and v_n = 0 then r := r || '[ok] caso 2: tampoco una recibida;';
  else r := r || format('[FALLA] caso 2: %s %s;', v_err, v_n); end if;

  -- 3) lavado
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p_lav));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo like 'P152-LAV-%' and etapa = 'lavado';
  select etapa into v_etapa from prenda_pasada where id = p_lav;
  if v_err = 'ok' and v_n = 2 and v_etapa = 'dividido' then r := r || '[ok] caso 3: en lavado se divide en dos hijas;';
  else r := r || format('[FALLA] caso 3: %s hijas=%s etapa=%s;', v_err, v_n, v_etapa); end if;

  -- 4) listo (se conserva)
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p_lis));
  perform pg_temp.dueno();
  if v_err = 'ok' then r := r || '[ok] caso 4: una prenda lista aún no despachada se divide como hoy;';
  else r := r || format('[FALLA] caso 4: %s;', v_err); end if;

  -- 5) ya dividida
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p_lav));
  perform pg_temp.dueno();
  if v_err like '%ya fue dividida%' or v_err like 'TRANSICION:%' then r := r || '[ok] caso 5: una ya dividida se rechaza;';
  else r := r || format('[FALLA] caso 5: %s;', v_err); end if;

  raise exception 'RESULTADO 0152 --> %', r;
end $$;
