-- Prueba de la migración 0156_anular_envio.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-anular-envio-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0156

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
  v_a text := 'P156A'; v_b text := 'P156B'; v_c text := 'P156C';
  e_alm uuid; e_tb uuid; e_eq uuid;
  env uuid; p uuid; p2 uuid; p3 uuid; p4 uuid; act uuid; act2 uuid;
  v_err text; v_etapa text; v_envio uuid; v_est text; v_hobs text; v_n int; v_ae text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a,'P156 A'),(v_b,'P156 B'),(v_c,'P156 C');
  insert into empleados (cod,nombre,iniciales,rol) values ('P156-AL','P156 Almacen','AL','encargado_almacen') returning id into e_alm;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod) values ('P156-TB','P156 Tienda B','TB','encargado_tienda',v_b) returning id into e_tb;
  insert into empleados (cod,nombre,iniciales,rol,cuenta_compartida) values ('P156-EQ','P156 Equipo','EQ','encargado_almacen',true) returning id into e_eq;
  insert into inventario_activo (codigo, tipo, estado) values ('P156-TN1','TN','disponible') returning id into act;
  insert into inventario_activo (codigo, tipo, estado) values ('P156-TN2','TN','alquilado') returning id into act2;
  insert into envios_prendas (sede_destino_cod, estado) values (v_b, 'enviado') returning id into env;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id,activo_id,aprobada) values ('P156-1','Saco',v_a,'enviado',env,act,true) returning id into p;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id,activo_id,aprobada) values ('P156-2','Saco',v_a,'enviado',env,act2,true) returning id into p2;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P156-3','Saco',v_a,'recibido',env) returning id into p3;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P156-4','Saco',v_a,'enviado',env) returning id into p4;

  -- 2) sin motivo / corto
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_anular_envio(%L)', p));
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_anular_envio(%L, %L)', p, 'ab'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err like '%MOTIVO:%/%MOTIVO:%' and v_etapa = 'enviado' then r := r || '[ok] caso 2: sin motivo o con motivo corto no se anula;';
  else r := r || format('[FALLA] caso 2: %s %s;', v_err, v_etapa); end if;

  -- 4) la tienda destino no puede anular
  perform pg_temp.como(e_tb);
  v_err := pg_temp.mensaje(format('select pipeline_anular_envio(%L, %L)', p, 'Me lo enviaron mal'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err like '%no encontrada%' and v_etapa = 'enviado' then r := r || '[ok] caso 4: la tienda destino no puede anular;';
  else r := r || format('[FALLA] caso 4: %s %s;', v_err, v_etapa); end if;

  -- 3) ya recibida
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_anular_envio(%L, %L)', p3, 'Error de tienda'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p3;
  if v_err like 'TRANSICION:%' and v_etapa = 'recibido' then r := r || '[ok] caso 3: una prenda ya recibida no se anula;';
  else r := r || format('[FALLA] caso 3: %s %s;', v_err, v_etapa); end if;

  -- 1) anular con motivo
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_anular_envio(%L, %L)', p, 'Prenda equivocada, era otro terno'));
  perform pg_temp.dueno();
  select etapa, envio_id into v_etapa, v_envio from prenda_pasada where id = p;
  select estado into v_est from envios_prendas where id = env;
  select obs into v_hobs from prenda_historial where pasada_id = p order by fecha desc limit 1;
  if v_err = 'ok' and v_etapa = 'listo' and v_envio is null and v_hobs like '%anulado: Prenda equivocada, era otro terno' then
    r := r || '[ok] caso 1: la prenda vuelve a listo, sin envío, y el historial dice por qué;';
  else r := r || format('[FALLA] caso 1: %s %s envio=%s hobs=%s;', v_err, v_etapa, v_envio, v_hobs); end if;
  -- el envío compartido por p2/p4 sigue 'enviado' porque aún tiene prendas; si no tuviera, quedaría anulado
  if v_est = 'enviado' then r := r || '[ok] caso 1b: un envío con otras prendas pendientes sigue vigente;';
  else r := r || format('[FALLA] caso 1b: estado=%s;', v_est); end if;

  -- 5) activo: disponible → en_pipeline; alquilado no se toca
  select estado into v_ae from inventario_activo where id = act;
  perform pg_temp.como(e_alm);
  perform pipeline_anular_envio(p2, 'Se envió a la tienda equivocada');
  perform pg_temp.dueno();
  if v_ae = 'en_pipeline' and (select estado from inventario_activo where id = act2) = 'alquilado' then
    r := r || '[ok] caso 5: el activo disponible vuelve a en_pipeline y el alquilado no se toca;';
  else r := r || format('[FALLA] caso 5: act=%s act2=%s;', v_ae, (select estado from inventario_activo where id = act2)); end if;

  -- anular la última prenda pendiente deja el envío en estado anulado
  perform pg_temp.como(e_alm);
  perform pipeline_anular_envio(p4, 'Envío duplicado por error');
  perform pg_temp.dueno();
  select estado into v_est from envios_prendas where id = env;
  -- (p3 está recibida y conserva el envío: el envío sigue vigente)
  if v_est = 'enviado' then r := r || '[ok] caso 1c: el envío con una prenda ya recibida no se marca anulado;';
  else r := r || format('[FALLA] caso 1c: estado=%s;', v_est); end if;

  -- 7) se puede volver a enviar a otra tienda
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_enviar(%L, %L)', p, v_c));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'enviado' then r := r || '[ok] caso 7: tras anular se puede enviar a otra tienda;';
  else r := r || format('[FALLA] caso 7: %s %s;', v_err, v_etapa); end if;

  -- 6) cuenta compartida sin token; firma única; sin anon
  perform pg_temp.dueno();
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa,envio_id) values ('P156-5','Saco',v_a,'enviado',env) returning id into p3;
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select pipeline_anular_envio(%L, %L)', p3, 'Prueba de cuenta compartida'));
  perform pg_temp.dueno();
  if v_err like 'CODIGO:%' then r := r || '[ok] caso 6a: cuenta compartida sin token pide código;'; else r := r || format('[FALLA] caso 6a: %s;', v_err); end if;
  select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = 'public' and pr.proname = 'pipeline_anular_envio';
  if v_n = 1 and not exists (select 1 from pg_proc pr where pr.proname = 'pipeline_anular_envio' and has_function_privilege('anon', pr.oid, 'execute'))
  then r := r || '[ok] caso 6b: una sola firma y sin execute para anon;'; else r := r || format('[FALLA] caso 6b: firmas=%s;', v_n); end if;

  raise exception 'RESULTADO 0156 --> %', r;
end $$;
