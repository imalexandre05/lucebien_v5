-- Prueba de la migración 0137_corregir_con_abonos.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-corregir-con-abonos-design.md
-- Escrita ANTES que la migración (Zone Guard): si falla, se corrige el código, nunca se afloja la
-- prueba sin corregir y confirmar la spec. Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0137

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
create or replace function pg_temp.liq(p_ac uuid, p_emp uuid, p_desde date, p_hasta date, p_total numeric, p_estado text, p_adm uuid)
  returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada,
      parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (p_ac, p_emp, p_desde, p_hasta, 'borrador', '{}', '{}', '{"lineas":[]}', p_total, 1, 't') returning id into v;
  if p_estado = 'cerrada' then
    update sueldo_liquidaciones set estado = 'cerrada', cerrada_en = now(), cerrada_por = p_adm where id = v;
  end if;
  return v;
end $f$;

do $$
declare
  r text := '';
  adm uuid; per uuid; otro uuid; ac1 uuid; ac2 uuid;
  a uuid; b uuid; c uuid; f uuid; g uuid; h uuid; i uuid; ac3 uuid;
  v_err text; v_n int; v_sum numeric; v_corr uuid;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P137-AD','Prueba 137 Admin','AD','admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P137-PE','Prueba 137 Persona','PE','confeccionista') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P137-OT','Prueba 137 Otro','OT','confeccionista') returning id into otro;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-01-01','2099-01-31',1000,adm,'vigente') returning id into ac1;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-03-01','2099-03-31',1000,adm,'vigente') returning id into ac2;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-04-01','2099-04-30',1000,adm,'vigente') returning id into ac3;
  a := pg_temp.liq(ac1, per, '2099-01-01', '2099-01-31', 1000, 'cerrada', adm);

  perform pg_temp.como(adm);
  perform sueldo_liquidacion_pagar(a, '2099-01-20', 400, 'efectivo');

  -- ── 1) La anulación común sigue bloqueada con abonos ────────────────────────────────────────
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_anular(%L, %L)', a, 'prueba'));
  if v_err like 'ESTADO:%' or v_err like '%anulalos%' then r := r || '[ok] caso 1: la anulación común con abonos sigue bloqueada;';
  else r := r || format('[FALLA] caso 1: %s;', v_err); end if;

  -- ── 2) corregir_anular: anula y no toca los abonos ──────────────────────────────────────────
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_corregir_anular(%L, %L)', a, 'dato mal cargado'));
  perform pg_temp.dueno();
  select count(*), coalesce(sum(monto),0) into v_n, v_sum from sueldo_liquidacion_pagos where liquidacion_id = a and not anulado;
  if v_err = 'ok' and (select estado from sueldo_liquidaciones where id = a) = 'anulada' and v_n = 1 and v_sum = 400 then
    r := r || '[ok] caso 2: corregir anula la liquidación y el abono sigue vigente e intacto;';
  else r := r || format('[FALLA] caso 2: %s n=%s sum=%s;', v_err, v_n, v_sum); end if;

  -- ── 3) La nueva se enlaza sola y ve el abono ────────────────────────────────────────────────
  b := pg_temp.liq(ac1, per, '2099-01-01', '2099-01-31', 900, 'cerrada', adm);
  select corrige_a into v_corr from sueldo_liquidaciones where id = b;
  perform pg_temp.como(adm);
  select count(*), coalesce(sum(monto),0) into v_n, v_sum from sueldo_pagos_de_cadena(array[b]) where not anulado;
  perform pg_temp.dueno();
  if v_corr = a and v_n = 1 and v_sum = 400 then r := r || '[ok] caso 3: la corregida queda enlazada y ve el abono de la anterior;';
  else r := r || format('[FALLA] caso 3: corrige_a=%s n=%s sum=%s;', v_corr, v_n, v_sum); end if;

  -- ── 4) Anti-sobrepago sobre la cadena ───────────────────────────────────────────────────────
  perform pg_temp.como(adm);
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_pagar(%L, %L, 600, %L)', b, '2099-01-25', 'efectivo'));
  if v_err like 'SALDO:%' then r := r || '[ok] caso 4a: 400 ya pagados + 600 supera el total 900 → SALDO;';
  else r := r || format('[FALLA] caso 4a: %s;', v_err); end if;
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_pagar(%L, %L, 500, %L)', b, '2099-01-25', 'efectivo'));
  perform pg_temp.dueno();
  if v_err = 'ok' then r := r || '[ok] caso 4b: el saldo (500) sí se puede abonar;';
  else r := r || format('[FALLA] caso 4b: %s;', v_err); end if;
  -- el trigger también protege un insert directo
  v_err := pg_temp.mensaje(format('insert into sueldo_liquidacion_pagos (liquidacion_id, fecha, monto, metodo, registrado_por) values (%L, %L, 1, %L, %L)', b, '2099-01-26', 'efectivo', adm));
  if v_err like 'SALDO:%' then r := r || '[ok] caso 4c: el trigger también cuenta la cadena;';
  else r := r || format('[FALLA] caso 4c: %s;', v_err); end if;

  -- ── 5) Corrección encadenada ────────────────────────────────────────────────────────────────
  perform pg_temp.como(adm);
  perform sueldo_liquidacion_corregir_anular(b, 'segunda corrección');
  perform pg_temp.dueno();
  c := pg_temp.liq(ac1, per, '2099-01-01', '2099-01-31', 950, 'cerrada', adm);
  perform pg_temp.como(adm);
  select count(*), coalesce(sum(monto),0) into v_n, v_sum from sueldo_pagos_de_cadena(array[c]) where not anulado;
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_pagar(%L, %L, 100, %L)', c, '2099-01-27', 'efectivo'));
  perform pg_temp.dueno();
  if v_n = 2 and v_sum = 900 and v_err like 'SALDO:%' then r := r || '[ok] caso 5: la cadena de dos eslabones arrastra 900 y no deja pagar 100 más sobre 950;';
  else r := r || format('[FALLA] caso 5: n=%s sum=%s err=%s;', v_n, v_sum, v_err); end if;

  -- ── 6) Período distinto → no se enlaza ──────────────────────────────────────────────────────
  f := pg_temp.liq(ac2, per, '2099-03-01', '2099-03-31', 1000, 'cerrada', adm);
  perform pg_temp.como(adm);
  perform sueldo_liquidacion_pagar(f, '2099-03-20', 100, 'efectivo');
  perform sueldo_liquidacion_corregir_anular(f, 'otra');
  perform pg_temp.dueno();
  g := pg_temp.liq(ac2, per, '2099-03-01', '2099-03-15', 500, 'borrador', adm);
  if (select corrige_a from sueldo_liquidaciones where id = g) is null then r := r || '[ok] caso 6: otro período no se enlaza;';
  else r := r || '[FALLA] caso 6: se enlazó un período distinto;'; end if;

  -- ── 7) Sin abonos: igual que la anulación común, sin enlace ─────────────────────────────────
  delete from sueldo_liquidaciones where id = g;
  h := pg_temp.liq(ac3, per, '2099-04-01', '2099-04-30', 1000, 'cerrada', adm);
  perform pg_temp.como(adm);
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_corregir_anular(%L, %L)', h, 'sin pagos'));
  perform pg_temp.dueno();
  i := pg_temp.liq(ac3, per, '2099-04-01', '2099-04-30', 1000, 'borrador', adm);
  if v_err = 'ok' and (select corrige_a from sueldo_liquidaciones where id = i) is null then
    r := r || '[ok] caso 7: sin abonos anula igual y no enlaza nada;';
  else r := r || format('[FALLA] caso 7: %s;', v_err); end if;

  -- ── 8) Permisos ─────────────────────────────────────────────────────────────────────────────
  perform pg_temp.como(otro);
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_corregir_anular(%L, %L)', c, 'x'));
  perform pg_temp.dueno();
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('sueldo_liquidacion_corregir_anular','sueldo_pagos_de_cadena')
      and has_function_privilege('anon', p.oid, 'execute');
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 8: sólo el administrador; anon sin execute;';
  else r := r || format('[FALLA] caso 8: %s anon=%s;', v_err, v_n); end if;

  raise exception 'RESULTADO 0137 --> %', r;
end $$;
