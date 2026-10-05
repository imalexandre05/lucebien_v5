-- Prueba de la migración 0117_pago_por_puntos.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-05-pago-por-puntos-design.md §3 y §6.
--
-- Qué comprueba (los dos pedidos de la spec para el lado SQL):
--   1. Parámetros VACÍOS no cambian nada: la entrada de `sueldo_entrada` conserva las 17 claves de
--      siempre, `parametros` no trae ninguna clave nueva, y `puntosPeriodo` viaja (es sólo un dato).
--   2. Con parámetros definidos: `parametros` trae `puntosMetaMensual` y `solesPorPunto` como número
--      y `puntosPeriodo` es EXACTAMENTE lo que devuelve `private.evaluacion_componentes_datos` para
--      el mismo empleado y el mismo rango (no se recalcula de otra forma). Se siembran 40,5 puntos
--      de pipeline un día dentro del rango y se piden dos rangos: uno que los incluye y uno que no.
--   3. «En blanco = no configurado»: una clave vacía NO aparece en `parametros`.
--   4. Basura en la clave corta con CONFIG: (misma trampa que documenta la 0073).
--   5. Aislamiento: alguien que no es administrador no puede pedir los puntos de otra persona.
--      Todo corre como el rol `authenticated`, no como superusuario (ver el comentario del montaje).
--
-- QUÉ NO PRUEBA. La fórmula del bono (core: sueldos-pago-puntos.test.ts) ni el cierre seguro con
-- datos actuales (PR #44, aún no está en main).
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; eso aborta la transacción y no
-- queda ni una fila. Correr el archivo ENTERO de una vez (el set_config del jwt vale sólo dentro de
-- esta transacción; sin él `sueldo_entrada` devuelve PERMISO y la prueba no comprueba nada).
--
-- Cómo se corre:  bash tools/postgres-local.sh probar 0117   (o  bash tools/probar-migracion.sh 0117)

do $$
declare
  adm      uuid;
  ac       uuid;
  v_vacio  jsonb;
  v_def    jsonb;
  v_corto  jsonb;
  v_pts    numeric;
  v_ref    numeric;
  v_ref2   numeric;
  v_msg    text;
  r        text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- ── Montaje: acuerdo de 10 días con horario todos los días; tres días declarados ────────────
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (adm, '2099-02-01', '2099-02-10', 'semanal', 100, 'vigente', adm)
    returning id into ac;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
  select ac, d, h.desde, h.hasta
  from generate_series(1,7) d, (values (time '09:00', time '13:00'), (time '13:00', time '20:00')) as h(desde, hasta);
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    values (adm, '2099-02-02', 'M', 'trabajado', time '09:00', time '13:00', 'huellero'),
           (adm, '2099-02-03', 'M', 'trabajado', time '09:00', time '13:00', 'huellero');
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    values (adm, '2099-02-02', 'T', 'trabajado', time '13:00', time '20:00', 'huellero'),
           (adm, '2099-02-03', 'T', 'trabajado', time '13:00', time '20:00', 'huellero');
  -- 40,5 puntos de pipeline el 3-feb, a mediodía UTC (el mismo día en UTC y en hora Perú).
  insert into pipeline_puntos(empleado_id, etapa, puntos, fecha)
    values (adm, 'prueba', 40.5, timestamptz '2099-02-03 12:00:00+00');
  -- La referencia se calcula ACÁ, como superusuario: la 0067 le quitó a `authenticated` el EXECUTE
  -- de esta función, y justamente por eso `sueldo_entrada` la llama a través de un wrapper.
  v_ref  := (private.evaluacion_componentes_datos(adm, '2099-02-02', '2099-02-03')->>'puntosTotal')::numeric;
  v_ref2 := (private.evaluacion_componentes_datos(adm, '2099-02-02', '2099-02-02')->>'puntosTotal')::numeric;
  r := r || 'montaje=ok; ';

  -- Desde acá la prueba corre COMO `authenticated` (el rol real de la app), no como superusuario:
  -- la 0067 le quitó el EXECUTE a `evaluacion_componentes_datos`, y un superusuario no notaría que
  -- `sueldo_entrada` (que corre como quien la llama) ya no puede llamarla.
  set local role authenticated;

  -- ═══ 1. Parámetros vacíos (el estado en que se despliega) ══════════════════════════════════
  delete from config where clave in ('sueldo_puntos_meta_mensual', 'sueldo_soles_por_punto');
  begin
    -- Las filas existen vacías tras la migración; aquí se simula tanto «vacía» como «ausente».
    insert into config(clave, valor) values ('sueldo_puntos_meta_mensual', ''), ('sueldo_soles_por_punto', '');
    v_vacio := sueldo_entrada(ac, '2099-02-02', '2099-02-03');
    if (v_vacio - 'puntosPeriodo') ?| array['puntosMetaMensual', 'solesPorPunto']
       or (v_vacio->'parametros') ?| array['puntosMetaMensual', 'solesPorPunto'] then
      r := r || '[FALLA] caso1: con los parámetros vacíos aparecieron claves nuevas en parametros; ';
    elsif (select count(*) from jsonb_object_keys(v_vacio - 'puntosPeriodo')) <> 17 then
      r := r || format('[FALLA] caso1: la entrada de siempre tenía 17 claves y ahora tiene %s; ',
                       (select count(*) from jsonb_object_keys(v_vacio - 'puntosPeriodo')));
    elsif not (v_vacio ? 'puntosPeriodo') then
      r := r || '[FALLA] caso1: falta puntosPeriodo en la entrada; ';
    else
      r := r || '[ok] caso1: parámetros vacíos → mismas 17 claves, ninguna clave nueva en parametros, puntosPeriodo viaja; ';
    end if;
  exception when others then
    r := r || format('[FALLA] caso1: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 2. Con parámetros: puntosPeriodo = lo que da evaluacion_componentes_datos ══════════════
  begin
    update config set valor = '5000' where clave = 'sueldo_puntos_meta_mensual';
    update config set valor = '0.05' where clave = 'sueldo_soles_por_punto';
    v_def := sueldo_entrada(ac, '2099-02-02', '2099-02-03');
    v_pts := (v_def->>'puntosPeriodo')::numeric;

    if (v_def->'parametros'->>'puntosMetaMensual')::numeric = 5000
       and (v_def->'parametros'->>'solesPorPunto')::numeric = 0.05
       and jsonb_typeof(v_def->'parametros'->'puntosMetaMensual') = 'number' then
      r := r || '[ok] caso2a: parametros trae puntosMetaMensual=5000 y solesPorPunto=0.05 como número; ';
    else
      r := r || format('[FALLA] caso2a: parametros vino %s; ', v_def->'parametros');
    end if;

    if v_pts = v_ref and v_pts = 40.5 then
      r := r || '[ok] caso2b: puntosPeriodo = puntosTotal de evaluacion_componentes_datos para el mismo rango (40.5); ';
    else
      r := r || format('[FALLA] caso2b: puntosPeriodo=%s, evaluacion_componentes_datos=%s (esperaba 40.5 y que coincidan); ', v_pts, v_ref);
    end if;

    -- El rango que NO incluye el día de los puntos no los arrastra.
    if coalesce((sueldo_entrada(ac, '2099-02-02', '2099-02-02')->>'puntosPeriodo')::numeric, -1) = v_ref2 and v_ref2 = 0 then
      r := r || '[ok] caso2c: un rango sin el día de los puntos devuelve 0 (se cuenta por el rango de la liquidación); ';
    else
      r := r || format('[FALLA] caso2c: el rango 02-02..02-02 debía dar 0 y dio %s; ', v_ref2);
    end if;
  exception when others then
    r := r || format('[FALLA] caso2: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 3. Una sola clave definida: la otra, vacía, no aparece ═════════════════════════════════
  begin
    update config set valor = '' where clave = 'sueldo_soles_por_punto';
    v_corto := sueldo_entrada(ac, '2099-02-02', '2099-02-03');
    if (v_corto->'parametros') ? 'puntosMetaMensual' and not ((v_corto->'parametros') ? 'solesPorPunto') then
      r := r || '[ok] caso3: en blanco = no configurado (sólo aparece la clave con valor); ';
    else
      r := r || format('[FALLA] caso3: parametros vino %s; ', v_corto->'parametros');
    end if;
  exception when others then
    r := r || format('[FALLA] caso3: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 4. Basura: corta con CONFIG: ═══════════════════════════════════════════════════════════
  begin
    update config set valor = 'mucho' where clave = 'sueldo_soles_por_punto';
    perform sueldo_entrada(ac, '2099-02-02', '2099-02-03');
    r := r || '[FALLA] caso4: un texto no numérico debía cortar con CONFIG: y no cortó; ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'CONFIG:%' then
      r := r || '[ok] caso4: texto no numérico corta con CONFIG:; ';
    else
      r := r || format('[FALLA] caso4: esperaba CONFIG: y salió "%s"; ', v_msg);
    end if;
  end;

  -- ═══ 5. Aislamiento: el wrapper de puntos es sólo para el administrador ═════════════════════
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
    perform private.sueldo_puntos_periodo(adm, '2099-02-02', '2099-02-03');
    r := r || '[FALLA] caso5: alguien que no es admin pudo leer los puntos de otra persona; ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'PERMISO:%' then
      r := r || '[ok] caso5: quien no es administrador recibe PERMISO al pedir los puntos; ';
    else
      r := r || format('[FALLA] caso5: esperaba PERMISO y salió "%s"; ', v_msg);
    end if;
  end;

  raise exception 'RESULTADO 0117 --> %', r;
end $$;
