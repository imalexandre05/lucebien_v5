-- Prueba de la migración 0136_movimientos_periodo_cerrado.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-movimientos-periodo-cerrado-design.md
-- Escrita ANTES que la migración (Zone Guard): si falla, se corrige el código, nunca se afloja la
-- prueba sin corregir y confirmar la spec. Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0136

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
  r text := '';
  adm uuid; per uuid; otro uuid;
  ac1 uuid; ac2 uuid; ac3 uuid; l1 uuid; l2 uuid;
  j jsonb; v_id uuid; v_err text; v_n int; v_f date; v_fo date; v_est text;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P136-AD','Prueba 136 Admin','AD','admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P136-PE','Prueba 136 Persona','PE','confeccionista') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P136-OT','Prueba 136 Otro','OT','confeccionista') returning id into otro;

  -- Contratos: enero (1-31) y febrero (1-28) de 2099; hueco; abril (1-30). Enero en dos tramos
  -- cerrados (1-15 y 16-31); febrero abierto; marzo sin contrato.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-01-01','2099-01-31',1000,adm,'vigente') returning id into ac1;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-02-01','2099-02-28',1000,adm,'vigente') returning id into ac2;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-04-01','2099-04-30',1000,adm,'vigente') returning id into ac3;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada, parametros_usados,
      resultado, total, valor_por_hora, motor_version, cerrada_en, cerrada_por)
    values (ac1, per, '2099-01-01','2099-01-15','cerrada','{}','{}','{"lineas":[]}',500,1,'t',now(),adm) returning id into l1;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada, parametros_usados,
      resultado, total, valor_por_hora, motor_version, cerrada_en, cerrada_por)
    values (ac1, per, '2099-01-16','2099-01-31','cerrada','{}','{}','{"lineas":[]}',500,1,'t',now(),adm) returning id into l2;

  perform pg_temp.como(adm);

  -- ── 1) Estado de una fecha ──────────────────────────────────────────────────────────────────
  j := sueldo_movimiento_estado_fecha(per, '2099-02-10');
  v_est := j->>'estado';
  j := sueldo_movimiento_estado_fecha(per, '2099-01-10');
  if v_est = 'abierto' and j->>'estado' = 'cerrado' and (j->>'siguiente')::date = '2099-02-01' then
    r := r || '[ok] caso 1a: febrero abierto; el 10 de enero está cerrado y el siguiente abierto es el 1 de febrero (salta el segundo tramo cerrado);';
  else r := r || format('[FALLA] caso 1a: est=%s j=%s;', v_est, j); end if;
  j := sueldo_movimiento_estado_fecha(per, '2099-03-10');
  if j->>'estado' = 'sin_contrato' and (j->>'siguiente')::date = '2099-04-01' then
    r := r || '[ok] caso 1b: marzo no tiene contrato y el siguiente período abierto es abril;';
  else r := r || format('[FALLA] caso 1b: %s;', j); end if;
  j := sueldo_movimiento_estado_fecha(per, '2099-05-10');
  if j->>'estado' = 'sin_contrato' and j->>'siguiente' is null then
    r := r || '[ok] caso 1c: después del último contrato no hay siguiente (null);';
  else r := r || format('[FALLA] caso 1c: %s;', j); end if;

  -- ── 2) Fecha abierta ────────────────────────────────────────────────────────────────────────
  v_id := sueldo_movimiento_crear(per, '2099-02-10', 'adelanto', 100, 1, 'adelanto feb', null);
  select fecha, fecha_original into v_f, v_fo from sueldo_movimientos where id = v_id;
  if v_f = '2099-02-10' and v_fo is null then r := r || '[ok] caso 2: fecha abierta inserta tal cual;';
  else r := r || format('[FALLA] caso 2: %s %s;', v_f, v_fo); end if;

  -- ── 3) Fecha cerrada sin decisión ───────────────────────────────────────────────────────────
  v_err := pg_temp.mensaje(format('select sueldo_movimiento_crear(%L,%L,%L,50,1,%L,null)', per, '2099-01-10', 'adelanto', 'olvidado'));
  select count(*) into v_n from sueldo_movimientos where empleado_id = per and motivo like 'olvidado%';
  if v_err like 'PERIODO:%' and v_n = 0 then r := r || '[ok] caso 3: sin decisión pregunta (PERIODO:) y no escribe;';
  else r := r || format('[FALLA] caso 3: %s n=%s;', v_err, v_n); end if;
  v_err := pg_temp.mensaje(format('select sueldo_movimiento_crear(%L,%L,%L,50,1,%L,null)', per, '2099-03-10', 'adelanto', 'sin contrato'));
  if v_err like 'PERIODO:%' then r := r || '[ok] caso 3b: fecha sin contrato también pregunta;';
  else r := r || format('[FALLA] caso 3b: %s;', v_err); end if;

  -- ── 4) Al siguiente período abierto ─────────────────────────────────────────────────────────
  v_id := sueldo_movimiento_crear(per, '2099-01-10', 'adelanto', 50, 1, 'olvidado', 'siguiente');
  select fecha, fecha_original, motivo into v_f, v_fo, v_err from sueldo_movimientos where id = v_id;
  if v_f = '2099-02-01' and v_fo = '2099-01-10' and v_err like 'olvidado%' and v_err like '%10/01/2099%'
     and jsonb_array_length(private.sueldo_movimientos_lista(per, '2099-02-01', '2099-02-28', 'adelanto')) = 2 then
    r := r || '[ok] caso 4: va al 1 de febrero, guarda la fecha original, la anota en el motivo y el cierre de febrero lo toma;';
  else r := r || format('[FALLA] caso 4: %s %s %s;', v_f, v_fo, v_err); end if;
  -- marzo (sin contrato) → siguiente = abril
  v_id := sueldo_movimiento_crear(per, '2099-03-10', 'adelanto', 20, 1, 'marzo', 'siguiente');
  select fecha into v_f from sueldo_movimientos where id = v_id;
  if v_f = '2099-04-01' then r := r || '[ok] caso 4b: una fecha sin contrato pasa al siguiente contrato;';
  else r := r || format('[FALLA] caso 4b: %s;', v_f); end if;

  -- ── 5) Sin siguiente: no se guarda ──────────────────────────────────────────────────────────
  v_err := pg_temp.mensaje(format('select sueldo_movimiento_crear(%L,%L,%L,20,1,%L,%L)', per, '2099-05-10', 'adelanto', 'mayo', 'siguiente'));
  select count(*) into v_n from sueldo_movimientos where empleado_id = per and motivo like 'mayo%';
  if v_err like 'PERIODO:%' and v_n = 0 then r := r || '[ok] caso 5: sin período siguiente abierto no guarda nada;';
  else r := r || format('[FALLA] caso 5: %s n=%s;', v_err, v_n); end if;

  -- ── 6) Anular el cierre ─────────────────────────────────────────────────────────────────────
  v_id := sueldo_movimiento_crear(per, '2099-01-20', 'adelanto', 70, 1, 'anular', 'anular_cierre');
  perform pg_temp.dueno();
  select fecha, fecha_original into v_f, v_fo from sueldo_movimientos where id = v_id;
  select estado into v_est from sueldo_liquidaciones where id = l2;
  if v_f = '2099-01-20' and v_fo is null and v_est = 'anulada'
     and (select estado from sueldo_liquidaciones where id = l1) = 'cerrada' then
    r := r || '[ok] caso 6: anula sólo el tramo que cubre la fecha y carga con la fecha original;';
  else r := r || format('[FALLA] caso 6: %s %s liq2=%s;', v_f, v_fo, v_est); end if;

  -- ── 7) Anular con un pago vigente: falla y no deja nada ─────────────────────────────────────
  perform pg_temp.como(adm);
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_pagar(%L, %L, 100, %L)', l1, '2099-01-20', 'efectivo'));
  if v_err <> 'ok' then r := r || format('[FALLA] caso 7 (montaje del pago): %s;', v_err); end if;
  v_err := pg_temp.mensaje(format('select sueldo_movimiento_crear(%L,%L,%L,30,1,%L,%L)', per, '2099-01-05', 'adelanto', 'con pago', 'anular_cierre'));
  perform pg_temp.dueno();
  select count(*) into v_n from sueldo_movimientos where motivo like 'con pago%';
  if v_err <> 'ok' and v_n = 0 and (select estado from sueldo_liquidaciones where id = l1) = 'cerrada' then
    r := r || '[ok] caso 7: con un pago vigente la anulación falla; ni se anula ni se carga;';
  else r := r || format('[FALLA] caso 7: %s n=%s;', v_err, v_n); end if;

  -- ── 8) Trigger de seguridad: insert directo en período cerrado ──────────────────────────────
  v_err := pg_temp.mensaje(format('insert into sueldo_movimientos (empleado_id, fecha, tipo, monto, motivo, creado_por) values (%L, %L, %L, 10, %L, %L)', per, '2099-01-05', 'adelanto', 'directo', adm));
  if v_err like 'PERIODO_CERRADO:%' then r := r || '[ok] caso 8: el insert directo en período cerrado se rechaza;';
  else r := r || format('[FALLA] caso 8: %s;', v_err); end if;

  -- ── 9) Permisos ─────────────────────────────────────────────────────────────────────────────
  perform pg_temp.como(otro);
  v_err := pg_temp.mensaje(format('select sueldo_movimiento_crear(%L,%L,%L,10,1,%L,null)', otro, '2099-02-10', 'adelanto', 'x'));
  perform pg_temp.dueno();
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('sueldo_movimiento_crear','sueldo_movimiento_estado_fecha')
      and has_function_privilege('anon', p.oid, 'execute');
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 9: sólo el administrador; anon sin execute;';
  else r := r || format('[FALLA] caso 9: %s anon=%s;', v_err, v_n); end if;

  raise exception 'RESULTADO 0136 --> %', r;
end $$;
