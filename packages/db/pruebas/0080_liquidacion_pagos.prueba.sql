-- Prueba de la migración 0080_liquidacion_pagos.sql
--
-- No comprueba que la tabla exista: comprueba que las dos RPC y los tres triggers de la
-- migración CUMPLAN lo que prometen. Monta un empleado admin, un empleado sin rol admin, y cinco
-- acuerdos con sus liquidaciones (una 'cerrada' para el camino feliz, una 'borrador', una
-- 'anulada', una 'cerrada' aparte para el sobrepago y una 'cerrada' aparte con un pago vigente
-- para probar que no se puede anular con pagos colgando), y ataca cada promesa. Todo tiene que
-- FALLAR salvo el camino feliz — y **cada falla se verifica por el CÓDIGO del error**
-- (`ESTADO:`/`DATO:`/`SALDO:`/`PERMISO:`/`CONGELADA:`), no sólo por "lanzó algo": un trigger que
-- se rompe y lanza un error distinto al esperado tiene que reportarse como hallazgo, no como
-- "ok" por accidente.
--
-- Reescrita el 23-ago-2026 tras la segunda pasada del verificador adversarial (spec §2.6,
-- commit c02c41a) — agrega los casos de: una liquidación con pagos vigentes no se anula (Fix 1),
-- el sobrepago bloqueado también por INSERT directo y por 'NaN' (Fix 2), un pago sin
-- `registrado_por`, des-anular y editar el motivo de un pago ya anulado, el aislamiento por RLS
-- ante un empleado sin rol admin, y que las dos RPC devuelvan PERMISO ante ese mismo empleado.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una
-- excepción con el resultado: eso aborta la transacción y no queda ni una fila. El "error" final
-- ES la salida esperada.
--
-- OJO — mismo aviso que la prueba de la 0073 (docs/aprendizajes.md, fila del 22-ago): las dos RPC
-- de esta migración son `security invoker` y exigen `private.app_es_admin()` adentro. El editor
-- SQL de Supabase (y cualquier `psql` sin sesión) corre con `auth.uid()` en null, así que sin el
-- `set_config('request.jwt.claims', ...)` de más abajo TODO devuelve PERMISO y la prueba no
-- comprueba nada. Quien la corra tiene que dejar ese bloque intacto, y correr el archivo ENTERO
-- de una sola vez (el `set_config(..., true)` vale sólo dentro de esta misma transacción).
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0080
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0080")

