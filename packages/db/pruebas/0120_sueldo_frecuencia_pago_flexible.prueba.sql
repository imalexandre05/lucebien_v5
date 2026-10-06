-- Prueba de la migración 0120_sueldo_frecuencia_pago_flexible.sql
--
-- Comprueba: modalidades nuevas, cada_dias coherente, contratos existentes intactos, el trigger de
-- fechas del cambio, la unicidad (acuerdo, desde) y el aislamiento por RLS.
-- Se descarta sola: termina lanzando una excepción con el resultado (aborta la transacción).
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0120

do $$
declare
  adm uuid; otro uuid; ac uuid; ac2 uuid; n int; r text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  select id into otro from empleados where id <> adm and rol not in ('admin','dueno') order by id limit 1;
  if adm is null or otro is null then raise exception 'La prueba necesita un admin y otro empleado'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then raise exception 'No pude hacerme pasar por el administrador'; end if;

  -- A) Un contrato mensual como los de hoy sigue valiendo, con cada_dias null.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, creado_por)
    values (adm,'2099-01-10','2099-07-09','mensual', 650, adm) returning id into ac;
  r := r || 'A=ok ';

  -- B) Quincenal y 'dias' con N válido entran.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, creado_por)
    values (otro,'2099-01-10','2099-07-09','quincenal', 325, adm);
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias, sueldo_pactado, creado_por)
    values (otro,'2099-09-01','2099-12-31','dias', 10, 200, adm);
  r := r || 'B=ok ';

  -- C) 'dias' sin N, con N fuera de 1–62, o N en otra modalidad: rechazado.
  begin insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado)
    values (adm,'2100-01-01','2100-02-01','dias', 1); r := r || 'C1=FALLA ';
  exception when check_violation then r := r || 'C1=ok '; end;
  begin insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias, sueldo_pactado)
    values (adm,'2100-01-01','2100-02-01','dias', 63, 1); r := r || 'C2=FALLA ';
  exception when check_violation then r := r || 'C2=ok '; end;
  begin insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias, sueldo_pactado)
    values (adm,'2100-01-01','2100-02-01','mensual', 7, 1); r := r || 'C3=FALLA ';
  exception when check_violation then r := r || 'C3=ok '; end;
  begin insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado)
    values (adm,'2100-01-01','2100-02-01','diaria', 1); r := r || 'C4=FALLA ';
  exception when check_violation then r := r || 'C4=ok '; end;

  -- D) El cambio: dentro del contrato entra; el primer día o fuera, no.
  insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado,
    modalidad_anterior, sueldo_pactado_anterior, creado_por)
    values (ac,'2099-04-10','quincenal', 325, 'mensual', 650, adm);
  r := r || 'D1=ok ';
  begin insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado)
    values (ac,'2099-01-10','semanal', 1); r := r || 'D2-PRIMER-DIA=FALLA ';
  exception when others then r := r || 'D2=ok '; end;
  begin insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado)
    values (ac,'2099-08-01','semanal', 1); r := r || 'D3-FUERA=FALLA ';
  exception when others then r := r || 'D3=ok '; end;
  begin insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado)
    values (ac,'2099-04-10','semanal', 1); r := r || 'D4-DUPLICADO=FALLA ';
  exception when unique_violation then r := r || 'D4=ok '; end;
  begin insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado)
    values (ac,'2099-05-10','dias', 1); r := r || 'D5-DIAS-SIN-N=FALLA ';
  exception when check_violation then r := r || 'D5=ok '; end;

  -- E) RLS: el admin ve el cambio; otro empleado, que no es dueño del acuerdo, no ve ninguno.
  select count(*) into n from sueldo_acuerdo_cambios; r := r || 'E-admin=' || n || ' ';
  perform set_config('request.jwt.claims', json_build_object('sub', otro, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from sueldo_acuerdo_cambios; r := r || 'E-otro=' || n || ' ';
  begin insert into sueldo_acuerdo_cambios(acuerdo_id, desde, modalidad, sueldo_pactado)
    values (ac,'2099-06-10','semanal', 1); r := r || 'E-ESCRIBE=FALLA ';
  exception when others then r := r || 'E-escribe=ok '; end;
  reset role;

  raise exception 'RESULTADO: %', r;
end $$;
-- Esperado: A=ok B=ok C1..C4=ok D1=ok D2..D5=ok E-admin=1 E-otro=0 E-escribe=ok
