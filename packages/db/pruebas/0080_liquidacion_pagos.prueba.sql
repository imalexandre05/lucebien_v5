-- Prueba de la migración 0080_liquidacion_pagos.sql
--
-- No comprueba que la tabla exista: comprueba que las dos RPC y el trigger de inmutabilidad
-- CUMPLAN lo que prometen. Monta un empleado admin, cuatro acuerdos con sus liquidaciones (una
-- 'cerrada' para el camino feliz, una 'borrador', una 'anulada' y una 'cerrada' aparte para el
-- sobrepago) y ataca cada promesa: pagar un borrador, pagar de más, monto en cero o negativo,
-- método en blanco, anular sin motivo, anular dos veces, un INSERT/UPDATE/DELETE directo que
-- evite las RPC. Todo tiene que FALLAR salvo el camino feliz.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una
-- excepción con el resultado: eso aborta la transacción y no queda ni una fila. El "error" final
-- ES la salida esperada.
--
-- OJO — mismo aviso que la prueba de la 0073 (docs/aprendizajes.md, fila del 22-ago): las dos RPC
-- de esta migración son `security invoker` y exigen `private.app_es_admin()` adentro. El editor
-- SQL de Supabase (y cualquier `psql` sin sesión) corre con `auth.uid()` en null, así que sin el
-- `set_config('request.jwt.claims', ...)` de más abajo TODO devuelve PERMISO y la prueba no
-- comprueba nada. Quien la corra tiene que dejar ese bloque intacto.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0080
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0080")

