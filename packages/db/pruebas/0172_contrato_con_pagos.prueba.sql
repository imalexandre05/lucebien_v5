-- Prueba de la migración 0172_contrato_con_pagos.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-contrato-con-pagos-no-se-recorta-design.md (Pruebas 1 a 9)
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola: termina lanzando una excepción con el
-- resultado; no deja ni una fila. Correr el archivo ENTERO de una vez.
-- Cómo se corre: bash tools/postgres-local.sh probar 0172

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  v_fallas text := '';
  adm uuid; per uuid; per2 uuid; per3 uuid; per4 uuid; per5 uuid;
  a1 uuid; a6 uuid; a7 uuid; a8 uuid; a9 uuid; nuevo uuid;
  msg text; f record; fila jsonb;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P172-AD', 'P172 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P172-P1', 'P172 Persona 1', 'P1', 'confeccionista') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P172-P2', 'P172 Persona 2', 'P2', 'confeccionista') returning id into per2;
  insert into empleados (cod, nombre, iniciales, rol) values ('P172-P3', 'P172 Persona 3', 'P3', 'confeccionista') returning id into per3;
  insert into empleados (cod, nombre, iniciales, rol) values ('P172-P4', 'P172 Persona 4', 'P4', 'confeccionista') returning id into per4;
  insert into empleados (cod, nombre, iniciales, rol) values ('P172-P5', 'P172 Persona 5', 'P5', 'confeccionista') returning id into per5;

  -- Contrato A: 1-31 oct 2099, con liquidación cerrada 1-31 oct.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (per, '2099-10-01', '2099-10-31', 1500, adm) returning id into a1;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (a1, per, '2099-10-01', '2099-10-31', '{}', '{}', '{}', 1500, 10, 'prueba');
  update sueldo_liquidaciones set estado = 'cerrada', cerrada_en = now(), cerrada_por = adm where acuerdo_id = a1;

  -- 1) recortar el fin por la RPC → PERIODO:, el contrato no cambia
  perform pg_temp.como(adm);
  fila := jsonb_build_object('empleado_id', per, 'fecha_inicio', '2099-10-01', 'fecha_fin', '2099-10-15',
                             'modalidad', 'mensual', 'sueldo_pactado', 1500);
  msg := pg_temp.mensaje(format('select sueldo_acuerdo_guardar(%L, %L::jsonb, ''[]''::jsonb)', a1, fila));
  perform pg_temp.dueno();
  if msg like 'PERIODO:%' and (select fecha_fin from sueldo_acuerdos where id = a1) = date '2099-10-31' then
    null; else v_fallas := v_fallas || format(E'\n  · 1: la RPC dejó recortar un contrato liquidado (%s)', msg); end if;

  -- 2) mismo caso por update directo como admin
  perform pg_temp.como(adm);
  msg := pg_temp.mensaje(format('update sueldo_acuerdos set fecha_fin = date ''2099-10-15'' where id = %L', a1));
  perform pg_temp.dueno();
  if msg like 'PERIODO:%' and (select fecha_fin from sueldo_acuerdos where id = a1) = date '2099-10-31' then
    null; else v_fallas := v_fallas || format(E'\n  · 2: el update directo dejó recortar (%s)', msg); end if;

  -- 3) correr el inicio a 5-oct
  perform pg_temp.como(adm);
  msg := pg_temp.mensaje(format('update sueldo_acuerdos set fecha_inicio = date ''2099-10-05'' where id = %L', a1));
  perform pg_temp.dueno();
  if msg like 'PERIODO:%' and (select fecha_inicio from sueldo_acuerdos where id = a1) = date '2099-10-01' then
    null; else v_fallas := v_fallas || format(E'\n  · 3: dejó correr el inicio (%s)', msg); end if;

  -- 4) alargar el fin se acepta
  perform pg_temp.como(adm);
  msg := pg_temp.mensaje(format('update sueldo_acuerdos set fecha_fin = date ''2099-11-30'' where id = %L', a1));
  perform pg_temp.dueno();
  if msg = 'ok' and (select fecha_fin from sueldo_acuerdos where id = a1) = date '2099-11-30' then
    null; else v_fallas := v_fallas || format(E'\n  · 4: no dejó alargar el contrato (%s)', msg); end if;

  -- 5) con la liquidación anulada, recortar se acepta
  update sueldo_liquidaciones set estado = 'anulada', anulada_en = now(), anulada_por = adm, anulada_motivo = 'prueba' where acuerdo_id = a1;
  perform pg_temp.como(adm);
  msg := pg_temp.mensaje(format('update sueldo_acuerdos set fecha_fin = date ''2099-10-15'' where id = %L', a1));
  perform pg_temp.dueno();
  if msg = 'ok' and (select fecha_fin from sueldo_acuerdos where id = a1) = date '2099-10-15' then
    null; else v_fallas := v_fallas || format(E'\n  · 5: una liquidación anulada bloqueó la edición (%s)', msg); end if;

  -- 6) cambiar el dueño con liquidación no anulada
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (per2, '2099-10-01', '2099-10-31', 1500, adm) returning id into a6;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (a6, per2, '2099-10-01', '2099-10-31', '{}', '{}', '{}', 1500, 10, 'prueba');
  update sueldo_liquidaciones set estado = 'cerrada', cerrada_en = now(), cerrada_por = adm where acuerdo_id = a6;
  perform pg_temp.como(adm);
  msg := pg_temp.mensaje(format('update sueldo_acuerdos set empleado_id = %L where id = %L', per5, a6));
  perform pg_temp.dueno();
  if msg like 'PERIODO:%' and (select empleado_id from sueldo_acuerdos where id = a6) = per2 then
    null; else v_fallas := v_fallas || format(E'\n  · 6: dejó cambiar de dueño un contrato liquidado (%s)', msg); end if;

  -- 7) suspender con p_hoy posterior al fin de lo liquidado sigue funcionando
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (per3, '2099-10-01', '2099-12-31', 1500, adm) returning id into a7;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (a7, per3, '2099-10-01', '2099-10-31', '{}', '{}', '{}', 1500, 10, 'prueba');
  update sueldo_liquidaciones set estado = 'cerrada', cerrada_en = now(), cerrada_por = adm where acuerdo_id = a7;
  perform pg_temp.como(adm);
  msg := pg_temp.mensaje(format('select empleado_suspender(%L, date ''2099-11-15'')', per3));
  perform pg_temp.dueno();
  if msg = 'ok' and (select fecha_fin from sueldo_acuerdos where id = a7) = date '2099-11-15' then
    null; else v_fallas := v_fallas || format(E'\n  · 7: suspender dejó de funcionar (%s)', msg); end if;

  -- 8) renovar: tarifa 5,00 → cambio 6,50 → cambio sólo de frecuencia (tarifa nula): el nuevo sale con 6,50
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias, sueldo_pactado, tarifa_hora, creado_por, estado)
    values (per4, '2098-01-01', '2098-06-30', 'dias', 7, 0, 5, adm, 'vigente') returning id into a8;
  insert into sueldo_acuerdo_cambios (acuerdo_id, desde, modalidad, cada_dias, sueldo_pactado, tarifa_hora, creado_por)
    values (a8, '2098-02-01', 'dias', 7, 0, 6.5, adm);
  insert into sueldo_acuerdo_cambios (acuerdo_id, desde, modalidad, cada_dias, sueldo_pactado, tarifa_hora, creado_por)
    values (a8, '2098-03-01', 'dias', 14, 0, null, adm);
  perform pg_temp.como(adm);
  nuevo := sueldo_acuerdo_renovar(a8);
  perform pg_temp.dueno();
  select * into f from sueldo_acuerdos where id = nuevo;
  if f.tarifa_hora = 6.5 and f.cada_dias = 14 then null;
  else v_fallas := v_fallas || format(E'\n  · 8: la renovación salió con tarifa %s y cada %s días (esperaba 6,50 y 14)', f.tarifa_hora, f.cada_dias); end if;

  -- 9) renovar sin cambios: tarifa del contrato
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias, sueldo_pactado, tarifa_hora, creado_por, estado)
    values (per5, '2098-01-01', '2098-06-30', 'dias', 7, 0, 5, adm, 'vigente') returning id into a9;
  perform pg_temp.como(adm);
  nuevo := sueldo_acuerdo_renovar(a9);
  perform pg_temp.dueno();
  select * into f from sueldo_acuerdos where id = nuevo;
  if f.tarifa_hora = 5 then null;
  else v_fallas := v_fallas || format(E'\n  · 9: la renovación sin cambios salió con tarifa %s (esperaba 5)', f.tarifa_hora); end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0172: OK — un contrato con liquidaciones no se recorta ni cambia de dueño, y la renovación hereda la última tarifa';
  else
    raise exception 'RESULTADO 0172: FALLAS —%', v_fallas;
  end if;
end $$;