do $$
declare
  adm          uuid; no_admin uuid;
  ac           uuid; ac_borrador uuid; ac_anulada uuid; ac_sobrepago uuid; ac_conpago uuid;
  liq          uuid; liq_borrador uuid; liq_anulada uuid; liq_sobrepago uuid; liq_conpago uuid;
  id1 uuid; id2 uuid; id3 uuid; id4 uuid; id5 uuid;
  v_saldo      numeric;
  v_metodos    text;
  v_estado_chk text;
  v_count      int;
  r text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  select id into no_admin from empleados where rol not in ('admin','dueno') order by id limit 1;
  if no_admin is null then raise exception 'La prueba necesita al menos un empleado SIN rol admin'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- ── Montaje: cinco acuerdos del mismo admin, en meses sin solape, y sus liquidaciones ───────
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-01-01', '2099-01-31', 1000, adm) returning id into ac;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-02-01', '2099-02-28', 500,  adm) returning id into ac_borrador;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-03-01', '2099-03-31', 300,  adm) returning id into ac_anulada;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-04-01', '2099-04-30', 200,  adm) returning id into ac_sobrepago;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (adm, '2099-05-01', '2099-05-31', 500,  adm) returning id into ac_conpago;

  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, adm, '2099-01-01','2099-01-31','{}','{}','{}', 1000.00, 45.45, 'prueba') returning id into liq;
  update sueldo_liquidaciones set estado='cerrada', cerrada_en=now(), cerrada_por=adm where id=liq;

  -- Esta se queda en 'borrador' a propósito: es el ataque (A) y (F).
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

  -- Cerrada, total chico, reservada para los ataques de sobrepago (O, R) y sin autor (T).
  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac_sobrepago, adm, '2099-04-01','2099-04-30','{}','{}','{}', 200.00, 45.45, 'prueba') returning id into liq_sobrepago;
  update sueldo_liquidaciones set estado='cerrada', cerrada_en=now(), cerrada_por=adm where id=liq_sobrepago;

  -- Cerrada, reservada para el ataque de "anular con pago vigente" (U, Fix 1).
  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac_conpago, adm, '2099-05-01','2099-05-31','{}','{}','{}', 500.00, 45.45, 'prueba') returning id into liq_conpago;
  update sueldo_liquidaciones set estado='cerrada', cerrada_en=now(), cerrada_por=adm where id=liq_conpago;

  r := r || 'montaje=ok ';

  -- A) Sólo se paga una liquidación cerrada. Un borrador todavía puede cambiar de total.
  begin
    perform sueldo_liquidacion_pagar(liq_borrador, '2099-02-05', 100, 'Efectivo', null);
    r := r || 'A-PAGAR-BORRADOR=FALLA ';
  exception when others then
    if sqlerrm like 'ESTADO:%' then r := r || 'A=ok ';
    else r := r || 'A-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- B) Una anulada tampoco se paga: ya no es un compromiso vigente.
  begin
    perform sueldo_liquidacion_pagar(liq_anulada, '2099-03-05', 50, 'Efectivo', null);
    r := r || 'B-PAGAR-ANULADA=FALLA ';
  exception when others then
    if sqlerrm like 'ESTADO:%' then r := r || 'B=ok ';
    else r := r || 'B-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- C) Monto en cero.
  begin
    perform sueldo_liquidacion_pagar(liq, '2099-01-10', 0, 'Efectivo', null);
    r := r || 'C-MONTO-CERO=FALLA ';
  exception when others then
    if sqlerrm like 'DATO:%' then r := r || 'C=ok ';
    else r := r || 'C-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- D) Monto negativo — el signo lo pone la regla, no el dato (mismo criterio que sueldo_movimientos).
  begin
    perform sueldo_liquidacion_pagar(liq, '2099-01-10', -100, 'Efectivo', null);
    r := r || 'D-MONTO-NEGATIVO=FALLA ';
  exception when others then
    if sqlerrm like 'DATO:%' then r := r || 'D=ok ';
    else r := r || 'D-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- E) Método en blanco (sólo espacios, para probar que el trim no lo deja colar).
  begin
    perform sueldo_liquidacion_pagar(liq, '2099-01-10', 100, '   ', null);
    r := r || 'E-METODO-BLANCO=FALLA ';
  exception when others then
    if sqlerrm like 'DATO:%' then r := r || 'E=ok ';
    else r := r || 'E-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- F) Un INSERT que evite las dos RPC (misma cuenta admin, por SQL directo) contra una
  --    liquidación que no está cerrada. Lleva registrado_por para aislar ESTE chequeo del de T.
  begin
    insert into sueldo_liquidacion_pagos(liquidacion_id, fecha, monto, metodo, registrado_por)
      values (liq_borrador, '2099-02-05', 100, 'Efectivo', adm);
    r := r || 'F-INSERT-DIRECTO-NO-CERRADA=FALLA ';
  exception when others then
    if sqlerrm like 'ESTADO:%' then r := r || 'F=ok ';
    else r := r || 'F-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- G) El camino feliz: dos abonos que suman EXACTO el total (1000.00), ninguno de más.
  id1 := sueldo_liquidacion_pagar(liq, '2099-01-15', 600.00, 'Efectivo', 'primer abono');
  id2 := sueldo_liquidacion_pagar(liq, '2099-01-20', 400.00, 'Yape', null);
  select coalesce(sum(monto), 0) into v_saldo from sueldo_liquidacion_pagos
    where liquidacion_id = liq and not anulado;
  if v_saldo = 1000.00 then r := r || 'G=ok(saldo=' || v_saldo || ') ';
  else r := r || 'G-SALDO-INCORRECTO=FALLA(saldo=' || v_saldo || ') '; end if;

  -- H) Anular sin motivo (sobre id2, que sigue vigente).
  begin
    perform sueldo_liquidacion_pago_anular(id2, '   ');
    r := r || 'H-ANULAR-SIN-MOTIVO=FALLA ';
  exception when others then
    if sqlerrm like 'DATO:%' then r := r || 'H=ok ';
    else r := r || 'H-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

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
  exception when others then
    if sqlerrm like 'ESTADO:%' then r := r || 'K=ok ';
    else r := r || 'K-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- L) UPDATE directo de un pago vigente (id2), cambio que NO es la transición de anular.
  begin
    update sueldo_liquidacion_pagos set monto = 1 where id = id2;
    r := r || 'L-EDITAR-MONTO=FALLA ';
  exception when others then
    if sqlerrm like 'CONGELADA:%' then r := r || 'L=ok ';
    else r := r || 'L-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- M) UPDATE que mezcla la transición de anular con otro cambio de columna (monto), sobre id2.
  --    La comparación por jsonb del trigger tiene que rechazar el paquete completo.
  begin
    update sueldo_liquidacion_pagos
       set anulado = true, anulado_motivo = 'intento de colar un cambio', anulado_por = adm,
           anulado_en = now(), monto = 1
     where id = id2;
    r := r || 'M-ANULAR-Y-EDITAR=FALLA ';
  exception when others then
    if sqlerrm like 'CONGELADA:%' then r := r || 'M=ok ';
    else r := r || 'M-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- N) DELETE directo. Nunca, ni siquiera sobre un pago ya anulado (id1).
  begin
    delete from sueldo_liquidacion_pagos where id = id1;
    r := r || 'N-BORRAR=FALLA ';
  exception when others then
    if sqlerrm like 'CONGELADA:%' then r := r || 'N=ok ';
    else r := r || 'N-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- P) Des-anular: id1 ya está anulado, un UPDATE que lo vuelva a poner en false tiene que caer
  --    igual que cualquier otro intento de editarlo — la transición sólo corre en un sentido.
  begin
    update sueldo_liquidacion_pagos set anulado = false where id = id1;
    r := r || 'P-DESANULAR=FALLA ';
  exception when others then
    if sqlerrm like 'CONGELADA:%' then r := r || 'P=ok ';
    else r := r || 'P-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- Q) Cambiar el motivo de un pago YA anulado (id1), sin tocar `anulado`. old.anulado ya es
  --    true, así que no matchea la transición false→true por ningún lado: tiene que caer igual.
  begin
    update sueldo_liquidacion_pagos set anulado_motivo = 'motivo reescrito después' where id = id1;
    r := r || 'Q-EDITAR-MOTIVO-ANULADO=FALLA ';
  exception when others then
    if sqlerrm like 'CONGELADA:%' then r := r || 'Q=ok ';
    else r := r || 'Q-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- O) Sobrepago con dos abonos por RPC: el primero entra, el segundo supera el total (200).
  id4 := sueldo_liquidacion_pagar(liq_sobrepago, '2099-04-05', 150.00, 'Efectivo', null);
  r := r || 'O-primero=ok ';
  begin
    perform sueldo_liquidacion_pagar(liq_sobrepago, '2099-04-10', 100.00, 'Efectivo', null);
    r := r || 'O-SOBREPAGO=FALLA ';
  exception when others then
    if sqlerrm like 'SALDO:%' then r := r || 'O=ok ';
    else r := r || 'O-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- R) El mismo sobrepago, pero por INSERT directo (bypassa la RPC entera) — prueba el Fix 2:
  --    la regla del saldo vive en la base, no sólo en la RPC. Quedan S/50 de saldo (200-150).
  begin
    insert into sueldo_liquidacion_pagos(liquidacion_id, fecha, monto, metodo, registrado_por)
      values (liq_sobrepago, '2099-04-20', 100.00, 'Efectivo', adm);
    r := r || 'R-INSERT-DIRECTO-SOBREPAGO=FALLA ';
  exception when others then
    if sqlerrm like 'SALDO:%' then r := r || 'R=ok ';
    else r := r || 'R-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- S) INSERT directo con monto = 'NaN' contra `liq` (ya saldada 1000/1000). Postgres ordena NaN
  --    como mayor que cualquier total, así que cae por el mismo camino que un sobrepago (SALDO),
  --    tal cual lo previó el verificador — y el check de la tabla lo cerraría aparte si este pago
  --    hubiera nacido ya anulado (rama que este caso no ejercita, pero que sigue ahí de todos
  --    modos como cinturón de más).
  begin
    insert into sueldo_liquidacion_pagos(liquidacion_id, fecha, monto, metodo, registrado_por)
      values (liq, '2099-01-30', 'NaN'::numeric, 'Efectivo', adm);
    r := r || 'S-INSERT-NAN=FALLA ';
  exception when others then
    if sqlerrm like 'SALDO:%' then r := r || 'S=ok ';
    else r := r || 'S-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- T) INSERT directo sin `registrado_por`. El chequeo corre ANTES que cualquier otro, así que
  --    ni importa que el monto y el estado de la liquidación sean válidos.
  begin
    insert into sueldo_liquidacion_pagos(liquidacion_id, fecha, monto, metodo)
      values (liq_sobrepago, '2099-04-25', 10.00, 'Efectivo');
    r := r || 'T-SIN-REGISTRADO-POR=FALLA ';
  exception when others then
    if sqlerrm like 'DATO:%' then r := r || 'T=ok ';
    else r := r || 'T-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- U) Fix 1: una liquidación con un pago vigente no se anula. Primero se paga (queda vigente),
  --    se intenta anular la liquidación directo → tiene que caer con ESTADO nombrando el pago;
  --    después se anula el pago con su motivo, y RECIÉN ahí la misma anulación tiene que entrar.
  id5 := sueldo_liquidacion_pagar(liq_conpago, '2099-05-05', 100.00, 'Efectivo', null);
  r := r || 'U-pago=ok ';

  begin
    update sueldo_liquidaciones set estado='anulada', anulada_en=now(), anulada_por=adm,
      anulada_motivo='intento con pago vigente' where id=liq_conpago;
    r := r || 'U1-ANULAR-CON-PAGO-VIGENTE=FALLA ';
  exception when others then
    if sqlerrm like 'ESTADO:%' then r := r || 'U1=ok ';
    else r := r || 'U1-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  perform sueldo_liquidacion_pago_anular(id5, 'se anula para poder anular la liquidacion');

  update sueldo_liquidaciones set estado='anulada', anulada_en=now(), anulada_por=adm,
    anulada_motivo='ahora si, sin pagos vigentes' where id=liq_conpago;
  select estado into v_estado_chk from sueldo_liquidaciones where id=liq_conpago;
  if v_estado_chk = 'anulada' then r := r || 'U2=ok ';
  else r := r || 'U2-NO-ANULADA=FALLA(estado=' || coalesce(v_estado_chk,'NULL') || ') '; end if;

  -- V) PERMISO: un empleado SIN rol admin no puede llamar ninguna de las dos RPC.
  perform set_config('request.jwt.claims',
    json_build_object('sub', no_admin, 'role','authenticated')::text, true);

  begin
    perform sueldo_liquidacion_pagar(liq, '2099-01-31', 1.00, 'Efectivo', null);
    r := r || 'V1-PAGAR-SIN-PERMISO=FALLA ';
  exception when others then
    if sqlerrm like 'PERMISO:%' then r := r || 'V1=ok ';
    else r := r || 'V1-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  begin
    perform sueldo_liquidacion_pago_anular(id2, 'motivo cualquiera');
    r := r || 'V2-ANULAR-SIN-PERMISO=FALLA ';
  exception when others then
    if sqlerrm like 'PERMISO:%' then r := r || 'V2=ok ';
    else r := r || 'V2-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- W) RLS: con el ROL de Postgres cambiado a 'authenticated' (no sólo el claim), el aislamiento
  --    1 tiene que filtrar TODOS los pagos del admin para un empleado sin ninguna relación con
  --    esas liquidaciones. `set_config` sólo decide auth.uid(); sin cambiar el ROL, esta consulta
  --    corre con el rol dueño de la conexión, que bypassa RLS, y el conteo saldría mal aunque la
  --    policy estuviera rota.
  begin
    execute 'set local role authenticated';
    select count(*) into v_count from sueldo_liquidacion_pagos;
    execute 'reset role';
    if v_count = 0 then r := r || 'W=ok ';
    else r := r || 'W-RLS-FILTRO-ROTO=FALLA(vio=' || v_count || ') '; end if;
  exception when others then
    -- Si esto falla (por ejemplo, el rol de conexión no puede hacer SET ROLE authenticated), es
    -- una falla de otra capa, no de esta migración — pero se reporta en vez de perderse junto
    -- con todo lo que ya se acumuló en r. Intenta volver al rol original de todos modos.
    begin execute 'reset role'; exception when others then null; end;
    r := r || 'W-ERROR(' || sqlerrm || ')=FALLA ';
  end;

  -- Se restaura el admin para el chequeo informativo final.
  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);

  -- Informativo: el catálogo de métodos de pago quedó sembrado (no es un assert, sólo se
  -- imprime para que quien lea el resultado vea qué default dejó la migración).
  select valor into v_metodos from config where clave = 'sueldo_metodos_pago';
  r := r || 'INFO-metodos=' || coalesce(v_metodos, 'NULL') || ' ';

  raise exception 'RESULTADO 0080 >>> %', r;
end $$;
