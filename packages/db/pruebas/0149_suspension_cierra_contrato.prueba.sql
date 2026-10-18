-- Prueba de la migración 0149_suspension_cierra_contrato.sql
-- Spec: docs/superpowers/specs/empleados/2026-10-18-suspension-cierra-contrato-design.md
--
-- Ataca lo que la spec promete (§2.1, §2.2, §2.3):
--   A  suspender cierra el contrato que cubre p_hoy, con fin = p_hoy;
--   B  no toca un contrato que ya terminó, uno que termina hoy, ni uno que empieza después;
--   C  una liquidación no anulada posterior a p_hoy BLOQUEA, con mensaje accionable, y no escribe
--      nada (la persona sigue activa y el contrato igual); una anulada no bloquea;
--   D  un no-admin no puede; el último admin activo no se puede suspender;
--   E  reactivar NO reabre el contrato;
--   F  huellero_declarar_faltas_del_dia no declara falta a quien tiene activo=false, y a quien
--      está activo sí (la prueba no pasa por el motivo equivocado);
--   G  sueldo_acuerdo_guardar_turnos reemplaza el horario de una vez y, si el nuevo solapa,
--      conserva el anterior; un no-admin no puede; anon no tiene EXECUTE.
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; no deja ni una fila.
-- OJO: sin el set_config('request.jwt.claims', ...) auth.uid() es null y las RPC rechazan a todos
-- ("solo administradores"), lo que haría pasar el caso de rechazo por el motivo equivocado. Correr
-- el archivo ENTERO de una sola vez.
--
-- Cómo se corre: bash tools/probar-migracion.sh 0149

do $$
declare
  adm uuid; adm2 uuid; col uuid;
  e_vig uuid; e_pasado uuid; e_futuro uuid; e_hoyfin uuid; e_liq uuid; e_liqanu uuid; e_hue_a uuid; e_hue_s uuid;
  ac_vig uuid; ac_pasado uuid; ac_futuro uuid; ac_hoyfin uuid; ac_liq uuid; ac_liqanu uuid; ac_hue_a uuid; ac_hue_s uuid;
  v_hoy constant date := '2099-03-15';
  v_fin date; v_activo boolean; v_estado text; v_res jsonb; v_msg text; v_n int; v_cond text;
  v_fallas text := '';
  v_turnos_a jsonb := '[{"dia_semana":1,"hora_inicio":"09:00","hora_fin":"13:00","lugar":"AL"},
                        {"dia_semana":1,"hora_inicio":"13:00","hora_fin":"20:00","lugar":"AL"}]';
  v_turnos_solapa jsonb := '[{"dia_semana":2,"hora_inicio":"09:00","hora_fin":"14:00","lugar":"AL"},
                             {"dia_semana":2,"hora_inicio":"13:00","hora_fin":"20:00","lugar":"AL"}]';
  d int;
