-- 0099_borrar_alta_por_error.sql — deshacer un alta de personal hecha por error, sin abrir la
-- puerta a borrar a alguien que trabajó.
--
-- Implementa docs/superpowers/specs/empleados/2026-08-25-borrar-alta-por-error-design.md, con la
-- lista de tablas de su §7 (addendum medido contra pg_constraint el 25-ago-2026 sobre
-- public.empleados, que reemplaza a la §2 donde se contradicen — §2 se escribió de memoria).
--
-- ZONA CRÍTICA (no-negociables 1 y 3): esto borra filas de personas de forma irreversible. El
-- radio de daño no es el tamaño del código: es que un botón mal puesto se lleve historia que no
-- se puede recuperar. Por eso el borrado se niega apenas la persona tiene cualquier rastro de
-- sueldo, pago o evaluación (§7.1), y todo lo demás se cuenta ANTES de tocar nada (C-1) para que
-- quien decide vea el costo antes de confirmar.
--
-- Dos funciones, las dos `security definer` con `private.app_es_admin()` adentro (C-3, mismo
-- criterio que sueldo_entrada y huellero_declarar_faltas_del_dia — el guard no depende de que la
-- pantalla lo pregunte):
--
--   · empleado_borrar_alta_previo(empleado) — SÓLO LEE. Devuelve
--     {"bloqueos": [...textos...], "conteos": {...concepto: cantidad...}}. `bloqueos` lista los 11
--     motivos de §7.1 que apliquen (vacía si no hay ninguno); `conteos` cuenta sólo lo que
--     efectivamente se borraría o se vaciaría (§7.2/§7.3/§7.4) — nunca un total de la tabla, y
--     nunca algo del grupo que bloquea (si algo bloquea, no se borra nada).
--
--   · empleado_borrar_alta(empleado) — BORRA. No confía en que la pantalla haya llamado a la
--     anterior: llama ella misma a empleado_borrar_alta_previo() y corta si devuelve algún
--     bloqueo. Antes de eso comprueba que no se está por dejar a la empresa sin ningún
--     administrador activo (mismo criterio que actualizarEstadoEmpleado() en
--     apps/erp-web/lib/empleados-repo.ts, ya vigente para SUSPENDER desde la 0083 — acá vale
--     igual, por la misma razón).
--
-- LA CADENA COMPLETA DE §7:
--   · §7.1 (bloquean, comprobado por esta RPC y no por la FK): sueldo_liquidaciones,
--     sueldo_acuerdos, sueldo_movimientos, sueldo_ventas, pagos, evaluaciones_mensuales,
--     evaluaciones_valores (evaluado_id Y evaluador_id, aunque su FK es `cascade` — si no se
--     bloquea acá los votos se borrarían solos y en silencio), solicitudes.solicitante_id,
--     mt_consentimiento.registrado_por, mt_medicion_real.tomada_por (estas tres últimas con 0
--     filas hoy: `not null` ⇒ bloquean por defecto ante la primera fila futura).
--   · §7.2 (se van con la persona): asistencias y empleado_tiendas son `on delete cascade` (nada
--     que hacer, se van solas); huellero_mapeos es `restrict` y pipeline_puntos/
--     reporte_trabajadores son `no action` — estas tres se borran EXPLÍCITAS antes del delete
--     final o la base niega todo el borrado.
--   · §7.3 (la fila queda, la referencia se vacía): reportes (encargado_id y evaluador_id),
--     reporte_drafts, reporte_extras, incidencias (reportado_por_id y responsable_id),
--     prenda_historial, prenda_pasada (lavador_id y planchador_id), prenda_calificacion,
--     dispositivos_autorizados.aprobado_por. marcas_huellero.empleado_id es `set null` y Postgres
--     ya lo hace solo (no hay código acá), pero SÍ se cuenta en la vista previa: es lo que ve el
--     administrador en el ejemplo de diálogo de C-1 ("1 marca del huellero").
--   · §7.4 (comercial: código muerto para NAVEGAR desde el 20-ago, pero la FK sigue siendo real):
--     caja_movimientos, caja_sesiones (abierta_por_id y cerrada_por_id), compras, pedidos,
--     pedido_garantias, envios_accesorios (responsable_id y validado_por_id), envios_prendas,
--     stock_movimientos, accesorios_log, y las cuatro columnas NO bloqueantes de solicitudes
--     (aprobado_por_id, confirmado_por_id, entregado_por_id, rechazado_por_id — su
--     solicitante_id, en cambio, bloquea, ver §7.1).
--
-- El registro en audit_log (C-4: "se guarda el nombre y el código de quien se borró, password_hash
-- nunca entra") NO se escribe a mano acá: `trg_audit_empleados` (0058_config_tipado_auditoria.sql)
-- ya dispara en cada INSERT/UPDATE/DELETE sobre `empleados`, ya guarda el `antes` completo (que
-- incluye `nombre` y `cod`) y ya excluye `password_hash` explícitamente para esta tabla.
-- Escribirlo de nuevo a mano duplicaría la fila del mismo borrado.
--
-- mt_consentimiento / mt_medicion_real no las crea ninguna migración de ESTE repo — viven en la
-- misma base `scilb`, dadas de alta desde el repo de Mi Talla (LB-Web). Referenciarlas acá es
-- seguro aunque este repo no las declare: PL/pgSQL no valida que una tabla exista al crear la
-- función (sólo al ejecutarla), y la spec §7 —medida el 25-ago-2026 contra la base real— confirma
-- que ya existen en producción, con 0 filas cada una a esa fecha.
--
-- Idempotente: las dos son `create or replace function`. No tocan datos ni esquema.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas.
--   · Una función nueva no hereda ningún ACL: SIEMPRE `revoke ... from public, anon` + `grant ...
--     to authenticated` al crearla o cambiar su firma (la 0090 lo pagó con siete funciones
--     `security definer` alcanzables sin haber iniciado sesión).
--
-- Prueba: packages/db/pruebas/0099_borrar_alta_por_error.sql

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) empleado_borrar_alta_previo — sólo lee. Alimenta el diálogo de C-1.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function empleado_borrar_alta_previo(p_empleado uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public, private, pg_temp
as $fn$
declare
  v_bloqueos text[] := array[]::text[];
  v_conteos  jsonb;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede consultar esto';
  end if;

  if p_empleado is null then
    raise exception 'DATO:falta el empleado';
  end if;

  if not exists (select 1 from empleados where id = p_empleado) then
    raise exception 'DATO:el empleado no existe o ya fue borrado';
  end if;

  -- §7.1 — los 11 motivos, comprobados uno por uno. No se delega en la FK: dos de las once
  -- (evaluaciones_valores.evaluado_id/evaluador_id) son `on delete cascade` y la base los dejaría
  -- pasar en silencio si no se bloquean acá.
  if exists (select 1 from sueldo_liquidaciones where empleado_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tiene al menos una liquidación de sueldo emitida.';
  end if;
  if exists (select 1 from sueldo_acuerdos where empleado_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tiene un contrato (acuerdo de sueldo) registrado.';
  end if;
  if exists (select 1 from sueldo_movimientos where empleado_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tiene adelantos, descuentos o bonos registrados.';
  end if;
  if exists (select 1 from sueldo_ventas where empleado_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tiene ventas atribuidas.';
  end if;
  if exists (select 1 from pagos where empleado_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tiene pagos registrados en el sistema anterior.';
  end if;
  if exists (select 1 from evaluaciones_mensuales where empleado_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tiene una evaluación mensual emitida.';
  end if;
  if exists (select 1 from evaluaciones_valores where evaluado_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Fue evaluada por al menos una persona en Valores 360°.';
  end if;
  if exists (select 1 from evaluaciones_valores where evaluador_id = p_empleado) then
    v_bloqueos := v_bloqueos
      || 'Evaluó a alguien en Valores 360°: borrarla movería el promedio de esa persona.';
  end if;
  if exists (select 1 from solicitudes where solicitante_id = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tiene solicitudes al almacén hechas a su nombre.';
  end if;
  if exists (select 1 from mt_consentimiento where registrado_por = p_empleado) then
    v_bloqueos := v_bloqueos || 'Registró un consentimiento de Mi Talla.';
  end if;
  if exists (select 1 from mt_medicion_real where tomada_por = p_empleado) then
    v_bloqueos := v_bloqueos || 'Tomó una medición real de Mi Talla.';
  end if;

  -- §7.2/§7.3/§7.4 — sólo lo que efectivamente se borraría o se vaciaría para ESTE empleado,
  -- nunca un total de la tabla entera.
  v_conteos := jsonb_build_object(
    'asistencias',                        (select count(*) from asistencias           where empleado_id = p_empleado),
    'empleado_tiendas',                   (select count(*) from empleado_tiendas      where empleado_id = p_empleado),
    'huellero_mapeos',                    (select count(*) from huellero_mapeos       where empleado_id = p_empleado),
    'marcas_huellero',                    (select count(*) from marcas_huellero       where empleado_id = p_empleado),
    'pipeline_puntos',                    (select count(*) from pipeline_puntos       where empleado_id = p_empleado),
    'reporte_trabajadores',               (select count(*) from reporte_trabajadores  where empleado_id = p_empleado),
    'reportes_como_encargado',            (select count(*) from reportes              where encargado_id = p_empleado),
    'reportes_como_evaluador',            (select count(*) from reportes              where evaluador_id = p_empleado),
    'reporte_drafts',                     (select count(*) from reporte_drafts        where encargado_id = p_empleado),
    'reporte_extras',                     (select count(*) from reporte_extras        where registrado_por_id = p_empleado),
    'incidencias_reportadas',             (select count(*) from incidencias           where reportado_por_id = p_empleado),
    'incidencias_como_responsable',       (select count(*) from incidencias           where responsable_id = p_empleado),
    'prenda_historial',                   (select count(*) from prenda_historial      where empleado_id = p_empleado),
    'prenda_pasada_como_lavador',         (select count(*) from prenda_pasada         where lavador_id = p_empleado),
    'prenda_pasada_como_planchador',      (select count(*) from prenda_pasada         where planchador_id = p_empleado),
    'prenda_calificacion',                (select count(*) from prenda_calificacion   where calificador_id = p_empleado),
    'dispositivos_aprobados',             (select count(*) from dispositivos_autorizados where aprobado_por = p_empleado),
    'solicitudes_aprobadas',              (select count(*) from solicitudes           where aprobado_por_id = p_empleado),
    'solicitudes_confirmadas',            (select count(*) from solicitudes           where confirmado_por_id = p_empleado),
    'solicitudes_entregadas',             (select count(*) from solicitudes           where entregado_por_id = p_empleado),
    'solicitudes_rechazadas',             (select count(*) from solicitudes           where rechazado_por_id = p_empleado),
    'caja_movimientos',                   (select count(*) from caja_movimientos      where registrado_por_id = p_empleado),
    'caja_sesiones_abiertas',             (select count(*) from caja_sesiones         where abierta_por_id = p_empleado),
    'caja_sesiones_cerradas',             (select count(*) from caja_sesiones         where cerrada_por_id = p_empleado),
    'compras',                            (select count(*) from compras               where responsable_id = p_empleado),
    'pedidos',                            (select count(*) from pedidos               where creado_por_id = p_empleado),
    'pedido_garantias',                   (select count(*) from pedido_garantias      where creado_por_id = p_empleado),
    'envios_accesorios_como_responsable', (select count(*) from envios_accesorios     where responsable_id = p_empleado),
    'envios_accesorios_validados',        (select count(*) from envios_accesorios     where validado_por_id = p_empleado),
    'envios_prendas',                     (select count(*) from envios_prendas        where responsable_id = p_empleado),
    'stock_movimientos',                  (select count(*) from stock_movimientos     where responsable_id = p_empleado),
    'accesorios_log',                     (select count(*) from accesorios_log        where responsable_id = p_empleado)
  );

  return jsonb_build_object('bloqueos', to_jsonb(v_bloqueos), 'conteos', v_conteos);
end;
$fn$;

comment on function empleado_borrar_alta_previo(uuid) is
  'Sólo lee. Devuelve {"bloqueos": [...], "conteos": {...}} para el diálogo de C-1 de
   docs/superpowers/specs/empleados/2026-08-25-borrar-alta-por-error-design.md. bloqueos: los 11
   motivos de §7.1 que apliquen (texto en español, arreglo vacío si no hay ninguno). conteos: sólo
   lo que empleado_borrar_alta() efectivamente borraría o vaciaría (§7.2/§7.3/§7.4), nunca un total
   de la tabla entera. Sólo administrador (private.app_es_admin() adentro, no depende de que la
   pantalla lo pregunte).';

revoke execute on function empleado_borrar_alta_previo(uuid) from public, anon;
grant  execute on function empleado_borrar_alta_previo(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) empleado_borrar_alta — borra. Vuelve a comprobar los bloqueos ella misma.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function empleado_borrar_alta(p_empleado uuid)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = public, private, pg_temp
as $fn$
declare
  v_previo  jsonb;
  v_motivos text;
begin
  -- 1) Guard de admin.
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede borrar una alta';
  end if;

  if p_empleado is null then
    raise exception 'DATO:falta el empleado';
  end if;

  -- 2) El empleado existe.
  if not exists (select 1 from empleados where id = p_empleado) then
    raise exception 'DATO:el empleado no existe o ya fue borrado';
  end if;

  -- 3) No es el último administrador activo (spec §4, mismo criterio que
  --    actualizarEstadoEmpleado() en apps/erp-web/lib/empleados-repo.ts usa para suspender desde
  --    la 0083: si es admin/dueño activo y no queda ningún otro admin/dueño activo, se niega).
  if exists (
       select 1 from empleados where id = p_empleado and rol in ('admin', 'dueno') and activo
     )
     and not exists (
       select 1 from empleados where rol in ('admin', 'dueno') and activo and id <> p_empleado
     )
  then
    raise exception 'ESTADO:no se puede borrar al último administrador activo. Nombrá a otro administrador antes de borrar a este.';
  end if;

  -- 4) Los bloqueos de §7.1 — se recalculan acá, no se confía en que la pantalla haya llamado a
  --    empleado_borrar_alta_previo() antes de pedir el borrado.
  v_previo := empleado_borrar_alta_previo(p_empleado);
  if jsonb_array_length(v_previo -> 'bloqueos') > 0 then
    select string_agg(b, ' · ') into v_motivos
      from jsonb_array_elements_text(v_previo -> 'bloqueos') as b;
    raise exception 'BLOQUEADO:%', v_motivos;
  end if;

  -- 5) audit_log: lo escribe trg_audit_empleados (0058) en el delete del paso 8 de acá abajo —
  --    ver la cabecera de esta migración. No hay insert manual.

  -- 6) §7.3/§7.4 — la fila queda, la referencia se vacía.
  update reportes                 set encargado_id     = null where encargado_id     = p_empleado;
  update reportes                 set evaluador_id      = null where evaluador_id      = p_empleado;
  update reporte_drafts           set encargado_id      = null where encargado_id      = p_empleado;
  update reporte_extras           set registrado_por_id = null where registrado_por_id = p_empleado;
  update incidencias              set reportado_por_id  = null where reportado_por_id  = p_empleado;
  update incidencias              set responsable_id    = null where responsable_id    = p_empleado;
  update prenda_historial         set empleado_id       = null where empleado_id       = p_empleado;
  update prenda_pasada            set lavador_id        = null where lavador_id        = p_empleado;
  update prenda_pasada            set planchador_id     = null where planchador_id     = p_empleado;
  update prenda_calificacion      set calificador_id    = null where calificador_id    = p_empleado;
  update dispositivos_autorizados set aprobado_por      = null where aprobado_por      = p_empleado;

  update caja_movimientos         set registrado_por_id = null where registrado_por_id = p_empleado;
  update caja_sesiones            set abierta_por_id     = null where abierta_por_id     = p_empleado;
  update caja_sesiones            set cerrada_por_id      = null where cerrada_por_id      = p_empleado;
  update compras                  set responsable_id      = null where responsable_id      = p_empleado;
  update pedidos                  set creado_por_id        = null where creado_por_id        = p_empleado;
  update pedido_garantias         set creado_por_id        = null where creado_por_id        = p_empleado;
  update envios_accesorios        set responsable_id       = null where responsable_id       = p_empleado;
  update envios_accesorios        set validado_por_id      = null where validado_por_id      = p_empleado;
  update envios_prendas           set responsable_id       = null where responsable_id       = p_empleado;
  update stock_movimientos        set responsable_id       = null where responsable_id       = p_empleado;
  update accesorios_log           set responsable_id       = null where responsable_id       = p_empleado;
  update solicitudes              set aprobado_por_id      = null where aprobado_por_id      = p_empleado;
  update solicitudes              set confirmado_por_id    = null where confirmado_por_id    = p_empleado;
  update solicitudes              set entregado_por_id     = null where entregado_por_id     = p_empleado;
  update solicitudes              set rechazado_por_id     = null where rechazado_por_id     = p_empleado;

  -- 7) §7.2 — se van con la persona, y la base no lo hace sola:
  --    huellero_mapeos es `restrict` (antes, o la base niega el delete final);
  --    pipeline_puntos y reporte_trabajadores son `no action`.
  --    asistencias y empleado_tiendas son `cascade`: se van solas en el paso 8, no hace falta
  --    tocarlas acá.
  delete from huellero_mapeos      where empleado_id = p_empleado;
  delete from pipeline_puntos      where empleado_id = p_empleado;
  delete from reporte_trabajadores where empleado_id = p_empleado;

  -- 8) La fila. marcas_huellero.empleado_id (`set null`) y el resto de columnas `on delete set
  --    null` de §7.3 se resuelven solas acá; audit_log también (trg_audit_empleados, 0058) —
  --    guarda el `antes` completo (nombre y cod incluidos) sin password_hash.
  delete from empleados where id = p_empleado;
end;
$fn$;

comment on function empleado_borrar_alta(uuid) is
  'Deshace un alta de personal hecha por error (docs/superpowers/specs/empleados/
   2026-08-25-borrar-alta-por-error-design.md). Sólo administrador. Se niega si la persona es el
   último administrador activo, o si tiene cualquiera de los 11 rastros de §7.1 (pago, contrato,
   evaluación, voto de Valores 360° dado o recibido, etc.) — recalculados acá mismo, nunca
   confiando en lo que haya mostrado la pantalla. Lo demás se borra con la persona (§7.2) o se
   vacía sin borrar la fila (§7.3/§7.4). Irreversible: no hay forma de deshacer esto.';

revoke execute on function empleado_borrar_alta(uuid) from public, anon;
grant  execute on function empleado_borrar_alta(uuid) to authenticated;
