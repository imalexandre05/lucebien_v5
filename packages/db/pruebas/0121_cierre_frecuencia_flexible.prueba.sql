-- Prueba de la migración 0121_cierre_frecuencia_flexible.sql
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-06-frecuencia-pago-flexible-design.md §9.3.
-- Auditoría: docs/auditorias/2026-10-06-sueldos.md (D-1, D-10), escenarios E1 y E2 con sus números.
--
-- QUÉ PRUEBA. Que el cierre (0111 + 0121) acepte una entrada cuya cuota NO es la del contrato
-- cuando la cuota sale del calendario (prorrateo o cambio de frecuencia), y que rechace con
-- DESACTUALIZADA cuando lo que decide la cuota cambió después de calcular.
--
--   1. E1': mensual del 31-ene al 15-jul, S/1500. Último tramo 1–15 jul prorrateado por el core a
--      S/725,81 (15 de 31 días). Antes: DESACTUALIZADA (sueldoPactado) para siempre. Ahora cierra.
--   2. E2: mensual S/1300 del 10-ago; pasa a quincenal S/700 desde el 10-sep. El tramo 10–24 sep
--      guarda 700 y la base dice 1300 en el contrato. Antes: DESACTUALIZADA. Ahora cierra.
--   3. D-10 en secuencia: borrador del 25-sep al 09-oct calculado con 700; después se confirma un
--      cambio a S/750 desde el 25-sep. El cierre responde DESACTUALIZADA nombrando
--      cambiosFrecuencia, y no sella nada.
--   4. El cambio del 10-sep ya rige sobre lo pagado: no se puede borrar ni modificar.
--   5. Corrección: entrada con `cuotaFijada` y la cuota pagada (650) en un tramo corto: cierra.
--   6. Borrador anterior a la 0121 (sin contratoPago): DESACTUALIZADA nombrando contratoPago.
--   7. Se edita la cuota del contrato después de calcular: DESACTUALIZADA nombrando contratoPago.
--
-- LA CARRERA REAL (dos sesiones) se probó a mano con tools/postgres-local.sh; el procedimiento está
-- al final de este archivo.
--
-- Se descarta sola: termina lanzando una excepción con el resultado. Todo en 2099–2101.
-- Cómo se corre:  bash tools/postgres-local.sh probar 0121

create or replace function pg_temp.montar(p_adm uuid, p_desde date, p_hasta date, p_mod text, p_cuota numeric)
returns uuid language plpgsql as $f$
declare ac uuid;
begin
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (p_adm, p_desde, p_hasta, p_mod, p_cuota, 'vigente', p_adm)
    returning id into ac;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
  select ac, d, time '09:00', time '17:00' from generate_series(1,7) d;
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
  select p_adm, d::date, 'M', 'trabajado', time '09:00', time '17:00', 'manual'
  from generate_series(p_desde, p_hasta, interval '1 day') d;
  return ac;
end $f$;

-- Guarda el borrador como crearBorrador() después de la 0121: sueldo_entrada + sueldo_entrada_pago,
-- con la cuota que calculó el core en `sueldoPactado` (acá, el número a mano de la auditoría).
create or replace function pg_temp.borrador(p_ac uuid, p_adm uuid, p_desde date, p_hasta date,
                                            p_cuota numeric, p_extra jsonb default '{}'::jsonb,
                                            p_con_pago boolean default true)
returns uuid language plpgsql as $f$
declare liq uuid; e jsonb;
begin
  e := sueldo_entrada(p_ac, p_desde, p_hasta);
  if p_con_pago then e := e || sueldo_entrada_pago(p_ac); end if;
  e := e || jsonb_build_object('sueldoPactado', p_cuota) || p_extra;
  insert into sueldo_liquidaciones(
    acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
  ) values (
    p_ac, p_adm, p_desde, p_hasta, 'borrador', e, '{}'::jsonb,
    jsonb_build_object('lineas', jsonb_build_array(jsonb_build_object(
      'grupo','ingreso','concepto','Sueldo','detalle','prueba 0121','regla','RN-19','monto',p_cuota))),
    p_cuota, 1, 'prueba-0121'
  ) returning id into liq;
  return liq;
end $f$;

create or replace function pg_temp.cerrar(p_liq uuid) returns text language plpgsql as $f$
begin
  perform sueldo_liquidacion_cerrar(p_liq);
  return 'cerrada';
exception when others then
  return sqlerrm;
end $f$;

