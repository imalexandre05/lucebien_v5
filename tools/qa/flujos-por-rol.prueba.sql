-- QA 2026-10-19 (auditoría 2): flujos clave simulando cada rol contra Postgres local.
-- No hay PostgREST/GoTrue/Docker en la nube, así que la app Next no corre completa: se ataca la base
-- COMO `authenticated` (role + claims), igual que packages/db/pruebas/*. Todo sintético, prefijo 'QA'.
-- Se descarta solo: termina lanzando una excepción con la línea RESULTADO.
-- Se corre:  bash tools/postgres-local.sh aplicar && bash tools/qa/correr-flujos.sh
create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;
create or replace function pg_temp.m(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;
create or replace function pg_temp.n(p_sql text) returns bigint language plpgsql as $f$
declare v bigint; begin execute 'select count(*) from (' || p_sql || ') q' into v; return v; exception when others then return -1; end $f$;

do $$
declare
  r text := '';
  adm uuid; enc uuid; encb uuid; conf uuid; nuevo uuid; comp uuid;
  p uuid; p2 uuid; j jsonb; tok uuid; v text; v2 text; n bigint; n2 bigint; pts numeric; tanda uuid[];
  procedure_ok boolean;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values ('QA-A','QA Sede A'), ('QA-B','QA Sede B');
  insert into empleados (cod,nombre,iniciales,rol,sede_cod,fecha_ingreso,salario_base) values ('QA-ADM','QA Admin','AD','admin',null,current_date-400,0) returning id into adm;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod,fecha_ingreso) values ('QA-ENC','QA Encargada A','EA','encargado_tienda','QA-A',current_date-300) returning id into enc;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod,fecha_ingreso) values ('QA-ENB','QA Encargada B','EB','encargado_tienda','QA-B',current_date-300) returning id into encb;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod,fecha_ingreso,salario_base) values ('QA-CNF','QA Confeccionista','CF','confeccionista','QA-A',current_date-200,1200) returning id into conf;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod,fecha_ingreso) values ('QA-NVO','QA Persona Nueva','PN','confeccionista','QA-A',current_date-2) returning id into nuevo;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod,fecha_ingreso,cuenta_compartida) values ('QA-CMP','QA Cuenta Taller','CT','encargado_almacen','QA-A',current_date-300,true) returning id into comp;
  insert into dispositivos_autorizados (device_id,nombre,sede_cod,estado,compartido) values ('qa-dev','QA taller','QA-A','aprobado',true);
  insert into config (clave,valor) values ('pts_recepcion','1'),('pts_lavado_normal','1'),('pts_empatado','1'),('pts_refaccion','1'),('pts_compostura','1'),('pts_planchado','1'),('pts_control_calidad','1') on conflict (clave) do update set valor=excluded.valor;
  r := r || 'montaje=ok; ';

  -- 1) LOGIN / PIN: la confeccionista define su PIN; la persona nueva no tiene.
  perform pg_temp.como(conf);
  j := pipeline_definir_pin('482193', null);
  r := r || format('[%s] 1a PIN propio definido (%s); ', case when (j->>'ok')::bool then 'ok' else 'FALLA' end, j);
  perform pg_temp.como(nuevo);
  r := r || format('[%s] 1b persona nueva sin PIN aún (tengo_pin=%s); ', case when not pipeline_tengo_pin() then 'ok' else 'FALLA' end, pipeline_tengo_pin());

  -- 2) CUENTA COMPARTIDA: registra una prenda; avanzar SIN código debe rechazarse; con código, a nombre de la confeccionista.
  perform pg_temp.como(comp);
  v := pg_temp.m($q$select pipeline_registrar_prenda('QA-P1','Chaqueta','negro','M','QA-A','normal',false,null,null)$q$);
  r := r || format('[%s] 2a cuenta compartida registra prenda: %s; ', case when v='ok' then 'ok' else 'INFO' end, v);
  perform pg_temp.dueno();
  select id into p from prenda_pasada where codigo='QA-P1';
  if p is null then
    insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('QA-P1','Chaqueta','normal','QA-A','recepcion') returning id into p;
  end if;
  perform pg_temp.como(comp);
  v := pg_temp.m(format($q$select pipeline_avanzar(%L,'lavado')$q$, p));
  r := r || format('[%s] 2b avanzar sin código desde cuenta compartida rechazado: %s; ', case when v<>'ok' then 'ok' else 'FALLA' end, left(v,90));
  j := pipeline_validar_codigo('QA-CNF','000000','qa-dev');
  r := r || format('[%s] 2c código con PIN malo no da token (%s); ', case when not (j->>'ok')::bool then 'ok' else 'FALLA' end, j->>'intentos_restantes');
  j := pipeline_validar_codigo('QA-CNF','482193','qa-dev');
  tok := (j->>'token')::uuid;
  r := r || format('[%s] 2d código correcto da token; ', case when tok is not null then 'ok' else 'FALLA '||j::text end);
  if tok is null then raise exception 'RESULTADO %', r || 'DEBUG validar_codigo=' || j::text; end if;
  pts := pipeline_avanzar(p,'lavado',tok);
  perform pg_temp.dueno();
  select count(*) into n from pipeline_puntos where empleado_id=conf and pasada_id=p;
  r := r || format('[%s] 2e avanzar con código: punto a la confeccionista (pts=%s filas=%s); ', case when n=1 then 'ok' else 'FALLA' end, pts, n);
  -- código de una persona suspendida / cuenta compartida no sirve
  perform pg_temp.como(comp);
  j := pipeline_validar_codigo('QA-CMP','111111','qa-dev');
  r := r || format('[%s] 2f el código de una cuenta compartida no emite token; ', case when not (j->>'ok')::bool then 'ok' else 'FALLA' end);
  -- equipo no compartido
  j := pipeline_validar_codigo('QA-CNF','482193','otro-equipo');
  r := r || format('[%s] 2g equipo no compartido: %s; ', case when j->>'motivo'='equipo_no_compartido' then 'ok' else 'FALLA' end, j->>'motivo');

  -- 3) PIPELINE completo con token: tanda, calificar (rechazo con motivo), dividir, enviar, deshacer
  perform pg_temp.dueno();
  insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('QA-P2','Pantalon','normal','QA-A','lavado') returning id into p2;
  perform pg_temp.como(comp);
  j := pipeline_validar_codigo('QA-CNF','482193','qa-dev'); tok := (j->>'token')::uuid;
  v := pg_temp.m(format($q$select pipeline_avanzar_tanda(array[%L::uuid,%L::uuid],'empatado',%L)$q$, p, p2, tok));
  r := r || format('[%s] 3a avanzar en tanda con código: %s; ', case when v='ok' then 'ok' else 'FALLA' end, left(v,120));
  -- p2 recorre la cadena hasta control de calidad (cada paso con código)
  foreach v2 in array array['refaccion','planchado','control_calidad'] loop
    v := pg_temp.m(format($q$select pipeline_avanzar(%L,%L,%L)$q$, p2, v2, tok));
    r := r || format('[%s] 3b0 p2 -> %s: %s; ', case when v='ok' then 'ok' else 'INFO' end, v2, left(v,70));
  end loop;
  v := pg_temp.m(format($q$select pipeline_rechazar(%L,'planchado',%L)$q$, p2, tok));
  r := r || format('[%s] 3b rechazar desde control de calidad con código: %s; ', case when v='ok' then 'ok' else 'FALLA' end, left(v,120));
  foreach v2 in array array['planchado','control_calidad','listo'] loop
    v := pg_temp.m(format($q$select pipeline_avanzar(%L,%L,%L)$q$, p2, v2, tok));
  end loop;
  r := r || format('[%s] 3b1 avanzar hasta listo (último: %s); ', case when v='ok' then 'ok' else 'INFO' end, left(v,70));
  v := pg_temp.m(format($q$select pipeline_calificar(%L,true,'listo','QA ok',%L)$q$, p2, tok));
  r := r || format('[%s] 3b2 calificar aceptada con código: %s; ', case when v='ok' then 'ok' else 'INFO' end, left(v,120));
  v := pg_temp.m(format($q$select pipeline_dividir(%L,%L)$q$, p, tok));
  r := r || format('[%s] 3c dividir con código: %s; ', case when v='ok' then 'ok' else 'INFO' end, left(v,120));
  v := pg_temp.m(format($q$select pipeline_deshacer_division(%L,%L)$q$, p, tok));
  r := r || format('[%s] 3c2 deshacer división con código: %s; ', case when v='ok' then 'ok' else 'INFO' end, left(v,120));
  v := pg_temp.m(format($q$select pipeline_enviar(%L,'QA-B',%L)$q$, p2, tok));
  r := r || format('[%s] 3e enviar a otra sede con código: %s; ', case when v='ok' then 'ok' else 'INFO' end, left(v,120));
  select etapa into v2 from prenda_pasada where id=p2;
  r := r || format('[info] 3f etapa final de p2=%s; ', v2);
  -- token ajeno: otra sesión no puede usar el token de esta
  perform pg_temp.como(encb);
  v := pg_temp.m(format($q$select pipeline_avanzar(%L,'planchado',%L)$q$, p, tok));
  r := r || format('[%s] 3g el token no sirve desde otra sesión: %s; ', case when v<>'ok' then 'ok' else 'FALLA' end, left(v,80));

  -- 4) REPORTE de actividades con código del encargado (cuenta compartida)
  perform pg_temp.como(comp);
  v := pg_temp.m(format($q$select reportes_crear('19-10-26_QA1','QA-A','T',2,1,array[%L::uuid],'[]'::jsonb,'[]'::jsonb,%L)$q$, conf, enc));
  v2 := pg_temp.m(format($q$select reportes_crear('19-10-26_QA2','QA-A','M',2,1,array[%L::uuid],'[]'::jsonb,'[]'::jsonb,null)$q$, conf));
  r := r || format('[info] 4b0 crear sin encargado: %s; ', left(v2,100));
  perform pg_temp.dueno();
  select encargado_id::text into v2 from reportes where id='19-10-26_QA2';
  perform pg_temp.como(comp);
  r := r || format('[%s] 4b cuenta compartida crea reporte sin encargado: queda a nombre de %s (esperado: la persona con código; /reportes no pide código); ', case when v2 = comp::text then 'HALLAZGO' else 'info' end, coalesce((select nombre from empleados where id=nullif(v2,'')::uuid),'nadie'));
  r := r || format('[%s] 4a reporte con encargado explícito: %s; ', case when v='ok' then 'ok' else 'INFO' end, left(v,140));

  -- 5) AISLAMIENTOS
  perform pg_temp.como(nuevo);
  n := pg_temp.n('select * from pipeline_puntos where empleado_id <> auth.uid()');
  r := r || format('[info] 5a persona nueva de la MISMA sede ve %s puntos de compañeros (RLS por sede, a revisar con seguridad); ', n);
  perform pg_temp.como(encb);
  n := pg_temp.n('select * from pipeline_puntos where empleado_id <> auth.uid()');
  r := r || format('[%s] 5a2 encargada de OTRA sede no ve puntos de la sede A (%s filas); ', case when n=0 then 'ok' else 'FALLA' end, n);
  perform pg_temp.como(nuevo);
  n := pg_temp.n('select * from sueldo_liquidaciones');
  n2 := pg_temp.n('select * from sueldo_movimientos');
  r := r || format('[%s] 5b /mi-pago: la persona nueva no ve liquidaciones ni movimientos ajenos (%s/%s); ', case when n=0 and n2=0 then 'ok' else 'FALLA' end, n, n2);
  perform pg_temp.como(encb);
  n := pg_temp.n($q$select * from prenda_pasada where sede_origen_cod='QA-A'$q$);
  r := r || format('[%s] 5c encargada de la sede B ve %s prendas de la sede A (esperado según RLS de lectura); ', case when n>=0 then 'info' else 'FALLA' end, n);
  n := pg_temp.n('select * from evaluaciones_mensuales');
  r := r || format('[%s] 5d encargada B lee evaluaciones_mensuales directo: %s filas; ', case when n<=0 then 'ok' else 'FALLA' end, n);
  n := pg_temp.n('select * from sueldo_acuerdos');
  r := r || format('[%s] 5e encargada B lee sueldo_acuerdos directo: %s; ', case when n<=0 then 'ok' else 'FALLA' end, n);
  perform pg_temp.como(adm);
  n := pg_temp.n('select * from pipeline_puntos');
  r := r || format('[%s] 5f admin ve puntos (%s); ', case when n>=1 then 'ok' else 'FALLA' end, n);

  -- 6) NOTIFICACIONES (campana): el motor corre y cada rol ve solo lo suyo
  perform pg_temp.como(adm);
  v := pg_temp.m('select generar_alertas()');
  perform pg_temp.dueno();
  r := r || format('[%s] 6a generar_alertas corre: %s; ', case when v='ok' then 'ok' else 'FALLA' end, left(v,100));
  insert into notificaciones (tipo,titulo,mensaje,destinatario_id,dedup_key) values ('qa','Para nueva','x',nuevo,'qa-1'),('qa','Para conf','x',conf,'qa-2');
  perform pg_temp.como(nuevo);
  n := pg_temp.n($q$select * from notificaciones where tipo='qa'$q$);
  r := r || format('[%s] 6b la persona nueva ve solo su notificación (%s de 2); ', case when n=1 then 'ok' else 'FALLA' end, n);

  -- 7) Dashboard: RPC de agregados legibles por admin
  perform pg_temp.como(adm);
  v := pg_temp.m('select * from pipeline_ranking_hoy()');
  r := r || format('[%s] 7a pipeline_ranking_hoy: %s; ', case when v='ok' then 'ok' else 'FALLA' end, left(v,90));
  v := pg_temp.m($q$select * from est_productividad(current_date-30,current_date)$q$);
  r := r || format('[%s] 7b est_productividad: %s; ', case when v='ok' then 'ok' else 'FALLA' end, left(v,90));
  perform pg_temp.como(nuevo);
  v := pg_temp.m($q$select * from mi_evaluacion_mensual(to_char(current_date,'YYYY-MM'))$q$);
  r := r || format('[%s] 7c mi_evaluacion_mensual de la persona nueva: %s; ', case when v='ok' then 'ok' else 'FALLA' end, left(v,90));

  raise exception 'RESULTADO %', r;
end $$;
