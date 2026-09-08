-- Prueba de la migración 0109_notificaciones_motor_unico.sql
--
-- Cubre los tres casos que pide el encargo de la 0109 (C-3 de
-- docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md):
--   1. Un no-administrador (colaborador sintético PRUEBA0109-*), impersonado como `authenticated`,
--      intenta `generar_alertas()` → se niega con 'PERMISO:...'.
--   2. Un administrador REAL (de los que ya existen — sólo se lee su id, no se lo modifica),
--      impersonado como `authenticated`, llama `generar_alertas()` → corre igual que corría antes,
--      devuelve un entero >= 0 (no se comprueba el contenido: eso ya lo prueban 0101/0107).
--   3. Una llamada SIN impersonar nada — ni rol, ni `request.jwt.claims` — como corre hoy el cron de
--      `pg_cron` (0042) y como corren HOY las pruebas 0101/0107 al llamar `generar_alertas()`
--      directo: sigue pudiendo llamarla, no se rompió el camino del cron.
--
-- ⚠️ EL CASO 3 NO ES UN TRÁMITE — es la comprobación del hallazgo que deja escrito la propia 0109.
-- `private.app_es_admin()` depende de `auth.uid()`, que lee el GUC `request.jwt.claims`; ese GUC
-- sólo existe cuando algo lo puso ahí (PostgREST, o un `set_config` de prueba). Ni una conexión
-- directa sin impersonar NI un trabajo de `pg_cron` lo fijan jamás, sea cual sea el rol de Postgres
-- con el que corran — ser superusuario evita los chequeos de GRANT, no la lógica de la función. Si
-- el guard de la 0109 bloquea también este camino, el caso da [FALLA] con el mensaje de error real:
-- ESO es la señal de que hay que corregir la spec antes que el código (Zone Guard, no-negociable 6),
-- no una fila para "arreglar" a mano hasta que pase.
--
-- Por qué el caso 3 limpia `request.jwt.claims` (no sólo `role`) antes de llamar: `reset role`
-- (usado por el caso 2 para volver del rol `authenticated`) NO borra ese GUC — es justo lo que deja
-- 0107_notificaciones_reglas_control_interno.prueba.sql:252 con el `sub` del administrador todavía
-- puesto de su caso 9d, así que sus llamadas de los casos 11/12 (líneas 259 y 273), que no repiten
-- `set_config`, en realidad SIGUEN corriendo como ese administrador, no "sin sesión". Acá se lo deja
-- explícito con `set_config('request.jwt.claims', '{}', true)` para que el caso 3 pruebe lo que dice
-- probar, no una impersonación que quedó pegada del caso anterior.
--
-- Los tres casos están envueltos en `begin ... exception when others then ...` (mismo patrón que
-- 0099_borrar_alta_por_error.sql, casos 8/9): así el resultado —sea [ok] o [FALLA]— queda escrito
-- en `r` y el archivo llega igual a su 'RESULTADO', en vez de abortar a mitad de camino si alguno de
-- los tres no sale como se esperaba.
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

  -- ── Caso 3: SIN impersonar nada — el camino del cron ───────────────────────────────────────────
  -- Se limpia también request.jwt.claims (no sólo el rol, ver cabecera): esto tiene que quedar
  -- exactamente como una conexión que nunca impersonó a nadie, no como el administrador del caso 2.
  perform set_config('request.jwt.claims', '{}', true);

  begin
    resultado := generar_alertas();
    if resultado is not null and resultado >= 0 then
      r := r || format('[ok] caso3: sin impersonar nada (como corre pg_cron), generar_alertas() sigue funcionando, devolvió %s; ', resultado);
    else
      r := r || format('[FALLA] caso3: generar_alertas() devolvió %s (esperaba un entero >= 0); ', resultado);
    end if;
  exception when others then
    r := r || format(
      '[FALLA] caso3: sin impersonar nada, generar_alertas() falló (%s) -- si el error empieza con ''PERMISO:'', confirma el hallazgo de la cabecera de la 0109: auth.uid() es null sin request.jwt.claims, así que private.app_es_admin() da false y el guard nuevo bloquearía también al cron de verdad; ',
      sqlerrm
    );
  end;

  raise exception 'RESULTADO 0109 --> %', r;
end $$;