do $$
declare
  adm uuid; ac1 uuid; ac2 uuid; ac3 uuid; liq uuid; m text; n int; r text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then raise exception 'No pude hacerme pasar por el administrador'; end if;

  -- 1) E1': último tramo prorrateado.
  ac1 := pg_temp.montar(adm, '2099-01-31', '2099-07-15', 'mensual', 1500);
  liq := pg_temp.borrador(ac1, adm, '2099-07-01', '2099-07-15', 725.81);
  m := pg_temp.cerrar(liq);
  r := r || case when m = 'cerrada' then '1=ok ' else '1=FALLA(' || m || ') ' end;

  -- 2) E2: tramo posterior a un cambio de frecuencia.
  ac2 := pg_temp.montar(adm, '2099-08-10', '2100-02-09', 'mensual', 1300);
  liq := pg_temp.borrador(ac2, adm, '2099-08-10', '2099-09-09', 1300);
  m := pg_temp.cerrar(liq);
  if m <> 'cerrada' then r := r || '2a=FALLA(' || m || ') '; end if;
  insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado, modalidad_anterior, sueldo_pactado_anterior, creado_por)
    values (ac2, '2099-09-10', 'quincenal', 700, 'mensual', 1300, adm);
  liq := pg_temp.borrador(ac2, adm, '2099-09-10', '2099-09-24', 700);
  m := pg_temp.cerrar(liq);
  r := r || case when m = 'cerrada' then '2=ok ' else '2=FALLA(' || m || ') ' end;

  -- 3) D-10 en secuencia: el cambio llega entre el cálculo y el cierre.
  liq := pg_temp.borrador(ac2, adm, '2099-09-25', '2099-10-09', 700);
  insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado, creado_por)
    values (ac2, '2099-09-25', 'quincenal', 750, adm);
  m := pg_temp.cerrar(liq);
  select count(*) into n from sueldo_movimientos where liquidacion_id = liq;
  r := r || case when m like 'DESACTUALIZADA:%cambiosFrecuencia%' and n = 0
                  and (select estado from sueldo_liquidaciones where id = liq) = 'borrador'
                 then '3=ok ' else '3=FALLA(' || m || ') ' end;

  -- 4) El cambio del 10-sep rige sobre lo pagado (hasta el 24-sep): ni borrar ni modificar.
  begin
    delete from sueldo_acuerdo_cambios where acuerdo_id = ac2 and desde = '2099-09-10';
    r := r || '4a=FALLA ';
  exception when others then
    r := r || case when sqlerrm like 'ESTADO:%' then '4a=ok ' else '4a=FALLA(' || sqlerrm || ') ' end;
  end;
  begin
    update sueldo_acuerdo_cambios set sueldo_pactado = 1 where acuerdo_id = ac2 and desde = '2099-09-10';
    r := r || '4b=FALLA ';
  exception when others then
    r := r || case when sqlerrm like 'ESTADO:%' then '4b=ok ' else '4b=FALLA(' || sqlerrm || ') ' end;
  end;
  -- El que todavía no se pagó (25-sep) sí se puede borrar.
  delete from sueldo_acuerdo_cambios where acuerdo_id = ac2 and desde = '2099-09-25';
  get diagnostics n = row_count;
  r := r || case when n = 1 then '4c=ok ' else '4c=FALLA ' end;

  -- 5) Corrección con la cuota pagada fijada, sobre un tramo corto.
  ac3 := pg_temp.montar(adm, '2101-01-10', '2101-03-14', 'mensual', 650);
  liq := pg_temp.borrador(ac3, adm, '2101-03-10', '2101-03-14', 650, '{"cuotaFijada": true}'::jsonb);
  m := pg_temp.cerrar(liq);
  r := r || case when m = 'cerrada' then '5=ok ' else '5=FALLA(' || m || ') ' end;

  -- 6) Borrador con la forma anterior a la 0121.
  liq := pg_temp.borrador(ac3, adm, '2101-01-10', '2101-02-09', 650, '{}'::jsonb, false);
  m := pg_temp.cerrar(liq);
  r := r || case when m like 'DESACTUALIZADA:%contratoPago%' then '6=ok ' else '6=FALLA(' || m || ') ' end;
  delete from sueldo_liquidaciones where id = liq and estado = 'borrador';

  -- 7) Se edita la cuota del contrato después de calcular.
  liq := pg_temp.borrador(ac3, adm, '2101-01-10', '2101-02-09', 650);
  update sueldo_acuerdos set sueldo_pactado = 700 where id = ac3;
  m := pg_temp.cerrar(liq);
  r := r || case when m like 'DESACTUALIZADA:%contratoPago%' then '7=ok ' else '7=FALLA(' || m || ') ' end;

  raise exception 'RESULTADO 0121: %', r;
end $$;

-- ── La carrera real, a mano (dos consolas de `bash tools/postgres-local.sh psql`) ────────────────
-- Montaje: un contrato mensual S/1300 desde el 10-ago con el tramo 10-ago–09-sep cerrado y un
-- borrador del 10-sep al 09-oct calculado con 1300.
--   A: begin; select sueldo_liquidacion_cerrar('<borrador>');   -- toma el contrato, sin commit
--   B: insert into sueldo_acuerdo_cambios(... desde '2099-09-10', 'quincenal', 700 ...);
--      → ESPERA (el trigger pide el mismo bloqueo).
--   A: commit;
--   B: → ESTADO: el cambio tiene que empezar después de lo ya pagado (hasta 2099-10-09).
-- Al revés (B confirma primero, A cierra después): A responde DESACTUALIZADA (cambiosFrecuencia).
