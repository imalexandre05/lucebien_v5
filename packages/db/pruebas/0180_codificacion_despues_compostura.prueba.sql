-- Prueba de la migración 0180_codificacion_despues_compostura.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-codificacion-despues-de-compostura-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola: termina con una excepción
-- RESULTADO con un [ok]/[FALLA] por caso.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0180

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
  v_a text := 'P180A';
  e_cf uuid; p uuid;
  v_pts numeric; v_err text; v_n int; v_etapa text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0180 Sede A');
  insert into empleados (cod, nombre, iniciales, rol) values ('P0180-CF', 'Prueba 0180 Confeccionista', 'CF', 'confeccionista') returning id into e_cf;
  insert into config (clave, valor) values ('pts_compostura','1'), ('pts_codificacion','1') on conflict (clave) do update set valor = excluded.valor;

  -- 1) compostura → codificación → planchado, con puntos y movimientos con código
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0180-1', 'Chaqueta', 'normal', v_a, 'compostura') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'codificacion'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'codificacion' then r := r || '[ok] caso 1a: compostura → codificación;';
  else r := r || format('[FALLA] caso 1a: err=%s etapa=%s;', v_err, v_etapa); end if;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'planchado');
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  select count(*) into v_n from pipeline_puntos where pasada_id = p and etapa = 'codificacion' and puntos = 1;
  if v_etapa = 'planchado' and v_pts = 1 and v_n = 1 then r := r || '[ok] caso 1b: codificación → planchado paga 1 punto;';
  else r := r || format('[FALLA] caso 1b: etapa=%s pts=%s filas=%s;', v_etapa, v_pts, v_n); end if;
  select count(*) into v_n from prenda_historial where pasada_id = p and etapa_nueva in ('codificacion','planchado') and codigo_mov is not null;
  if v_n = 2 then r := r || '[ok] caso 1c: los dos movimientos tienen código MOV;';
  else r := r || format('[FALLA] caso 1c: movimientos con código=%s;', v_n); end if;

  -- 2) refacción → codificación (compostura saltada) funciona
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0180-2', 'Chaqueta', 'normal', v_a, 'refaccion') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'codificacion'));
  perform pg_temp.dueno();
  if v_err = 'ok' then r := r || '[ok] caso 2: refacción → codificación;';
  else r := r || format('[FALLA] caso 2: %s;', v_err); end if;

  -- 3) Ya no se llega desde recepción ni desde lavado; y codificación (sin historial viejo) no vuelve a lavado
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0180-3', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'codificacion'));
  perform pg_temp.dueno();
  if v_err like 'TRANSICION:%' then r := r || '[ok] caso 3a: recepción → codificación rechazado;';
  else r := r || format('[FALLA] caso 3a: %s;', v_err); end if;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0180-4', 'Chaqueta', 'normal', v_a, 'lavado') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'codificacion'));
  perform pg_temp.dueno();
  if v_err like 'TRANSICION:%' then r := r || '[ok] caso 3b: lavado → codificación rechazado;';
  else r := r || format('[FALLA] caso 3b: %s;', v_err); end if;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0180-5', 'Chaqueta', 'normal', v_a, 'codificacion') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'lavado'));
  perform pg_temp.dueno();
  if v_err like 'TRANSICION:%' then r := r || '[ok] caso 3c: codificación → lavado rechazado (sin historial viejo);';
  else r := r || format('[FALLA] caso 3c: %s;', v_err); end if;

  -- 4) Prenda que entró a codificación con el orden viejo (recepción → codificación) conserva su salida
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0180-6', 'Chaqueta', 'normal', v_a, 'codificacion') returning id into p;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva) values (p, 'recepcion', 'codificacion');
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'lavado'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'lavado' then r := r || '[ok] caso 4: la prenda del orden viejo sale a lavado;';
  else r := r || format('[FALLA] caso 4: err=%s etapa=%s;', v_err, v_etapa); end if;

  -- 5) Deshacer vuelve a compostura
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0180-7', 'Chaqueta', 'normal', v_a, 'compostura') returning id into p;
  perform pg_temp.como(e_cf);
  perform pipeline_avanzar(p, 'codificacion');
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'compostura'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'compostura' then r := r || '[ok] caso 5: deshacer vuelve a compostura;';
  else r := r || format('[FALLA] caso 5: err=%s etapa=%s;', v_err, v_etapa); end if;

  raise exception 'RESULTADO 0180 --> %', r;
end $$;
