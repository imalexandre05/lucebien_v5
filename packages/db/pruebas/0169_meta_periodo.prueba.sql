-- Prueba de la migración 0169_meta_periodo.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-meta-del-periodo-primera-comision-design.md §4 y §6
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola. Se corre: bash tools/postgres-local.sh probar 0169
--
-- Junio 2099 (cerrado) y julio 2099 (abierto), contrato en cada mes, sólo lunes 08–13.

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
  r text := ''; adm uuid; per uuid; otro uuid; ac uuid; ac2 uuid; e jsonb; msg text; cnt int;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P169-AD', 'P169 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P169-PE', 'P169 Persona', 'PE', 'encargado_tienda') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P169-OT', 'P169 Otro', 'OT', 'encargado_tienda') returning id into otro;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per, '2099-06-01', '2099-06-30', 600, adm, 'vigente') returning id into ac;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per, '2099-07-01', '2099-07-31', 600, adm, 'vigente') returning id into ac2;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin) values (ac, 1, '08:00', '13:00'), (ac2, 1, '08:00', '13:00');
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada, parametros_usados,
      resultado, total, valor_por_hora, motor_version, cerrada_en, cerrada_por)
    values (ac, per, '2099-06-01', '2099-06-30', 'cerrada', '{}', '{}', '{"lineas":[]}', 600, 1, 't', now(), adm);
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente, minutos_tardanza)
    select per, d::date, 'M', 'trabajado', '08:00', '13:00', 'manual', 0
      from generate_series('2099-07-01'::date, '2099-07-31'::date, interval '1 day') d where extract(isodow from d) = 1;

  -- 1) sin fila, sueldo_entrada no trae la clave (los borradores anteriores no quedan desactualizados)
  perform pg_temp.como(adm);
  e := public.sueldo_entrada(ac2, '2099-07-01', '2099-07-31');
  if not (e ? 'metaPeriodoManual') then r := r || '[ok] 1;'; else r := r || '[FALLA] 1: trae la clave sin fila;'; end if;

  -- 2) el admin pone la meta del período; sueldo_entrada la entrega
  insert into sueldo_meta_periodo (empleado_id, desde, hasta, meta, creado_por) values (per, '2099-07-01', '2099-07-31', 1500.50, adm);
  e := public.sueldo_entrada(ac2, '2099-07-01', '2099-07-31');
  if (e ->> 'metaPeriodoManual')::numeric = 1500.50 then r := r || '[ok] 2;'; else r := r || format('[FALLA] 2: %s;', e ->> 'metaPeriodoManual'); end if;

  -- 3) una meta puesta para otro período no se entrega en éste
  e := public.sueldo_entrada(ac2, '2099-07-01', '2099-07-15');
  if not (e ? 'metaPeriodoManual') then r := r || '[ok] 3;'; else r := r || '[FALLA] 3: mezcló períodos;'; end if;

  -- 4) aislamiento: la persona ve la suya, otro no ve nada, ninguno escribe
  perform pg_temp.como(per);
  select count(*) into cnt from sueldo_meta_periodo;
  msg := pg_temp.mensaje(format('update sueldo_meta_periodo set meta = 1 where empleado_id = %L', per));
  perform pg_temp.como(otro);
  if cnt = 1 and (select count(*) from sueldo_meta_periodo) = 0 then r := r || '[ok] 4a;'; else r := r || '[FALLA] 4a: lecturas;'; end if;
  msg := pg_temp.mensaje(format('insert into sueldo_meta_periodo (empleado_id, desde, hasta, meta) values (%L, ''2099-08-01'', ''2099-08-31'', 5)', otro));
  perform pg_temp.dueno();
  if (select meta from sueldo_meta_periodo where empleado_id = per) = 1500.50 and not exists (select 1 from sueldo_meta_periodo where empleado_id = otro) then
    r := r || '[ok] 4b;'; else r := r || '[FALLA] 4b: un no admin escribió;'; end if;

  -- 5) un período que cae en un pago cerrado no se carga ni se cambia
  perform pg_temp.como(adm);
  msg := pg_temp.mensaje(format('insert into sueldo_meta_periodo (empleado_id, desde, hasta, meta) values (%L, ''2099-06-01'', ''2099-06-30'', 10)', per));
  if msg like 'PERIODO_CERRADO:%' then r := r || '[ok] 5;'; else r := r || format('[FALLA] 5: %s;', msg); end if;

  -- 6) meta negativa y rango invertido se rechazan
  msg := pg_temp.mensaje(format('insert into sueldo_meta_periodo (empleado_id, desde, hasta, meta) values (%L, ''2099-08-01'', ''2099-08-31'', -1)', per));
  if msg like '%sueldo_mp_meta_chk%' then r := r || '[ok] 6a;'; else r := r || format('[FALLA] 6a: %s;', msg); end if;
  msg := pg_temp.mensaje(format('insert into sueldo_meta_periodo (empleado_id, desde, hasta, meta) values (%L, ''2099-08-31'', ''2099-08-01'', 5)', per));
  if msg like '%sueldo_mp_rango_chk%' then r := r || '[ok] 6b;'; else r := r || format('[FALLA] 6b: %s;', msg); end if;
  perform pg_temp.dueno();

  raise exception 'RESULTADO 0169 --> %', r;
end $$;
