-- Prueba de la migración 0166_ventas_semanales.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-18-ventas-metas-semanales-design.md §4 y §6 (caso 6)
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0166

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
  adm uuid; per uuid; otro uuid; ac uuid; ac2 uuid; v_liq uuid;
  e jsonb; v_err text; v_n int;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P166-AD', 'Prueba 166 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P166-PE', 'Prueba 166 Persona', 'PE', 'encargado_tienda') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P166-OT', 'Prueba 166 Otro', 'OT', 'encargado_tienda') returning id into otro;
  -- Junio 2099 (cerrado) y julio 2099 (abierto). Sólo los lunes 08:00–13:00. 2099-07-06 es lunes.
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

  -- ── 1) Sin cargas, sueldo_entrada no trae la clave (regresión) ───────────────────────────
  perform pg_temp.como(adm);
  e := public.sueldo_entrada(ac2, '2099-07-01', '2099-07-31');
  if not (e ? 'ventasSemanales') then r := r || '[ok] 1;'; else r := r || '[FALLA] 1: trae la clave sin cargas;'; end if;

  -- ── 2) El admin carga una semana; sueldo_entrada la entrega ──────────────────────────────
  insert into sueldo_ventas_semana (empleado_id, desde, hasta, total_boletas_mayores, meta_cumplida, creado_por)
    values (per, '2099-07-06', '2099-07-12', 1000, true, adm);
  e := public.sueldo_entrada(ac2, '2099-07-01', '2099-07-31');
  if jsonb_array_length(e -> 'ventasSemanales') = 1
     and (e #>> '{ventasSemanales,0,totalBoletasMayores}')::numeric = 1000
     and (e #>> '{ventasSemanales,0,metaCumplida}')::boolean
     and e #> '{ventasSemanales,0,montoVendido}' = 'null'::jsonb
     and e #>> '{ventasSemanales,0,desde}' = '2099-07-06' then
    r := r || '[ok] 2;';
  else r := r || format('[FALLA] 2: %s;', e -> 'ventasSemanales'); end if;

  -- ── 3) Aislamiento: la persona ve las suyas, otro no ve nada, ninguno escribe ─────────────
  perform pg_temp.como(per);
  select count(*) into v_n from sueldo_ventas_semana;
  v_err := pg_temp.mensaje(format(
    'insert into sueldo_ventas_semana (empleado_id, desde, hasta, total_boletas_mayores) values (%L, ''2099-07-13'', ''2099-07-19'', 5)', per));
  if v_n = 1 and v_err <> 'ok' then r := r || '[ok] 3a;'; else r := r || format('[FALLA] 3a: ve %s, escribe %s;', v_n, v_err); end if;
  perform pg_temp.como(otro);
  select count(*) into v_n from sueldo_ventas_semana;
  if v_n = 0 then r := r || '[ok] 3b;'; else r := r || '[FALLA] 3b: otro ve semanas ajenas;'; end if;

  -- ── 4) Una semana de un pago cerrado no se carga ni se cambia ────────────────────────────
  perform pg_temp.como(adm);
  v_err := pg_temp.mensaje(format(
    'insert into sueldo_ventas_semana (empleado_id, desde, hasta, total_boletas_mayores, creado_por) values (%L, ''2099-06-08'', ''2099-06-14'', 100, %L)', per, adm));
  if v_err like 'PERIODO_CERRADO:%' then r := r || '[ok] 4;'; else r := r || format('[FALLA] 4: %s;', v_err); end if;

  -- ── 5) Restricciones: negativo, al revés, más de 10 días ─────────────────────────────────
  if pg_temp.mensaje(format('insert into sueldo_ventas_semana (empleado_id, desde, hasta, total_boletas_mayores) values (%L, ''2099-07-20'', ''2099-07-26'', -1)', per)) <> 'ok'
     and pg_temp.mensaje(format('insert into sueldo_ventas_semana (empleado_id, desde, hasta, total_boletas_mayores) values (%L, ''2099-07-20'', ''2099-07-19'', 1)', per)) <> 'ok'
     and pg_temp.mensaje(format('insert into sueldo_ventas_semana (empleado_id, desde, hasta, total_boletas_mayores) values (%L, ''2099-07-20'', ''2099-07-31'', 1)', per)) <> 'ok' then
    r := r || '[ok] 5;';
  else r := r || '[FALLA] 5;'; end if;

  -- ── 6) Cambiar una semana después del cálculo: el cierre pide recalcular ─────────────────
  e := public.sueldo_entrada(ac2, '2099-07-01', '2099-07-31') || public.sueldo_entrada_pago(ac2);
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada,
      parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac2, per, '2099-07-01', '2099-07-31', 'borrador', e, '{}',
            '{"lineas":[{"grupo":"ingreso","concepto":"Sueldo","detalle":"","regla":"","monto":600}]}', 600, 1, 't')
    returning id into v_liq;
  update sueldo_ventas_semana set total_boletas_mayores = 2000 where empleado_id = per and desde = '2099-07-06';
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_cerrar(%L)', v_liq));
  if v_err like 'DESACTUALIZADA:%' then r := r || '[ok] 6;'; else r := r || format('[FALLA] 6: %s;', v_err); end if;

  perform pg_temp.dueno();
  raise exception 'RESULTADO 0166 --> %', r;
end $$;
