-- Prueba de la migración 0101_alertas_se_retiran.sql
--
-- Comprueba los casos 1 a 6 y 13 de la §7 de la spec
-- (docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md):
--   1. Regla activa, condición cierta, sin aviso previo → se crea uno.
--   2. La misma condición, segunda corrida → NO se duplica; se refresca mensaje y updated_at.
--   3. Aviso ya leído, condición sigue cierta → se refresca el texto y SIGUE leído.
--   4. La condición deja de ser cierta → el aviso desaparece, leído o no.
--   5. Regla apagada → sus avisos existentes NO se tocan.
--   6. Regla apagada y vuelta a encender → los avisos vuelven a mantenerse, sin duplicar.
--   13. Las 4 reglas comerciales quedan activa=false (y reporte_sin_evaluar sigue activa).
--
-- VEHÍCULO: `stock_bajo` sobre UN material sintético (nunca se reutiliza uno real), porque su
-- condición se controla con una sola columna (`materiales.stock_actual`) sin fechas ni joins. El
-- caso 13 se comprueba PRIMERO, antes de tocar nada, sobre el estado que dejó la propia migración
-- 0101 (las 4 reglas comerciales en `activa=false`); recién después el test fuerza
-- `stock_bajo.activa=true` para poder ejercer C-1/C-2 y lo deja como lo encontró al terminar (da
-- igual: la transacción entera se descarta al final).
--
-- CÓMO SE COMPRUEBA "SE REFRESCA" SIN DEPENDER DEL RELOJ. Dentro de una misma transacción,
-- `now()` es fijo (es la hora de INICIO de la transacción, no la del statement) — comparar
-- updated_at antes/después con now() no muestra ningún cambio aunque el UPDATE haya corrido. En
-- vez de eso, el test CORROMPE a mano `mensaje`/`updated_at` de la fila (a un texto y una fecha
-- que generar_alertas() nunca escribiría) justo antes de volver a llamarla, y comprueba que
-- generar_alertas() los pisa de vuelta con el valor correcto. Es una prueba más dura que comparar
-- timestamps: si el `do update set` de la migración no tocara esas columnas, se seguiría viendo
-- el valor corrompido.
--
-- generar_alertas() es SECURITY DEFINER, revocada de authenticated (sólo service_role puede
-- ejecutarla) — se llama DIRECTO, sin `set_config('role','authenticated', true)`, exactamente
-- como ya hace 0081_reportes_escritura_directa.prueba.sql con reportes_auto_cierre() (la misma
-- restricción). Esta prueba no toca RLS ni sesiones: prueba el CONTENIDO de la función.
--
-- LO QUE ESTA PRUEBA NO CUBRE (y por qué). El caso 13 sólo revisa el flag `activa` de las 4
-- reglas comerciales, no que "no generan nada" fabricando datos reales de `pedidos`/
-- `caja_sesiones`: `caja_sesiones` tiene un índice único (sede, 'abierta') y no hay forma de saber
-- desde acá si ya existe una caja abierta real en la sede elegida — insertar una podría chocar
-- contra datos de producción que esta prueba no controla. El flag ya alcanza: el `if
-- coalesce(activa,...)` que gatea cada bloque es EL MISMO mecanismo que los casos 5/6 ya prueban a
-- fondo con `stock_bajo` (una regla apagada no evalúa su condición en absoluto), así que probarlo
-- de nuevo con las cuatro comerciales sería repetir el mismo mecanismo con más riesgo y ningún dato
-- nuevo.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila (ni la fila de `materiales`
-- de prueba, ni ningún cambio en `alertas_reglas`).
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0101
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y
-- leer el mensaje de error P0001 que empieza con "RESULTADO 0101")

do $$
declare
  v_sede      text;
  mat_id      uuid;
  v_dedup     text;
  n           int;
  v_leida     boolean;
  v_mensaje1  text;
  v_mensaje   text;
  v_id1       uuid;
  v_id5       uuid;
  v_id        uuid;
  v_activa    boolean;
  r           text := '';