do $$
declare
  adm         uuid;
  ac          uuid; ac_borrador uuid; ac_anulada uuid; ac_sobrepago uuid;
  liq         uuid; liq_borrador uuid; liq_anulada uuid; liq_sobrepago uuid;
  id1 uuid; id2 uuid; id3 uuid; id4 uuid;
  v_saldo     numeric;
  v_metodos   text;
  r text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- ── Montaje: cuatro acuerdos del mismo admin, en meses sin solape, y sus liquidaciones ──────
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-01-01', '2099-01-31', 1000, adm) returning id into ac;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-02-01', '2099-02-28', 500,  adm) returning id into ac_borrador;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-03-01', '2099-03-31', 300,  adm) returning id into ac_anulada;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-04-01', '2099-04-30', 200,  adm) returning id into ac_sobrepago;

  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, adm, '2099-01-01','2099-01-31','{}','{}','{}', 1000.00, 45.45, 'prueba') returning id into liq;
  update sueldo_liquidaciones set estado='cerrada', cerrada_en=now(), cerrada_por=adm where id=liq;

  -- Esta se queda en 'borrador' a propósito: es el ataque (A).
  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac_borrador, adm, '2099-02-01','2099-02-28','{}','{}','{}', 500.00, 45.45, 'prueba') returning id into liq_borrador;

  -- Cerrada y después anulada: es el ataque (B).
  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac_anulada, adm, '2099-03-01','2099-03-31','{}','{}','{}', 300.00, 45.45, 'prueba') returning id into liq_anulada;
  update sueldo_liquidaciones set estado='cerrada', cerrada_en=now(), cerrada_por=adm where id=liq_anulada;
  update sueldo_liquidaciones set estado='anulada', anulada_en=now(), anulada_por=adm, anulada_motivo='prueba'
    where id=liq_anulada;

  -- Cerrada, total chico, reservada para el ataque de sobrepago (O).
  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac_sobrepago, adm, '2099-04-01','2099-04-30','{}','{}','{}', 200.00, 45.45, 'prueba') returning id into liq_sobrepago;
  update sueldo_liquidaciones set estado='cerrada', cerrada_en=now(), cerrada_por=adm where id=liq_sobrepago;

  r := r || 'montaje=ok ';

  -- A) Sólo se paga una liquidación cerrada. Un borrador todavía puede cambiar de total.
  begin
    perform sueldo_liquidacion_pagar(liq_borrador, '2099-02-05', 100, 'Efectivo', null);
    r := r || 'A-PAGAR-BORRADOR=FALLA ';
  exception when others then r := r || 'A=ok '; end;

  -- B) Una anulada tampoco se paga: ya no es un compromiso vigente.
  begin
    perform sueldo_liquidacion_pagar(liq_anulada, '2099-03-05', 50, 'Efectivo', null);
    r := r || 'B-PAGAR-ANULADA=FALLA ';
  exception when others then r := r || 'B=ok '; end;

  -- C) Monto en cero.
  begin
    perform sueldo_liquidacion_pagar(liq, '2099-01-10', 0, 'Efectivo', null);
    r := r || 'C-MONTO-CERO=FALLA ';
  exception when others then r := r || 'C=ok '; end;

  -- D) Monto negativo — el signo lo pone la regla, no el dato (mismo criterio que sueldo_movimientos).
  begin
    perform sueldo_liquidacion_pagar(liq, '2099-01-10', -100, 'Efectivo', null);
    r := r || 'D-MONTO-NEGATIVO=FALLA ';
  exception when others then r := r || 'D=ok '; end;

  -- E) Método en blanco (sólo espacios, para probar que el trim no lo deja colar).
  begin
    perform sueldo_liquidacion_pagar(liq, '2099-01-10', 100, '   ', null);
    r := r || 'E-METODO-BLANCO=FALLA ';
  exception when others then r := r || 'E=ok '; end;

  -- F) Un INSERT que evite las dos RPC (misma cuenta admin, por SQL directo) contra una
  --    liquidación que no está cerrada. Sin este guard en el propio trigger de INSERT, alguien
  --    con acceso SQL directo podría crear un pago sin pasar por ninguna de las validaciones.
  begin
    insert into sueldo_liquidacion_pagos(liquidacion_id, fecha, monto, metodo, registrado_por)
      values (liq_borrador, '2099-02-05', 100, 'Efectivo', adm);
    r := r || 'F-INSERT-DIRECTO-NO-CERRADA=FALLA ';
  exception when others then r := r || 'F=ok '; end;

  -- G) El camino feliz: dos abonos que suman EXACTO el total (1000.00), ninguno de más.
  id1 := sueldo_liquidacion_pagar(liq, '2099-01-15', 600.00, 'Efectivo', 'primer abono');
  id2 := sueldo_liquidacion_pagar(liq, '2099-01-20', 400.00, 'Yape', null);
  select coalesce(sum(monto), 0) into v_saldo from sueldo_liquidacion_pagos
    where liquidacion_id = liq and not anulado;
  if v_saldo = 1000.00 then r := r || 'G=ok(saldo=' || v_saldo || ') ';
  else r := r || 'G-SALDO-INCORRECTO=FALLA(saldo=' || v_saldo || ') '; end if;

  -- H) Anular sin motivo.
  begin
    perform sueldo_liquidacion_pago_anular(id2, '   ');
    r := r || 'H-ANULAR-SIN-MOTIVO=FALLA ';
  exception when others then r := r || 'H=ok '; end;

  -- I) Anular el primer abono (600), con motivo. Es el único cambio permitido sobre un pago.
  perform sueldo_liquidacion_pago_anular(id1, 'monto cargado por error, se corrige');
  r := r || 'I=ok ';

  -- J) El saldo restante sólo cuenta lo NO anulado (400, el id2) — y eso deja lugar para volver
  --    a pagar los 600 que se habían anulado, sin que el sobrepago los bloquee.
  select coalesce(sum(monto), 0) into v_saldo from sueldo_liquidacion_pagos
    where liquidacion_id = liq and not anulado;
  if v_saldo = 400.00 then r := r || 'J-saldo=ok(400) ';
  else r := r || 'J-SALDO-CON-ANULADO=FALLA(saldo=' || v_saldo || ') '; end if;

  id3 := sueldo_liquidacion_pagar(liq, '2099-01-25', 600.00, 'Transferencia', 'reemplaza al abono anulado');
  select coalesce(sum(monto), 0) into v_saldo from sueldo_liquidacion_pagos
    where liquidacion_id = liq and not anulado;
  if v_saldo = 1000.00 then r := r || 'J-repago=ok ';
  else r := r || 'J-REPAGO=FALLA(saldo=' || v_saldo || ') '; end if;

  -- K) Anular el mismo pago dos veces.
  begin
    perform sueldo_liquidacion_pago_anular(id1, 'segundo intento de anular el mismo pago');
    r := r || 'K-ANULAR-DOS-VECES=FALLA ';
  exception when others then r := r || 'K=ok '; end;

  -- L) UPDATE directo de un pago vigente, cambio que NO es la transición de anular.
  begin
    update sueldo_liquidacion_pagos set monto = 1 where id = id2;
    r := r || 'L-EDITAR-MONTO=FALLA ';
  exception when others then r := r || 'L=ok '; end;

  -- M) UPDATE que mezcla la transición de anular con otro cambio de columna (monto). La
  --    comparación por jsonb del trigger tiene que rechazar el paquete completo, no sólo avisar.
  begin
    update sueldo_liquidacion_pagos
       set anulado = true, anulado_motivo = 'intento de colar un cambio', anulado_por = adm,
           anulado_en = now(), monto = 1
     where id = id2;
    r := r || 'M-ANULAR-Y-EDITAR=FALLA ';
  exception when others then r := r || 'M=ok '; end;

  -- N) DELETE directo. Nunca, ni siquiera sobre un pago ya anulado.
  begin
    delete from sueldo_liquidacion_pagos where id = id1;
    r := r || 'N-BORRAR=FALLA ';
  exception when others then r := r || 'N=ok '; end;

  -- O) Sobrepago con dos abonos: el primero entra, el segundo supera el total y tiene que cortar.
  id4 := sueldo_liquidacion_pagar(liq_sobrepago, '2099-04-05', 150.00, 'Efectivo', null);
  r := r || 'O-primero=ok ';
  begin
    perform sueldo_liquidacion_pagar(liq_sobrepago, '2099-04-10', 100.00, 'Efectivo', null);
    r := r || 'O-SOBREPAGO=FALLA ';
  exception when others then r := r || 'O=ok '; end;

  -- P) Informativo: el catálogo de métodos de pago quedó sembrado (no es un assert, sólo se
  --    imprime para que quien lea el resultado vea qué default dejó la migración).
  select valor into v_metodos from config where clave = 'sueldo_metodos_pago';
  r := r || 'P-metodos=' || coalesce(v_metodos, 'NULL') || ' ';

  raise exception 'RESULTADO 0080 >>> %', r;
end $$;
