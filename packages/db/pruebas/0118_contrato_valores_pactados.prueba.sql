-- Prueba de la migración 0118_contrato_valores_pactados.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-05-contrato-valores-pactados-design.md §4
--
-- Casos:
--   1. Contrato NUEVO: copiar los valores vigentes (defaults || config) deja las 15 claves, y
--      cambiar `config` después NO mueve los parámetros que usa la liquidación (sueldo_entrada).
--   2. Contrato EXISTENTE sin valores propios: queda congelado con los valores de HOY.
--   3. Un valor propio previo del contrato NO se pisa.
--   4. La liquidación (sueldo_entrada) de un contrato existente es IDÉNTICA antes y después:
--      parámetros efectivos antes (defaults || config || parametros) = parámetros después.
--   5. Idempotente: volver a congelar no cambia nada (devuelve 0).
--   6. sueldo_parametros_vigentes(): el admin lo lee; un no-admin y anon no.
--   7. `metaSemanal` no se copia (sin meta pactada = ausente).
--
-- SE DESCARTA SOLA (todo termina en una excepción con la línea RESULTADO 0118). Mismo aviso que
-- las demás pruebas: sin `set_config('request.jwt.claims', ...)` la prueba no comprueba nada;
-- correr el archivo ENTERO. Se corre con bash tools/probar-migracion.sh 0118.

do $$
declare
  adm uuid; col uuid; emp_a uuid; emp_b uuid;
  ac_a uuid; ac_b uuid; ac_n uuid;
  ant_a jsonb; ant_b jsonb; efectivo_antes jsonb;
  desp_a jsonb; desp_b jsonb; entrada_a jsonb; entrada_n jsonb;
  n int; v jsonb; r text := '';
  claves constant text[] := array[
    'toleranciaMinutos', 'tardanzasLibres', 'penalidadTardanza', 'valorAlmuerzo',
    'horasMinimasAlmuerzo', 'valorCapacitacion', 'bonoMetaSemanal', 'factorMeta',
    'metaSemanalFija', 'pctComision', 'montoMinimoComision', 'diasDescuentoPorFalta',
    'metaPorHora', 'factorHoraFueraContrato', 'pausaMinimaMinutos'];
  dow int;