begin
  -- ── Caso 13: el estado que dejó la migración, ANTES de tocar nada ────────────────────────────
  select bool_and(activa) into v_activa from alertas_reglas
   where tipo in ('devolucion_vencida', 'devolucion_proxima', 'stock_bajo', 'caja_sin_cerrar');
  if v_activa is false then
    r := r || '[ok] caso13a: las 4 reglas comerciales quedaron activa=false; ';
  else
    r := r || format('[FALLA] caso13a: bool_and(activa) de las 4 comerciales = %s (esperaba false); ', v_activa);
  end if;

  select activa into v_activa from alertas_reglas where tipo = 'reporte_sin_evaluar';
  if v_activa is true then
    r := r || '[ok] caso13b: reporte_sin_evaluar sigue activa; ';
  else
    r := r || format('[FALLA] caso13b: reporte_sin_evaluar.activa = %s (esperaba true); ', v_activa);
  end if;

  -- ── Montaje del vehículo: un material sintético con stock bajo ───────────────────────────────
  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  insert into materiales (nombre, unidad, stock_actual, stock_minimo, sede_cod, activo)
    values ('Prueba 0101 Material', 'unidad', 1, 10, v_sede, true)
    returning id into mat_id;
  v_dedup := 'stock_bajo:' || mat_id::text;

  update alertas_reglas set activa = true where tipo = 'stock_bajo';

  r := r || 'montaje=ok; ';

  -- ── Caso 1: regla activa, condición cierta, sin aviso previo → se crea uno ───────────────────
  select count(*) into n from notificaciones where dedup_key = v_dedup;
  if n <> 0 then raise exception 'El dedup_key de prueba ya existia antes de correr nada: %', v_dedup; end if;

  perform generar_alertas();

  select id, mensaje, leida into v_id1, v_mensaje1, v_leida from notificaciones where dedup_key = v_dedup;
  if v_id1 is not null and v_leida is false then
    r := r || '[ok] caso1: condicion cierta sin aviso previo crea uno, sin leer; ';
  else
    r := r || format('[FALLA] caso1: no se creo el aviso esperado (id=%s, leida=%s); ', v_id1, v_leida);
  end if;

  -- ── Caso 2: misma condición, segunda corrida → no duplica; refresca mensaje y updated_at ─────
  update notificaciones set mensaje = 'MENSAJE_VIEJO_CASO2', updated_at = '2000-01-01'
   where dedup_key = v_dedup;

  perform generar_alertas();

  select count(*) into n from notificaciones where dedup_key = v_dedup;
  select mensaje into v_mensaje from notificaciones where dedup_key = v_dedup;
  if n = 1 and v_mensaje = v_mensaje1 and v_mensaje <> 'MENSAJE_VIEJO_CASO2'
     and not exists (select 1 from notificaciones where dedup_key = v_dedup and updated_at = '2000-01-01') then
    r := r || '[ok] caso2: no duplica, y refresca mensaje/updated_at sobre el mismo texto que antes; ';
  else
    r := r || format('[FALLA] caso2: n=%s mensaje=%s (esperaba 1 fila, mensaje=%s); ', n, v_mensaje, v_mensaje1);
  end if;

  -- ── Caso 3: aviso ya leído, condición sigue cierta → refresca el texto y SIGUE leído ──────────
  update notificaciones set leida = true, mensaje = 'MENSAJE_VIEJO_CASO3', updated_at = '2000-01-01'
   where dedup_key = v_dedup;

  perform generar_alertas();

  select count(*) into n from notificaciones where dedup_key = v_dedup;
  select leida, mensaje into v_leida, v_mensaje from notificaciones where dedup_key = v_dedup;
  if n = 1 and v_leida is true and v_mensaje = v_mensaje1 then
    r := r || '[ok] caso3: sigue leida=true y el mensaje se refresco igual; ';
  else
    r := r || format('[FALLA] caso3: n=%s leida=%s mensaje=%s; ', n, v_leida, v_mensaje);
  end if;

  -- ── Caso 4: la condición deja de ser cierta → el aviso desaparece, leído o no ─────────────────
  -- (viene leida=true del caso 3 — a propósito: "leído o no" según la spec).
  update materiales set stock_actual = 999 where id = mat_id;

  perform generar_alertas();

  select count(*) into n from notificaciones where dedup_key = v_dedup;
  if n = 0 then
    r := r || '[ok] caso4: la condicion dejo de ser cierta y el aviso (que estaba leido) desaparecio; ';
  else
    r := r || format('[FALLA] caso4: el aviso sigue existiendo (%s fila(s)) con la condicion falsa; ', n);
  end if;

  -- ── Caso 5: regla apagada → sus avisos existentes NO se tocan ────────────────────────────────
  -- Primero se recrea el aviso (condicion cierta, regla activa); recien ahi se apaga la regla y
  -- se vuelve a poner la condicion en falso: si el borrado de C-1 no respetara el `if activa`,
  -- este aviso desaparecería igual que en el caso 4, y NO debe.
  update materiales set stock_actual = 1 where id = mat_id;
  perform generar_alertas();

  select id into v_id5 from notificaciones where dedup_key = v_dedup;
  if v_id5 is null then
    raise exception 'caso5: no se pudo recrear el aviso de partida (revisar el vehiculo)';
  end if;
  -- OJO: v_id5 es una fila NUEVA (uuid distinto de v_id1) porque el caso4 borró la de antes. Es
  -- justo el punto de partida correcto: lo que importa de acá en más es que esta fila puntual no
  -- se toque mientras la regla está apagada, no si coincide con la del caso 1.

  update alertas_reglas set activa = false where tipo = 'stock_bajo';
  update materiales set stock_actual = 999 where id = mat_id;  -- condicion ahora falsa

  perform generar_alertas();

  select count(*) into n from notificaciones where dedup_key = v_dedup and id = v_id5;
  if n = 1 then
    r := r || '[ok] caso5: con la regla apagada, el aviso existente NO se toco (condicion ya falsa y sigue ahi); ';
  else
    r := r || format('[FALLA] caso5: el aviso desaparecio o cambio de fila estando la regla apagada (n=%s); ', n);
  end if;

  -- ── Caso 6: regla apagada y vuelta a encender → se mantiene, sin duplicar ────────────────────
  update materiales set stock_actual = 1 where id = mat_id;  -- condicion vuelve a ser cierta
  update alertas_reglas set activa = true where tipo = 'stock_bajo';

  perform generar_alertas();

  select count(*) into n from notificaciones where dedup_key = v_dedup;
  select id into v_id from notificaciones where dedup_key = v_dedup;
  if n = 1 and v_id = v_id5 then
    r := r || '[ok] caso6: al reactivar con la condicion de nuevo cierta, se mantiene LA MISMA fila del caso5, sin duplicar; ';
  else
    r := r || format('[FALLA] caso6: n=%s id=%s (esperaba 1 fila, misma id %s del caso5); ', n, v_id, v_id5);
  end if;

  raise exception 'RESULTADO 0101 --> %', r;
end $$;
