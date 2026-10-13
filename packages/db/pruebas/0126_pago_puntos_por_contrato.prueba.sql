-- Prueba de la migración 0126_pago_puntos_por_contrato.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-05-pago-por-puntos-design.md §8.1 y §8.2.
--
-- Qué comprueba:
--   E3. Un contrato con los valores congelados (meta 5000, S/0,05) NO se mueve cuando /configuracion
--       cambia a S/0,10: `sueldo_entrada(...)->'parametros'->>'solesPorPunto'` sigue en 0.05.
--   2.  Guardar `puntosMetaMensual`/`solesPorPunto` (número y null) en el contrato ya no viola el
--       check de la lista blanca.
--   3.  Contrato con las dos claves en null y /configuracion ENCENDIDA → `puntosMeses` = null (§8.1:
--       un null del contrato apaga el pago aunque la configuración se encienda).
--   3b. Contrato con valores numéricos propios y /configuracion VACÍA → activo: la decisión es del
--       contrato, no de la configuración.
--   3c. Contrato sin las claves (`{}`) y config encendida → activo por el respaldo de config.
--   4.  Meses del contrato, mensual desde 2099-01-31 (se suma siempre desde fecha_inicio, nunca
--       encadenado): ws_0=01-31, ws_1=02-28, ws_2=03-31, ws_3=04-30. El tramo 03-01..03-31 trae
--       sólo el mes 1 {desde 02-28, hasta 03-30, hastaMes 03-30} con los puntos de ese mes. El tramo
--       04-01..04-30 trae el mes 2 completo {03-31..04-29} y el mes 3 cortado por el fin del
--       contrato {desde 04-30, hasta 04-30, hastaMes 05-30}.
--   5.  Contrato semanal: un tramo que no contiene fin de mes trae `[]`.
--   6.  Los defaults de la migración tienen las 17 claves y las dos nuevas en JSON null; el check
--       nombra las dos claves (reaplicar la migración entera se comprueba aparte, con aplicar).
--   7.  Aislamiento: quien no es administrador no puede pedir la entrada.
--   Todo corre como `authenticated`, no como superusuario (ver 0117).
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado. Correr el archivo ENTERO.
-- Cómo se corre:  bash tools/postgres-local.sh probar 0126

