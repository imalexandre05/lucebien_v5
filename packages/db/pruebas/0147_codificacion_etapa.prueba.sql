-- Prueba de la migración 0147_codificacion_etapa.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-codificacion-como-etapa-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola: termina con una excepción
-- RESULTADO con un [ok]/[FALLA] por caso.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0147

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
  v_a text := 'P147A';
  e_cf uuid; p uuid;
  v_pts numeric; v_err text; v_n int; v_etapa text; v_def text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0147 Sede A');
  insert into empleados (cod, nombre, iniciales, rol) values ('P0147-CF', 'Prueba 0147 Confeccionista', 'CF', 'confeccionista') returning id into e_cf;
  select valor into v_def from config where clave = 'pts_codificacion';
  insert into config (clave, valor) values ('pts_recepcion','1'), ('pts_lavado_normal','1')
    on conflict (clave) do update set valor = excluded.valor;

  -- 1) El default sembrado es 1 (decidido por el dueño)
  if v_def = '1' then r := r || '[ok] caso 1: pts_codificacion sembrado en 1;';
  else r := r || format('[FALLA] caso 1: pts_codificacion=%s;', coalesce(v_def, 'null')); end if;

  -- 2) recepción → codificación → lavado, con historial y código de movimiento
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0147-1', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'codificacion'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'codificacion' then r := r || '[ok] caso 2a: recepción → codificación;';
  else r := r || format('[FALLA] caso 2a: err=%s etapa=%s;', v_err, v_etapa); end if;

  -- 3) Completar codificación con el peso por defecto (1): paga 1 punto
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'lavado');
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = p and etapa = 'codificacion' and puntos = 1;
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_etapa = 'lavado' and v_pts = 1 and v_n = 1 then r := r || '[ok] caso 3: codificación → lavado paga 1 punto;';
  else r := r || format('[FALLA] caso 3: etapa=%s pts=%s filas=%s;', v_etapa, v_pts, v_n); end if;
  select count(*) into v_n from prenda_historial where pasada_id = p and etapa_nueva in ('codificacion','lavado') and codigo_mov is not null;
  if v_n = 2 then r := r || '[ok] caso 3b: los dos movimientos tienen código MOV;';
  else r := r || format('[FALLA] caso 3b: movimientos con código=%s;', v_n); end if;

  -- 4) Peso editado: se paga ese peso
  update config set valor = '2' where clave = 'pts_codificacion';
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0147-2', 'Chaqueta', 'normal', v_a, 'codificacion') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'refaccion');
  perform pg_temp.dueno();
  if v_pts = 2 then r := r || '[ok] caso 4: con peso 2 se pagan 2 puntos;';
  else r := r || format('[FALLA] caso 4: pts=%s;', v_pts); end if;
  update config set valor = '0' where clave = 'pts_codificacion';
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0147-0', 'Chaqueta', 'normal', v_a, 'codificacion') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'lavado');
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = p and etapa = 'codificacion';
  if v_pts = 0 and v_n = 0 then r := r || '[ok] caso 4b: con peso 0 no se paga ni se escribe punto;';
  else r := r || format('[FALLA] caso 4b: pts=%s filas=%s;', v_pts, v_n); end if;
  update config set valor = '1' where clave = 'pts_codificacion';

  -- 5) Saltos no permitidos
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0147-3', 'Chaqueta', 'normal', v_a, 'codificacion') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'planchado'));
  perform pg_temp.dueno();
  if v_err like 'TRANSICION:%' then r := r || '[ok] caso 5a: codificación → planchado rechazado;';
  else r := r || format('[FALLA] caso 5a: %s;', v_err); end if;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0147-4', 'Chaqueta', 'normal', v_a, 'lavado') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', p, 'codificacion'));
  perform pg_temp.dueno();
  if v_err like 'TRANSICION:%' then r := r || '[ok] caso 5b: lavado → codificación rechazado;';
  else r := r || format('[FALLA] caso 5b: %s;', v_err); end if;

  -- 6) Deshacer el último avance vuelve a recepción
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0147-5', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  perform pg_temp.como(e_cf);
  perform pipeline_avanzar(p, 'codificacion');
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'recepcion'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'recepcion' then r := r || '[ok] caso 6: deshacer vuelve a recepción;';
  else r := r || format('[FALLA] caso 6: err=%s etapa=%s;', v_err, v_etapa); end if;

  raise exception 'RESULTADO 0147 --> %', r;
end $$;