begin
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Admin 0149', '0149a', 'admin', true, 'AL', 'AA') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Admin2 0149', '0149b', 'admin', true, 'AL', 'AB') returning id into adm2;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Colab 0149', '0149c', 'ventas_junior', true, 'AL', 'CC') returning id into col;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Vigente 0149', '0149d', 'ventas_junior', true, 'AL', 'V1') returning id into e_vig;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Pasado 0149', '0149e', 'ventas_junior', true, 'AL', 'V2') returning id into e_pasado;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Futuro 0149', '0149f', 'ventas_junior', true, 'AL', 'V3') returning id into e_futuro;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('HoyFin 0149', '0149g', 'ventas_junior', true, 'AL', 'V4') returning id into e_hoyfin;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Liq 0149', '0149h', 'ventas_junior', true, 'AL', 'V5') returning id into e_liq;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('LiqAnu 0149', '0149i', 'ventas_junior', true, 'AL', 'V6') returning id into e_liqanu;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('HueA 0149', '0149j', 'ventas_junior', true, 'AL', 'HA') returning id into e_hue_a;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('HueS 0149', '0149k', 'ventas_junior', false, 'AL', 'HS') returning id into e_hue_s;

  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_vig,    '2099-03-01', '2099-06-30', 1500) returning id into ac_vig;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_pasado, '2099-01-01', '2099-02-28', 1500) returning id into ac_pasado;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_futuro, '2099-05-01', '2099-05-31', 1500) returning id into ac_futuro;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_hoyfin, '2099-03-01', '2099-03-15', 1500) returning id into ac_hoyfin;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_liq,    '2099-03-01', '2099-06-30', 1500) returning id into ac_liq;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_liqanu, '2099-03-01', '2099-06-30', 1500) returning id into ac_liqanu;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_hue_a,  '2099-08-01', '2099-08-31', 1500) returning id into ac_hue_a;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado) values (e_hue_s,  '2099-08-01', '2099-08-31', 1500) returning id into ac_hue_s;

  -- Turnos los 7 días para los dos del huellero (así cualquier fecha de agosto tiene turno).
  for d in 1..7 loop
    insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin) values (ac_hue_a, d, '09:00', '13:00'), (ac_hue_s, d, '09:00', '13:00');
  end loop;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin) values (ac_vig, 3, '09:00', '13:00');

  -- Liquidación cerrada que llega más allá de la baja (bloquea) y otra anulada (no bloquea).
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac_liq, e_liq, '2099-03-01', '2099-03-31', '{}', '{}', '{}', 1000, 10, 'prueba');
  update sueldo_liquidaciones set estado = 'cerrada', cerrada_en = now(), cerrada_por = adm where acuerdo_id = ac_liq;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac_liqanu, e_liqanu, '2099-03-01', '2099-03-31', '{}', '{}', '{}', 1000, 10, 'prueba');
  update sueldo_liquidaciones set estado = 'cerrada', cerrada_en = now(), cerrada_por = adm where acuerdo_id = ac_liqanu;
  update sueldo_liquidaciones set estado = 'anulada', anulada_en = now(), anulada_por = adm, anulada_motivo = 'prueba' where acuerdo_id = ac_liqanu;

  -- ── A) suspender cierra el contrato que cubre hoy ─────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  v_res := empleado_suspender(e_vig, v_hoy);
  reset role;
  select fecha_fin into v_fin from sueldo_acuerdos where id = ac_vig;
  select activo, estado into v_activo, v_estado from empleados where id = e_vig;
  if v_fin is distinct from v_hoy then v_fallas := v_fallas || format(E'\n  · A: fecha_fin quedó %s, esperaba %s', v_fin, v_hoy); end if;
  if v_activo or v_estado is distinct from 'suspendido' then v_fallas := v_fallas || E'\n  · A: la ficha no quedó suspendida'; end if;
  if coalesce((v_res->>'contrato_cerrado')::boolean, false) is not true then v_fallas := v_fallas || format(E'\n  · A: respuesta sin contrato_cerrado: %s', v_res); end if;
  select count(*) into v_n from sueldo_acuerdo_turnos where acuerdo_id = ac_vig;
  if v_n <> 1 then v_fallas := v_fallas || E'\n  · A: el cierre tocó los turnos del contrato'; end if;

  -- ── B) pasado, futuro y "termina hoy" no se tocan ─────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  perform empleado_suspender(e_pasado, v_hoy);
  perform empleado_suspender(e_futuro, v_hoy);
  v_res := empleado_suspender(e_hoyfin, v_hoy);
  reset role;
  if (select fecha_fin from sueldo_acuerdos where id = ac_pasado) <> '2099-02-28' then v_fallas := v_fallas || E'\n  · B: tocó un contrato ya terminado'; end if;
  if (select fecha_fin from sueldo_acuerdos where id = ac_futuro) <> '2099-05-31'
     or (select fecha_inicio from sueldo_acuerdos where id = ac_futuro) <> '2099-05-01' then v_fallas := v_fallas || E'\n  · B: tocó un contrato futuro'; end if;
  if (select fecha_fin from sueldo_acuerdos where id = ac_hoyfin) <> v_hoy then v_fallas := v_fallas || E'\n  · B: movió un contrato que ya terminaba hoy'; end if;
  if coalesce((v_res->>'contrato_cerrado')::boolean, false) then v_fallas := v_fallas || E'\n  · B: dijo que cerró un contrato que ya terminaba hoy'; end if;
  if (select activo from empleados where id = e_pasado) then v_fallas := v_fallas || E'\n  · B: no suspendió a quien no tenía contrato vigente'; end if;

  -- ── C) liquidación posterior bloquea y no escribe nada; la anulada no bloquea ─────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  begin
    perform empleado_suspender(e_liq, v_hoy);
    v_fallas := v_fallas || E'\n  · C: suspendió a alguien con una liquidación posterior a la baja';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like 'ESTADO:%' or v_msg not like '%2099-03-31%' then
      v_fallas := v_fallas || format(E'\n  · C: el mensaje no es accionable (ESTADO + periodo): %s', v_msg);
    end if;
  end;
  perform empleado_suspender(e_liqanu, v_hoy);
  reset role;
  if not (select activo from empleados where id = e_liq) or (select fecha_fin from sueldo_acuerdos where id = ac_liq) <> '2099-06-30' then
    v_fallas := v_fallas || E'\n  · C: el bloqueo dejó escrituras a medias';
  end if;
  if (select fecha_fin from sueldo_acuerdos where id = ac_liqanu) <> v_hoy then
    v_fallas := v_fallas || E'\n  · C: una liquidación anulada bloqueó el cierre';
  end if;

  -- ── D) no-admin rechazado; último admin protegido ────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  begin
    perform empleado_suspender(e_hue_a, v_hoy);
    v_fallas := v_fallas || E'\n  · D: un colaborador sin autoridad pudo suspender';
  exception when others then null;
  end;
  reset role;
  if not (select activo from empleados where id = e_hue_a) then v_fallas := v_fallas || E'\n  · D: el intento del no-admin sí suspendió'; end if;

  update empleados set activo = false where rol in ('admin', 'dueno') and id not in (adm, adm2);
  update empleados set activo = false where id = adm2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  begin
    perform empleado_suspender(adm, v_hoy);
    v_fallas := v_fallas || E'\n  · D: suspendió al último administrador activo';
  exception when others then
    if sqlerrm not like '%último administrador%' then v_fallas := v_fallas || format(E'\n  · D: falló por otro motivo: %s', sqlerrm); end if;
  end;
  reset role;
  update empleados set activo = true where id = adm2;

  -- ── E) reactivar no reabre el contrato ───────────────────────────────────────────────────
  update empleados set activo = true, estado = 'activo' where id = e_vig;
  if (select fecha_fin from sueldo_acuerdos where id = ac_vig) <> v_hoy then v_fallas := v_fallas || E'\n  · E: reactivar reabrió el contrato'; end if;

  -- ── F) el huellero no declara falta a un suspendido, sí a un activo ──────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  v_res := huellero_declarar_faltas_del_dia('2099-08-10');
  reset role;
  select condicion into v_cond from asistencias where empleado_id = e_hue_a and fecha = '2099-08-10';
  if v_cond is distinct from 'falta' then v_fallas := v_fallas || format(E'\n  · F: al activo no se le declaró la falta (cond=%s, res=%s)', v_cond, v_res); end if;
  if exists (select 1 from asistencias where empleado_id = e_hue_s and fecha = '2099-08-10') then
    v_fallas := v_fallas || E'\n  · F: se le declaró falta a una persona suspendida';
  end if;

  -- ── G) horario atómico ───────────────────────────────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  perform sueldo_acuerdo_guardar_turnos(ac_hue_a, v_turnos_a);
  reset role;
  select count(*) into v_n from sueldo_acuerdo_turnos where acuerdo_id = ac_hue_a;
  if v_n <> 2 or exists (select 1 from sueldo_acuerdo_turnos where acuerdo_id = ac_hue_a and dia_semana <> 1) then
    v_fallas := v_fallas || format(E'\n  · G: el horario no se reemplazó (quedaron %s turnos)', v_n);
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  begin
    perform sueldo_acuerdo_guardar_turnos(ac_hue_a, v_turnos_solapa);
    v_fallas := v_fallas || E'\n  · G: aceptó un horario con turnos solapados';
  exception when others then null;
  end;
  reset role;
  select count(*) into v_n from sueldo_acuerdo_turnos where acuerdo_id = ac_hue_a and dia_semana = 1;
  if v_n <> 2 or exists (select 1 from sueldo_acuerdo_turnos where acuerdo_id = ac_hue_a and dia_semana = 2) then
    v_fallas := v_fallas || E'\n  · G: tras el error el horario anterior no quedó intacto';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  begin
    perform sueldo_acuerdo_guardar_turnos(ac_hue_a, '[]'::jsonb);
    v_fallas := v_fallas || E'\n  · G: un no-admin pudo reemplazar el horario';
  exception when others then null;
  end;
  reset role;
  if (select count(*) from sueldo_acuerdo_turnos where acuerdo_id = ac_hue_a) <> 2 then v_fallas := v_fallas || E'\n  · G: el no-admin sí modificó el horario'; end if;

  if has_function_privilege('anon', 'sueldo_acuerdo_guardar_turnos(uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'empleado_suspender(uuid, date)', 'execute') then
    v_fallas := v_fallas || E'\n  · G: anon tiene EXECUTE sobre una RPC nueva';
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0149: OK — suspender cierra el contrato, lo liquidado bloquea, reactivar no reabre, el huellero ignora a los suspendidos y el horario es atómico';
  else
    raise exception 'RESULTADO 0149: FALLAS —%', v_fallas;
  end if;
end $$;