do $$
declare
  adm      uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid;
  ac1 uuid; ac2 uuid; ac3 uuid; ac4 uuid; ac5 uuid;
  v        jsonb;
  m        jsonb;
  v_ref    numeric;
  v_ref2   numeric;
  v_msg    text;
  r        text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('P1 0126', '0126a', 'ventas_junior', true, (select cod from sedes order by cod limit 1), 'P1') returning id into e1;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('P2 0126', '0126b', 'ventas_junior', true, (select cod from sedes order by cod limit 1), 'P2') returning id into e2;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('P3 0126', '0126c', 'ventas_junior', true, (select cod from sedes order by cod limit 1), 'P3') returning id into e3;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('P4 0126', '0126d', 'ventas_junior', true, (select cod from sedes order by cod limit 1), 'P4') returning id into e4;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('P5 0126', '0126e', 'ventas_junior', true, (select cod from sedes order by cod limit 1), 'P5') returning id into e5;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- Config encendida: meta 5000, S/0,05.
  insert into config(clave, valor) values ('sueldo_puntos_meta_mensual', '5000'), ('sueldo_soles_por_punto', '0.05')
    on conflict (clave) do update set valor = excluded.valor;

  -- ── Contratos ──────────────────────────────────────────────────────────────────────────────
  -- 1) E3: contrato de un día con los valores congelados (lo que copia crearAcuerdo).
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por, parametros)
    values (e1, '2099-02-02', '2099-02-02', 'semanal', 100, 'vigente', adm,
            private.sueldo_parametros_defaults() || private.sueldo_parametros_config())
    returning id into ac1;
  -- 2) Las dos claves en null explícito.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por, parametros)
    values (e2, '2099-02-02', '2099-02-02', 'semanal', 100, 'vigente', adm,
            '{"puntosMetaMensual": null, "solesPorPunto": null}'::jsonb)
    returning id into ac2;
  -- 3) Mensual desde el 31-ene hasta el 30-abr, sin valores propios (respaldo de config).
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (e3, '2099-01-31', '2099-04-30', 'mensual', 100, 'vigente', adm)
    returning id into ac3;
  -- 4) Contrato desde el 1-mar (el mes del contrato es marzo), sin valores propios.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (e4, '2099-03-01', '2099-03-31', 'semanal', 100, 'vigente', adm)
    returning id into ac4;
  -- 5) Valores numéricos propios en el contrato; la config se vacía más abajo.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por, parametros)
    values (e5, '2099-02-02', '2099-02-02', 'semanal', 100, 'vigente', adm,
            '{"puntosMetaMensual": 3000, "solesPorPunto": 0.2}'::jsonb)
    returning id into ac5;

  -- Un turno el lunes (isodow 1) en todos, y los días declarados.
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select x, extract(isodow from date '2099-02-02')::int, time '09:00', time '13:00' from unnest(array[ac1, ac2, ac5]) x;
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    select x, date '2099-02-02', 'M', 'trabajado', time '09:00', time '13:00', 'huellero' from unnest(array[e1, e2, e5]) x;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select x, 1, time '09:00', time '13:00' from unnest(array[ac3, ac4]) x;
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    select e, d::date, 'M', 'trabajado', time '09:00', time '13:00', 'huellero'
    from generate_series(date '2099-03-01', date '2099-04-30', interval '1 day') d, unnest(array[e3, e4]) e
    where extract(isodow from d) = 1;

  -- 40,5 puntos de pipeline el 10-mar (dentro del mes 1 del contrato 3), a mediodía UTC.
  insert into pipeline_puntos(empleado_id, etapa, puntos, fecha)
    values (e3, 'prueba', 40.5, timestamptz '2099-03-10 12:00:00+00');
  -- Referencias como superusuario (la 0067 le quitó el EXECUTE a authenticated).
  v_ref  := (private.evaluacion_componentes_datos(e3, '2099-02-28', '2099-03-30')->>'puntosTotal')::numeric;
  v_ref2 := (private.evaluacion_componentes_datos(e3, '2099-04-30', '2099-04-30')->>'puntosTotal')::numeric;
  r := r || 'montaje=ok; ';

  set local role authenticated;

  -- ═══ E3. Cambiar /configuracion no mueve un contrato congelado ═════════════════════════════
  begin
    update config set valor = '0.10' where clave = 'sueldo_soles_por_punto';
    v := sueldo_entrada(ac1, '2099-02-02', '2099-02-02');
    if (v->'parametros'->>'solesPorPunto')::numeric = 0.05 and (v->'parametros'->>'puntosMetaMensual')::numeric = 5000 then
      r := r || '[ok] E3: con la configuración en 0,10 el contrato congelado sigue en 0,05 y meta 5000; ';
    else
      r := r || format('[FALLA] E3: parametros vino %s; ', v->'parametros');
    end if;
  exception when others then
    r := r || format('[FALLA] E3: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 2. El check admite las dos claves (número y null) ═════════════════════════════════════
  begin
    update sueldo_acuerdos set parametros = parametros || '{"solesPorPunto": 0.07}'::jsonb where id = ac1;
    update sueldo_acuerdos set parametros = parametros || '{"puntosMetaMensual": null}'::jsonb where id = ac1;
    r := r || '[ok] caso2: guardar puntosMetaMensual/solesPorPunto (número y null) en el contrato no viola el check; ';
  exception when others then
    r := r || format('[FALLA] caso2: el check rechazó las claves de puntos: "%s"; ', sqlerrm);
  end;
  begin
    update sueldo_acuerdos set parametros = parametros || '{"claveInventada": 1}'::jsonb where id = ac1;
    r := r || '[FALLA] caso2b: el check dejó pasar una clave desconocida; ';
  exception when check_violation then
    r := r || '[ok] caso2b: una clave desconocida sigue rechazada; ';
  end;

  -- ═══ 3. null del contrato apaga el pago aunque la config esté encendida ════════════════════
  begin
    v := sueldo_entrada(ac2, '2099-02-02', '2099-02-02');
    if v ? 'puntosMeses' and jsonb_typeof(v->'puntosMeses') = 'null' and not (v ? 'puntosPeriodo') then
      r := r || '[ok] caso3: contrato con las dos claves en null y config encendida → puntosMeses=null; ';
    else
      r := r || format('[FALLA] caso3: puntosMeses vino %s; ', v->'puntosMeses');
    end if;
  exception when others then
    r := r || format('[FALLA] caso3: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 3b. Valores propios numéricos con la config VACÍA → activo ════════════════════════════
  begin
    update config set valor = '' where clave in ('sueldo_puntos_meta_mensual', 'sueldo_soles_por_punto');
    v := sueldo_entrada(ac5, '2099-02-02', '2099-02-02');
    if jsonb_typeof(v->'puntosMeses') = 'array' and (v->'parametros'->>'solesPorPunto')::numeric = 0.2 then
      r := r || '[ok] caso3b: contrato con valores propios y config vacía → activo (la decisión es del contrato); ';
    else
      r := r || format('[FALLA] caso3b: puntosMeses vino %s; ', v->'puntosMeses');
    end if;
    -- Y con config vacía, un contrato sin valores propios queda apagado.
    v := sueldo_entrada(ac4, '2099-03-02', '2099-03-08');
    if jsonb_typeof(v->'puntosMeses') = 'null' then
      r := r || '[ok] caso3b2: sin valores en el contrato ni en config → apagado; ';
    else
      r := r || format('[FALLA] caso3b2: debía ser null y vino %s; ', v->'puntosMeses');
    end if;
  exception when others then
    r := r || format('[FALLA] caso3b: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 4. Meses del contrato mensual desde el 31-ene ═════════════════════════════════════════
  begin
    -- Config encendida otra vez: los contratos 3 y 4 no tienen valores propios (respaldo de config).
    update config set valor = '5000' where clave = 'sueldo_puntos_meta_mensual';
    update config set valor = '0.05' where clave = 'sueldo_soles_por_punto';

    v := sueldo_entrada(ac3, '2099-03-01', '2099-03-31')->'puntosMeses';
    if jsonb_array_length(v) = 1
       and v->0->>'desde' = '2099-02-28' and v->0->>'hasta' = '2099-03-30' and v->0->>'hastaMes' = '2099-03-30'
       and (v->0->>'puntos')::numeric = v_ref and v_ref = 40.5 then
      r := r || '[ok] caso4a: tramo 03-01..03-31 trae sólo el mes {02-28..03-30} con sus 40,5 puntos; ';
    else
      r := r || format('[FALLA] caso4a: puntosMeses vino %s (ref %s); ', v, v_ref);
    end if;

    v := sueldo_entrada(ac3, '2099-04-01', '2099-04-30')->'puntosMeses';
    if jsonb_array_length(v) = 2
       and v->0->>'desde' = '2099-03-31' and v->0->>'hasta' = '2099-04-29' and v->0->>'hastaMes' = '2099-04-29'
       and v->1->>'desde' = '2099-04-30' and v->1->>'hasta' = '2099-04-30' and v->1->>'hastaMes' = '2099-05-30'
       and (v->1->>'puntos')::numeric = v_ref2 then
      r := r || '[ok] caso4b: tramo 04-01..04-30 trae el mes {03-31..04-29} y el último, cortado por el fin del contrato {04-30, hastaMes 05-30}; ';
    else
      r := r || format('[FALLA] caso4b: puntosMeses vino %s; ', v);
    end if;
  exception when others then
    r := r || format('[FALLA] caso4: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 5. Un tramo sin fin de mes trae [] ════════════════════════════════════════════════════
  begin
    v := sueldo_entrada(ac4, '2099-03-02', '2099-03-08')->'puntosMeses';
    if jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0 then
      r := r || '[ok] caso5: un tramo semanal que no contiene fin de mes trae []; ';
    else
      r := r || format('[FALLA] caso5: puntosMeses vino %s; ', v);
    end if;
    v := sueldo_entrada(ac4, '2099-03-23', '2099-03-31')->'puntosMeses';
    if jsonb_array_length(v) = 1 and v->0->>'desde' = '2099-03-01' and v->0->>'hasta' = '2099-03-31' then
      r := r || '[ok] caso5b: el tramo que contiene el último día del mes lo trae completo; ';
    else
      r := r || format('[FALLA] caso5b: puntosMeses vino %s; ', v);
    end if;
  exception when others then
    r := r || format('[FALLA] caso5: sueldo_entrada cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 6. Defaults y check ═══════════════════════════════════════════════════════════════════
  begin
    m := private.sueldo_parametros_defaults();
    if (select count(*) from jsonb_object_keys(m)) = 17
       and jsonb_typeof(m->'puntosMetaMensual') = 'null' and jsonb_typeof(m->'solesPorPunto') = 'null'
       and pg_get_constraintdef((select oid from pg_constraint where conname = 'sueldo_acuerdos_parametros_chk')) like '%solesPorPunto%' then
      r := r || '[ok] caso6: defaults de 17 claves con las dos de puntos en null y el check las nombra; ';
    else
      r := r || format('[FALLA] caso6: defaults %s; ', m);
    end if;
  exception when others then
    r := r || format('[FALLA] caso6: "%s"; ', sqlerrm);
  end;

  -- ═══ 7. Aislamiento ════════════════════════════════════════════════════════════════════════
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
    perform sueldo_entrada(ac3, '2099-03-01', '2099-03-31');
    r := r || '[FALLA] caso7: alguien que no es admin pudo pedir la entrada; ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'PERMISO:%' then
      r := r || '[ok] caso7: quien no es administrador recibe PERMISO; ';
    else
      r := r || format('[FALLA] caso7: esperaba PERMISO y salió "%s"; ', v_msg);
    end if;
  end;

  raise exception 'RESULTADO 0126 --> %', r;
end $$;