begin
  insert into sedes(cod, nombre, interna) values ('AL', 'Almacén', true) on conflict (cod) do nothing;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Prueba 0118', '0118a', 'admin', true, 'AL', 'AP') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Colaborador Prueba 0118', '0118b', 'ventas_junior', true, 'AL', 'CP') returning id into col;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Persona A 0118', '0118c', 'ventas_junior', true, 'AL', 'PA') returning id into emp_a;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Persona B 0118', '0118d', 'ventas_junior', true, 'AL', 'PB') returning id into emp_b;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- Config de «hoy»: tolerancia 12 y comisión 0.05; el resto en blanco (= default del código).
  delete from config where clave like 'sueldo_%' and clave in (
    'sueldo_tolerancia_minutos', 'sueldo_pct_comision', 'sueldo_valor_almuerzo');
  insert into config(clave, valor) values
    ('sueldo_tolerancia_minutos', '12'), ('sueldo_pct_comision', '0.05'), ('sueldo_valor_almuerzo', '');

  -- Dos contratos EXISTENTES de un día. A: sin valores propios. B: ya pactó tolerancia 15.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por, parametros)
    values (emp_a, '2099-02-02', '2099-02-02', 'semanal', 100, 'vigente', adm, '{}'::jsonb) returning id into ac_a;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por, parametros)
    values (emp_b, '2099-02-02', '2099-02-02', 'semanal', 100, 'vigente', adm, '{"toleranciaMinutos": 15}'::jsonb) returning id into ac_b;
  dow := extract(isodow from date '2099-02-02');
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac_a, dow, time '09:00', time '13:00');
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    values (emp_a, '2099-02-02', 'M', 'trabajado', time '09:00', time '13:00', 'huellero');

  -- ANTES de congelar: lo que hoy efectivamente usa la liquidación de A (defaults del código ← config ← contrato).
  entrada_a := sueldo_entrada(ac_a, '2099-02-02', '2099-02-02');
  efectivo_antes := private.sueldo_parametros_defaults() || (entrada_a -> 'parametros');
  r := r || 'montaje=ok; ';

  -- ═══ 2, 3, 5: el congelado ═══════════════════════════════════════════════════════════════════
  begin
    n := private.sueldo_acuerdos_congelar_parametros();
    select parametros into desp_a from sueldo_acuerdos where id = ac_a;
    select parametros into desp_b from sueldo_acuerdos where id = ac_b;

    if (select bool_and(desp_a ? k) from unnest(claves) k) and not (desp_a ? 'metaSemanal')
       and (desp_a ->> 'toleranciaMinutos')::numeric = 12 and (desp_a ->> 'pctComision')::numeric = 0.05
       and (desp_a ->> 'valorAlmuerzo')::numeric = 8 and (desp_a ->> 'tardanzasLibres')::numeric = 3 then
      r := r || '[ok] caso2: el contrato sin propios queda con las 15 claves y los valores de hoy (config 12/0.05, default en el resto); ';
    else
      r := r || format('[FALLA] caso2: contrato A quedó %s; ', desp_a);
    end if;

    if (desp_b ->> 'toleranciaMinutos')::numeric = 15 and (desp_b ->> 'pctComision')::numeric = 0.05
       and (select bool_and(desp_b ? k) from unnest(claves) k) then
      r := r || '[ok] caso3: el valor propio (15) no se pisa y se completa el resto; ';
    else
      r := r || format('[FALLA] caso3: contrato B quedó %s; ', desp_b);
    end if;

    -- 4: la liquidación no cambia — misma entrada efectiva antes y después.
    entrada_a := sueldo_entrada(ac_a, '2099-02-02', '2099-02-02');
    if (entrada_a -> 'parametros') = efectivo_antes then
      r := r || '[ok] caso4: los parámetros que llegan al motor son idénticos antes y después del congelado; ';
    else
      r := r || format('[FALLA] caso4: antes=%s despues=%s; ', efectivo_antes, entrada_a -> 'parametros');
    end if;

    -- 1b/3b: cambiar config DESPUÉS no mueve nada.
    update config set valor = '30' where clave = 'sueldo_tolerancia_minutos';
    update config set valor = '0.5' where clave = 'sueldo_pct_comision';
    entrada_a := sueldo_entrada(ac_a, '2099-02-02', '2099-02-02');
    if (entrada_a -> 'parametros' ->> 'toleranciaMinutos')::numeric = 12
       and (entrada_a -> 'parametros' ->> 'pctComision')::numeric = 0.05 then
      r := r || '[ok] caso1b: cambiar /configuracion después no mueve un contrato congelado; ';
    else
      r := r || format('[FALLA] caso1b: tras cambiar config el contrato A usa %s; ', entrada_a -> 'parametros');
    end if;

    -- 5: idempotente.
    n := private.sueldo_acuerdos_congelar_parametros();
    if n = 0 and (select parametros from sueldo_acuerdos where id = ac_a) = desp_a then
      r := r || '[ok] caso5: volver a congelar no cambia nada; ';
    else
      r := r || format('[FALLA] caso5: la segunda pasada actualizó %s filas; ', n);
    end if;
  exception when others then
    r := r || format('[FALLA] congelado: cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 1: contrato NUEVO — lo que hace crearAcuerdo: copiar los valores vigentes de ese momento ═
  begin
    update config set valor = '12' where clave = 'sueldo_tolerancia_minutos';
    update config set valor = '0.05' where clave = 'sueldo_pct_comision';
    v := public.sueldo_parametros_vigentes();
    if (v ->> 'toleranciaMinutos')::numeric = 12 and (v ->> 'pctComision')::numeric = 0.05 and not (v ? 'valorAlmuerzo') then
      r := r || '[ok] caso6a: el admin lee los valores de config (sin defaults del código: eso lo pone el core); ';
    else
      r := r || format('[FALLA] caso6a: vigentes = %s; ', v);
    end if;

    -- Emula crearAcuerdo: defaults || vigentes (el core pone los defaults) y lo guarda en el contrato.
    insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por, parametros)
      values (emp_b, '2099-03-02', '2099-03-02', 'semanal', 100, 'vigente', adm,
              private.sueldo_parametros_defaults() || v) returning id into ac_n;
    update config set valor = '40' where clave = 'sueldo_tolerancia_minutos';
    select parametros into v from sueldo_acuerdos where id = ac_n;
    if (select bool_and(v ? k) from unnest(claves) k) and (v ->> 'toleranciaMinutos')::numeric = 12 then
      r := r || '[ok] caso1: un contrato nuevo guarda las 15 claves y no sigue a config; ';
    else
      r := r || format('[FALLA] caso1: contrato nuevo = %s; ', v);
    end if;
    if not (v ? 'metaSemanal') then
      r := r || '[ok] caso7: metaSemanal no se copia; ';
    else
      r := r || '[FALLA] caso7: metaSemanal apareció; ';
    end if;
  exception when others then
    r := r || format('[FALLA] contrato nuevo: cortó con "%s"; ', sqlerrm);
  end;

  -- ═══ 6: permisos de la RPC ═══════════════════════════════════════════════════════════════════
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', col, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.sueldo_parametros_vigentes();
      r := r || '[FALLA] caso6b: un no-admin pudo leer los valores vigentes; ';
    exception when others then
      r := r || '[ok] caso6b: un no-admin no puede leer los valores vigentes; ';
    end;
    reset role;
    set local role anon;
    begin
      perform public.sueldo_parametros_vigentes();
      r := r || '[FALLA] caso6c: anon pudo ejecutar la RPC; ';
    exception when insufficient_privilege then
      r := r || '[ok] caso6c: anon no puede ejecutar la RPC (privilegio); ';
    when others then
      r := r || format('[FALLA] caso6c: anon falló por otra razón: %s; ', sqlerrm);
    end;
    reset role;
  exception when others then
    reset role;
    r := r || format('[FALLA] permisos: cortó con "%s"; ', sqlerrm);
  end;

  raise exception 'RESULTADO 0118 --> %', r;
end $$;
