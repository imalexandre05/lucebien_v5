-- Prueba de la migración 0109_notificaciones_motor_unico.sql
--
-- Cubre los tres casos que pide el encargo de la 0109 (C-3 de
-- docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md):
--   3. Una llamada SIN impersonar nada — ni rol, ni `request.jwt.claims` — como corre hoy el cron de
--      `pg_cron` (0042) y como corren HOY las pruebas 0101/0107 al llamar `generar_alertas()`
--      directo: sigue pudiendo llamarla, no se rompió el camino del cron.
--   1. Un no-administrador (colaborador sintético PRUEBA0109-*), impersonado como `authenticated`,
--      intenta `generar_alertas()` → se niega con 'PERMISO:...'.
--   2. Un administrador REAL (de los que ya existen — sólo se lee su id, no se lo modifica),
--      impersonado como `authenticated`, llama `generar_alertas()` → corre igual que corría antes,
--      devuelve un entero >= 0 (no se comprueba el contenido: eso ya lo prueban 0101/0107).
--
-- ⚠️ EL CASO 3 NO ES UN TRÁMITE — es la comprobación del hallazgo que dejó escrito la 0109. El guard
-- de `generar_alertas()` es `if current_setting('request.jwt.claims', true) is not null and not
-- private.app_es_admin() then raise ...` — sólo exige admin cuando existe un contexto de PostgREST.
--
-- ⚠️ POR QUÉ EL CASO 3 VA PRIMERO, ANTES DE MONTAR NADA Y ANTES DE CUALQUIER `set_config`. Se
-- verificó contra `scilb` (no se asumió) que, una vez que `request.jwt.claims` se toca DENTRO de una
-- transacción —aunque sea con `set_config(..., '{}', true)` o con `set_config(..., null, true)`—,
-- `current_setting('request.jwt.claims', true)` YA NO vuelve a dar `null` en esa misma transacción:
-- da `'{}'` o `''`, ninguno de los dos es `null`. Una primera versión de esta prueba corría el caso 3
-- DESPUÉS de los casos 1 y 2 e intentaba "limpiar" el GUC — y el caso 3 daba `[FALLA]` con
-- `PERMISO:...` SIEMPRE, sin importar si el guard de la migración estaba bien o mal: no estaba
-- probando el camino del cron, estaba probando "un admin cuyo GUC quedó en `{}`", que el guard niega
-- correctamente (no es null, así que exige `app_es_admin()`, y con `{}` no hay `sub` que lo cumpla).
-- Confirmado aparte, en una transacción realmente nueva y sin tocar nada: `generar_alertas()` sin
-- ningún `set_config` previo SÍ corre — por eso acá el caso 3 es lo PRIMERO que hace la transacción.
--
-- Los tres casos están envueltos en `begin ... exception when others then ...` (mismo patrón que
-- 0099_borrar_alta_por_error.sql, casos 8/9): así el resultado —sea [ok] o [FALLA]— queda escrito en
-- `r` y el archivo llega igual a su 'RESULTADO', en vez de abortar a mitad de camino si alguno de los
-- tres no sale como se esperaba.
--
-- NO TOCA 0101_alertas_se_retiran.prueba.sql ni 0107_notificaciones_reglas_control_interno.prueba.sql
-- (instrucción explícita del encargo). Ninguno de los tres casos de acá reescribe ninguna regla de
-- negocio de generar_alertas(): sólo llaman a la función con distintas identidades.
--
-- SE DESCARTA SOLA: todo el escenario —incluidas las llamadas reales a generar_alertas(), que
-- evalúan las seis reglas nuevas y las cinco viejas contra la base completa, mismo criterio que ya
-- usan 0101/0107— vive dentro de un bloque que termina lanzando una excepción con el resultado. Eso
-- aborta la transacción y no queda ni el colaborador sintético ni ningún cambio real en
-- `notificaciones`.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0109
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y leer
-- el mensaje de error P0001 que empieza con "RESULTADO 0109")

do $$
declare
  admin_id   uuid;
  no_admin   uuid;
  v_sede     text;
  resultado  int;
  r          text := '';
begin
  -- ── Caso 3, PRIMERO Y ANTES DE TOCAR NADA: sin impersonar — el camino del cron ──────────────────
  -- Ni un solo `set_config` corrió todavía en esta transacción: `request.jwt.claims` está en su
  -- estado real de "nunca tocado", el mismo con el que arranca la conexión de pg_cron.
  begin
    resultado := generar_alertas();
    if resultado is not null and resultado >= 0 then
      r := r || format('[ok] caso3: sin impersonar nada (como corre pg_cron), generar_alertas() sigue funcionando, devolvió %s; ', resultado);
    else
      r := r || format('[FALLA] caso3: generar_alertas() devolvió %s (esperaba un entero >= 0); ', resultado);
    end if;
  exception when others then
    r := r || format(
      '[FALLA] caso3: sin impersonar nada, generar_alertas() falló (%s) -- si el error empieza con ''PERMISO:'', el guard de la 0109 también bloquea al cron de verdad y hay que corregir la migración antes de aplicarla; ',
      sqlerrm
    );
  end;

  -- ── Montaje: un administrador real (sólo lectura) y un colaborador sintético no-admin ─────────
  select id into admin_id from empleados where rol in ('admin', 'dueno') and activo order by id limit 1;
  if admin_id is null then raise exception 'La prueba necesita al menos un administrador activo'; end if;

  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0109-NOADMIN', 'PRUEBA0109-NOADMIN', 'N9', 'confeccionista', v_sede, true, date '2020-01-01')
    returning id into no_admin;

  r := r || 'montaje=ok; ';

  -- ── Caso 1: un no-administrador (impersonado como authenticated) NO puede llamarla ────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', no_admin, 'role', 'authenticated')::text, true);
  if private.app_es_admin() then
    raise exception 'caso1: el colaborador sintético resultó admin; la prueba no comprobaría nada';
  end if;

  begin
    perform generar_alertas();
    r := r || '[FALLA] caso1: un no-administrador pudo llamar generar_alertas(); ';
  exception when others then
    if sqlerrm like 'PERMISO:%' then
      r := r || '[ok] caso1: un no-administrador no puede llamar generar_alertas() (guard adentro de la función, no sólo la pantalla); ';
    else
      r := r || format('[FALLA] caso1: falló por otro motivo (%s); ', sqlerrm);
    end if;
  end;

  execute 'reset role';

  -- ── Caso 2: un administrador real (impersonado como authenticated) SÍ puede llamarla ──────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'caso2: no se pudo impersonar al administrador; la prueba no comprobaría nada';
  end if;

  begin
    resultado := generar_alertas();
    if resultado is not null and resultado >= 0 then
      r := r || format('[ok] caso2: el administrador (impersonado como authenticated) llamó generar_alertas() y corrió igual que antes, devolvió %s; ', resultado);
    else
      r := r || format('[FALLA] caso2: generar_alertas() devolvió %s (esperaba un entero >= 0); ', resultado);
    end if;
  exception when others then
    r := r || format('[FALLA] caso2: el administrador no pudo llamar generar_alertas() (%s); ', sqlerrm);
  end;

  execute 'reset role';

  raise exception 'RESULTADO 0109 --> %', r;
end $$;
