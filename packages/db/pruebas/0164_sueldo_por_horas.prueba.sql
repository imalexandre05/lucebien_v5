-- Prueba de la migración 0164_sueldo_por_horas.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-18-sueldo-por-horas-design.md §4 y §7 (caso 11)
-- Escrita ANTES que la migración (Zone Guard): si falla, se corrige el código, nunca se afloja la
-- prueba sin corregir y confirmar la spec. Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0164

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
  adm uuid; per uuid; vie uuid;
  ac uuid; ac_viejo uuid; v_liq uuid; v_liq2 uuid;
  j jsonb; e jsonb; v_err text;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P164-AD', 'Prueba 164 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P164-PE', 'Prueba 164 Por horas', 'PH', 'confeccionista') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P164-VI', 'Prueba 164 Sueldo fijo', 'SF', 'confeccionista') returning id into vie;

  -- Contrato por horas: S/5 la hora, sólo los lunes 08:00–13:00. 2099-05-04 es lunes.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado, tarifa_hora)
    values (per, '2099-05-04', '2099-05-31', 0, adm, 'vigente', 5) returning id into ac;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin) values (ac, 1, '08:00', '13:00');
  -- Contrato de sueldo fijo, como los que ya existen.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (vie, '2099-05-04', '2099-05-31', 650, adm, 'vigente') returning id into ac_viejo;

  perform pg_temp.como(adm);

  -- ── 1) La tarifa viaja en contratoPago ────────────────────────────────────────────────────
  j := public.sueldo_entrada_pago(ac);
  if (j #>> '{contratoPago,tarifaHora}')::numeric = 5 then r := r || '[ok] 1: la tarifa viaja en contratoPago;';
  else r := r || format('[FALLA] 1: %s;', j -> 'contratoPago'); end if;

  -- ── 2) Un contrato sin tarifa da exactamente las mismas claves que antes ─────────────────
  j := public.sueldo_entrada_pago(ac_viejo);
  if not (j -> 'contratoPago' ? 'tarifaHora')
     and (select array_agg(k order by k) from jsonb_object_keys(j -> 'contratoPago') k)
         = array['cadaDias', 'fechaFin', 'fechaInicio', 'modalidad', 'sueldoPactado'] then
    r := r || '[ok] 2: sin tarifa, contratoPago no cambia;';
  else r := r || format('[FALLA] 2: %s;', j -> 'contratoPago'); end if;

  -- ── 3) Una tarifa en cero o negativa se rechaza ───────────────────────────────────────────
  v_err := pg_temp.mensaje(format('update sueldo_acuerdos set tarifa_hora = 0 where id = %L', ac));
  if v_err <> 'ok' then r := r || '[ok] 3: tarifa 0 rechazada;';
  else r := r || '[FALLA] 3: aceptó tarifa 0;'; end if;

  -- ── 4) Los cambios: con tarifa la emiten; sin tarifa, la clave no aparece ─────────────────
  perform pg_temp.dueno();
  insert into sueldo_acuerdo_cambios (acuerdo_id, desde, modalidad, cada_dias, sueldo_pactado, creado_por, tarifa_hora)
    values (ac, '2099-05-18', 'mensual', null, 0, adm, 6);
  insert into sueldo_acuerdo_cambios (acuerdo_id, desde, modalidad, cada_dias, sueldo_pactado, creado_por)
    values (ac, '2099-05-25', 'semanal', null, 0, adm);
  perform pg_temp.como(adm);
  j := public.sueldo_entrada_pago(ac);
  if (j #>> '{cambiosFrecuencia,0,tarifaHora}')::numeric = 6
     and not (j #> '{cambiosFrecuencia,1}' ? 'tarifaHora') then
    r := r || '[ok] 4: los cambios llevan su tarifa sólo si la tienen;';
  else r := r || format('[FALLA] 4: %s;', j -> 'cambiosFrecuencia'); end if;
  v_err := pg_temp.mensaje(format('update sueldo_acuerdo_cambios set tarifa_hora = -1 where acuerdo_id = %L', ac));
  if v_err <> 'ok' then r := r || '[ok] 4b: tarifa negativa en un cambio rechazada;';
  else r := r || '[FALLA] 4b: aceptó tarifa negativa en un cambio;'; end if;

  -- ── 5) El cierre de un borrador por horas pasa; si la tarifa cambia después, DESACTUALIZADA ─
  perform pg_temp.dueno();
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente, minutos_tardanza)
    values (per, '2099-05-04', 'M', 'trabajado', '08:00', '13:00', 'manual', 0),
           (per, '2099-05-11', 'M', 'trabajado', '08:00', '13:00', 'manual', 0);
  perform pg_temp.como(adm);
  e := public.sueldo_entrada(ac, '2099-05-04', '2099-05-10') || public.sueldo_entrada_pago(ac);
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada,
      parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, per, '2099-05-04', '2099-05-10', 'borrador', e, '{}',
            '{"lineas":[{"grupo":"ingreso","concepto":"Horas trabajadas","detalle":"5 h","regla":"","monto":25}]}',
            25, 5, 't')
    returning id into v_liq;
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_cerrar(%L)', v_liq));
  if v_err = 'ok' then r := r || '[ok] 5a: el borrador por horas se cierra;';
  else r := r || format('[FALLA] 5a: %s;', v_err); end if;

  e := public.sueldo_entrada(ac, '2099-05-11', '2099-05-17') || public.sueldo_entrada_pago(ac);
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada,
      parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, per, '2099-05-11', '2099-05-17', 'borrador', e, '{}',
            '{"lineas":[{"grupo":"ingreso","concepto":"Horas trabajadas","detalle":"5 h","regla":"","monto":25}]}',
            25, 5, 't')
    returning id into v_liq2;
  update sueldo_acuerdos set tarifa_hora = 5.5 where id = ac;
  v_err := pg_temp.mensaje(format('select sueldo_liquidacion_cerrar(%L)', v_liq2));
  if v_err like 'DESACTUALIZADA:%' then r := r || '[ok] 5b: cambiar la tarifa después del cálculo pide recalcular;';
  else r := r || format('[FALLA] 5b: %s;', v_err); end if;

  perform pg_temp.dueno();
  raise exception 'RESULTADO 0164 --> %', r;
end $$;
