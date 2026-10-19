-- Prueba de la migración 0184_reportes_auto_envio.sql
-- Spec: docs/superpowers/specs/reportes/2026-10-19-reportes-auto-envio-design.md
-- Escrita ANTES que la migración (Zone Guard). Termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0184

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
  v_s text := 'P185A';
  v_f date := date '2026-10-20';
  e_enc uuid; e_trab uuid; e_adm uuid; e_otro uuid;
  v_n int; v_rep reportes%rowtype; v_txt text;
  v_t timestamptz;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_s, 'P0184 Sede');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P185-EN','Prueba Encargada','EN','encargado_tienda', v_s) returning id into e_enc;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P185-TR','Prueba Trabajador','TR','ventas_junior', v_s) returning id into e_trab;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P185-AD','Prueba Admin','AD','admin', v_s) returning id into e_adm;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P185-OT','Prueba Otro','OT','ventas_junior', v_s) returning id into e_otro;
  delete from config where clave in ('turno_m_cierre','reporte_recordatorios_min');
  insert into config (clave, valor) values ('turno_m_cierre','15:00');

  -- borrador con contenido: Mañana, con encargado
  insert into reporte_drafts (sede_cod, fecha, turno, encargado_id, payload) values
    (v_s, v_f, 'M', e_enc, jsonb_build_object('trabajadores', jsonb_build_array(e_trab),
      'actividades', '[{"cod":"X1","nombre":"Act","cat":"IND","peso":2,"realizada":true,"obs":""}]'::jsonb, 'extras','[]'::jsonb));

  -- 2) antes de la hora (14:00 Perú = 19:00 UTC) no crea nada
  perform reportes_auto_enviar(timestamptz '2026-10-20 19:00+00');
  select count(*) into v_n from reportes where sede_cod = v_s;
  if v_n = 0 then r := r || '[ok] caso 2: antes de la hora no crea;'; else r := r || '[FALLA] caso 2: creó antes de la hora;'; end if;

  -- 1) pasada la hora (15:05 Perú = 20:05 UTC)
  perform reportes_auto_enviar(timestamptz '2026-10-20 20:05+00');
  select * into v_rep from reportes where sede_cod = v_s and fecha = v_f and turno = 'M';
  if v_rep.id is not null and v_rep.estado_envio = 'enviado' and v_rep.auto_enviado
     and v_rep.encargado_id = e_enc and v_rep.auto_enviado_razon = 'auto-envio-hora-limite' and not v_rep.evaluado
    then r := r || '[ok] caso 1: enviado automáticamente a nombre del encargado;';
    else r := r || '[FALLA] caso 1: ' || coalesce(row_to_json(v_rep)::text, 'sin reporte') || ';'; end if;
  select count(*) into v_n from reporte_actividades where reporte_id = v_rep.id and realizada;
  if v_n = 1 then r := r || '[ok] caso 1b: copió la actividad marcada;'; else r := r || '[FALLA] caso 1b: actividades=' || v_n || ';'; end if;
  select count(*) into v_n from reporte_trabajadores where reporte_id = v_rep.id;
  if v_n = 2 then r := r || '[ok] caso 1c: trabajador + encargado;'; else r := r || '[FALLA] caso 1c: trabajadores=' || v_n || ';'; end if;
  select count(*) into v_n from reporte_drafts where sede_cod = v_s;
  if v_n = 0 then r := r || '[ok] caso 1d: borrador borrado;'; else r := r || '[FALLA] caso 1d: sigue el borrador;'; end if;

  -- 3) idempotente
  perform reportes_auto_enviar(timestamptz '2026-10-20 20:10+00');
  select count(*) into v_n from reportes where sede_cod = v_s;
  if v_n = 1 then r := r || '[ok] caso 3: segunda corrida no duplica;'; else r := r || '[FALLA] caso 3: reportes=' || v_n || ';'; end if;

  -- 4) sin borrador: nada (turno T de la misma sede, ya pasada la hora)
  perform reportes_auto_enviar(timestamptz '2026-10-21 05:00+00');
  select count(*) into v_n from reportes where sede_cod = v_s;
  if v_n = 1 then r := r || '[ok] caso 4: sin borrador no crea cascarón;'; else r := r || '[FALLA] caso 4: reportes=' || v_n || ';'; end if;

  -- 4b) borrador sin encargado: toma al encargado de tienda de la sede
  insert into reporte_drafts (sede_cod, fecha, turno, encargado_id, payload) values
    (v_s, v_f, 'T', null, jsonb_build_object('trabajadores', jsonb_build_array(e_trab), 'actividades','[]'::jsonb,'extras','[]'::jsonb));
  perform reportes_auto_enviar(timestamptz '2026-10-21 05:00+00');
  select * into v_rep from reportes where sede_cod = v_s and turno = 'T';
  if v_rep.encargado_id = e_enc then r := r || '[ok] caso 4b: sin encargado en el borrador usa al de la sede;';
  else r := r || '[FALLA] caso 4b: encargado=' || coalesce(v_rep.encargado_id::text,'null') || ';'; end if;

  -- 5) hora de la sede distinta de la global: Corrido global 23:00, sede 18:00
  insert into config (clave, valor) values ('turno_c_cierre','23:00') on conflict (clave) do update set valor = '23:00';
  insert into reporte_hora_limite (sede_cod, turno, hora) values (v_s, 'C', '18:00');
  insert into reporte_drafts (sede_cod, fecha, turno, encargado_id, payload) values
    (v_s, date '2026-10-22', 'C', e_enc, jsonb_build_object('trabajadores', jsonb_build_array(e_trab), 'actividades','[]'::jsonb,'extras','[]'::jsonb));
  perform reportes_auto_enviar(timestamptz '2026-10-22 23:30+00'); -- 18:30 Perú
  select count(*) into v_n from reportes where sede_cod = v_s and turno = 'C';
  if v_n = 1 then r := r || '[ok] caso 5: manda la hora de la sede;'; else r := r || '[FALLA] caso 5: reportes C=' || v_n || ';'; end if;

  -- 6) recordatorios 30 y 10 min (default), sin duplicar
  insert into reporte_drafts (sede_cod, fecha, turno, encargado_id, payload) values
    (v_s, date '2026-10-23', 'M', e_enc, '{}'::jsonb);
  perform reportes_recordar(timestamptz '2026-10-23 19:20+00'); -- 14:20 Perú, faltan 40: nada
  select count(*) into v_n from notificaciones where dedup_key like 'rec-reporte:P185A:%';
  if v_n = 0 then r := r || '[ok] caso 6a: a 40 min no avisa;'; else r := r || '[FALLA] caso 6a: ' || v_n || ';'; end if;
  perform reportes_recordar(timestamptz '2026-10-23 19:35+00'); -- faltan 25: umbral 30
  perform reportes_recordar(timestamptz '2026-10-23 19:36+00'); -- repite: no duplica
  select count(*) into v_n from notificaciones where dedup_key like 'rec-reporte:P185A:%';
  if v_n = 1 then r := r || '[ok] caso 6b: un aviso a los 30 min sin duplicar;'; else r := r || '[FALLA] caso 6b: ' || v_n || ';'; end if;
  perform reportes_recordar(timestamptz '2026-10-23 19:51+00'); -- faltan 9: umbral 10
  select count(*) into v_n from notificaciones where dedup_key like 'rec-reporte:P185A:%';
  if v_n = 2 then r := r || '[ok] caso 6c: otro aviso a los 10 min;'; else r := r || '[FALLA] caso 6c: ' || v_n || ';'; end if;
  select destinatario_sede into v_txt from notificaciones where dedup_key like 'rec-reporte:P185A:%' limit 1;
  if v_txt = v_s then r := r || '[ok] caso 6d: va a la sede;'; else r := r || '[FALLA] caso 6d: sede=' || coalesce(v_txt,'null') || ';'; end if;
  perform reportes_recordar(timestamptz '2026-10-23 20:30+00'); -- ya pasó la hora: no avisa
  select count(*) into v_n from notificaciones where dedup_key like 'rec-reporte:P185A:%';
  if v_n = 2 then r := r || '[ok] caso 6e: pasada la hora no avisa;'; else r := r || '[FALLA] caso 6e: ' || v_n || ';'; end if;

  -- 7) hora por sede: no-admin no puede; admin sí; hora nula borra; queda auditado
  perform pg_temp.como(e_otro);
  v_txt := pg_temp.mensaje(format('select reporte_hora_limite_guardar(%L,%L,%L)', v_s, 'M', '16:00'));
  perform pg_temp.dueno();
  if v_txt like 'PERMISO%' then r := r || '[ok] caso 7a: un no-admin no guarda;'; else r := r || '[FALLA] caso 7a: ' || v_txt || ';'; end if;
  perform pg_temp.como(e_adm);
  v_txt := pg_temp.mensaje(format('select reporte_hora_limite_guardar(%L,%L,%L)', v_s, 'M', '16:00'));
  perform pg_temp.dueno();
  select count(*) into v_n from reporte_hora_limite where sede_cod = v_s and turno = 'M' and hora = '16:00';
  if v_txt = 'ok' and v_n = 1 then r := r || '[ok] caso 7b: el admin guarda;'; else r := r || '[FALLA] caso 7b: ' || v_txt || ';'; end if;
  perform pg_temp.como(e_adm);
  v_txt := pg_temp.mensaje(format('select reporte_hora_limite_guardar(%L,%L,%L)', v_s, 'M', '25:99'));
  perform pg_temp.dueno();
  if v_txt <> 'ok' then r := r || '[ok] caso 7c: hora inválida se rechaza;'; else r := r || '[FALLA] caso 7c: aceptó 25:99;'; end if;
  select count(*) into v_n from audit_log where tabla = 'reporte_hora_limite';
  if v_n >= 1 then r := r || '[ok] caso 7d: auditado;'; else r := r || '[FALLA] caso 7d: sin rastro;'; end if;
  perform pg_temp.como(e_adm);
  perform reporte_hora_limite_guardar(v_s, 'M', null);
  perform pg_temp.dueno();
  select count(*) into v_n from reporte_hora_limite where sede_cod = v_s and turno = 'M';
  if v_n = 0 then r := r || '[ok] caso 7e: hora nula borra el ajuste;'; else r := r || '[FALLA] caso 7e;'; end if;

  -- 8) las funciones automáticas no son de authenticated/anon
  perform pg_temp.como(e_adm);
  v_txt := pg_temp.mensaje('select reportes_auto_enviar()');
  perform pg_temp.dueno();
  if v_txt <> 'ok' then r := r || '[ok] caso 8a: authenticated no corre el envío;'; else r := r || '[FALLA] caso 8a: lo corrió;'; end if;
  perform pg_temp.como(e_adm);
  v_txt := pg_temp.mensaje('select reportes_recordar()');
  perform pg_temp.dueno();
  if v_txt <> 'ok' then r := r || '[ok] caso 8b: authenticated no corre los recordatorios;'; else r := r || '[FALLA] caso 8b: lo corrió;'; end if;

  raise exception 'RESULTADO: %', r;
end $$;
