-- Prueba de la migración 0154_rechazar_motivo.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-rechazar-con-motivo-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0154

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
  v_a text := 'P154A';
  e_alm uuid; e_cf uuid; e_eq uuid; tok uuid; p uuid;
  v_err text; v_etapa text; v_obs text; v_hobs text; v_pts numeric; v_n int; v_actor uuid;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P154 A');
  insert into empleados (cod,nombre,iniciales,rol) values ('P154-AL','P154 Almacen','AL','encargado_almacen') returning id into e_alm;
  insert into empleados (cod,nombre,iniciales,rol) values ('P154-CF','P154 Confeccionista','CF','confeccionista') returning id into e_cf;
  insert into empleados (cod,nombre,iniciales,rol,cuenta_compartida) values ('P154-EQ','P154 Equipo','EQ','encargado_almacen',true) returning id into e_eq;
  insert into config (clave, valor) values ('pts_planchado','1') on conflict (clave) do update set valor = '1';
  insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('P154-1','Chaqueta','normal',v_a,'planchado') returning id into p;
  perform pg_temp.como(e_cf);
  perform pipeline_avanzar(p, 'control_calidad');
  perform pg_temp.dueno();

  -- 1) Sin motivo válido: no rechaza
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_rechazar(%L, %L)', p, 'planchado'));
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => %L)', p, 'planchado', ''));
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => %L)', p, 'planchado', '   '));
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => %L)', p, 'planchado', 'ab'));
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => %L)', p, 'planchado', repeat('x', 501)));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if (length(v_err) - length(replace(v_err, 'MOTIVO:', ''))) / 7 = 5 and v_etapa = 'control_calidad' then
    r := r || '[ok] caso 1: sin motivo, vacío, espacios, 2 letras o más de 500 → MOTIVO: y no rechaza;';
  else r := r || format('[FALLA] caso 1: %s etapa=%s;', v_err, v_etapa); end if;

  -- 2) Con motivo: rechaza, guarda y descuenta como en la 0140
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => %L)', p, 'planchado', 'Plancha mal hecha, quedó brillo'));
  perform pg_temp.dueno();
  select etapa, obs_calidad into v_etapa, v_obs from prenda_pasada where id = p;
  select obs into v_hobs from prenda_historial where pasada_id = p and etapa_nueva = 'planchado' order by fecha desc limit 1;
  select coalesce(sum(puntos),0) into v_pts from pipeline_puntos where pasada_id = p and empleado_id = e_cf;
  if v_err = 'ok' and v_etapa = 'planchado' and v_obs = 'Plancha mal hecha, quedó brillo'
     and v_hobs like '%Plancha mal hecha, quedó brillo' and v_pts = 0 then
    r := r || '[ok] caso 2: rechaza, guarda el motivo en obs_calidad y en el historial y descuenta los puntos;';
  else r := r || format('[FALLA] caso 2: %s %s obs=%s hobs=%s pts=%s;', v_err, v_etapa, v_obs, v_hobs, v_pts); end if;

  -- 3) Con código de operador: el actor es el operador
  insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('P154-2','Chaqueta','normal',v_a,'planchado') returning id into p;
  perform pg_temp.como(e_cf);
  perform pipeline_avanzar(p, 'control_calidad');
  perform pg_temp.dueno();
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_eq, e_alm, now() + interval '5 minutes') returning token into tok;
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, %L, %L)', p, 'planchado', tok, 'Manchas en la solapa'));
  perform pg_temp.dueno();
  select empleado_id into v_actor from prenda_historial where pasada_id = p and etapa_nueva = 'planchado' order by fecha desc limit 1;
  if v_err = 'ok' and v_actor = e_alm then r := r || '[ok] caso 3: con código de operador, el rechazo queda a nombre del operador;';
  else r := r || format('[FALLA] caso 3: %s actor=%s;', v_err, v_actor); end if;

  -- 5) Una sola firma, sin anon
  select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname = 'pipeline_rechazar';
  if v_n = 1 and not exists (select 1 from pg_proc pr where pr.proname = 'pipeline_rechazar' and has_function_privilege('anon', pr.oid, 'execute'))
  then r := r || '[ok] caso 5: una sola firma y sin execute para anon;';
  else r := r || format('[FALLA] caso 5: firmas=%s;', v_n); end if;

  raise exception 'RESULTADO 0154 --> %', r;
end $$;
