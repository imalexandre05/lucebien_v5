-- 0088_auditoria_config_y_tablas.sql — audita `config` y hace que el registro diga QUÉ cambió.
--
-- Implementa docs/superpowers/specs/auditoria/2026-08-23-auditoria-alcance-y-config-design.md §B-4
-- (hallazgo F35 de la auditoría del 23-ago-2026).
--
-- El problema en una línea: `config` guarda los pesos de la evaluación, los puntos de cada etapa
-- del pipeline y las horas de cierre de turno —parámetros que deciden una nota y un sueldo—, hay
-- tres administradores, y ninguna tabla de configuración tiene trigger de auditoría. Quién movió
-- un parámetro es hoy una pregunta con tres respuestas y ninguna evidencia.
--
-- Idempotente: se puede reaplicar sin fallar. `create or replace` para la función y
-- `drop trigger if exists` antes de cada `create trigger`.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).
--
-- Esta migración NO introduce ningún parámetro de negocio nuevo y NO cambia quién puede leer
-- `audit_log`: sigue siendo `audit_log_select` con `private.app_es_admin()` (0058:74-76), y la
-- tabla sigue sin policy de escritura, así que el único camino de escritura es el trigger
-- `security definer`.
--
-- Prueba: packages/db/pruebas/0088_auditoria_config_y_tablas.prueba.sql
--   bash tools/probar-migracion.sh 0088

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) `fila_id` sabe identificar una fila cuya clave primaria no se llama `id`
--
--    La versión de la 0058 (línea 93) hacía `coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id',
--    '')`. La clave primaria de `config` es `clave` y la tabla NO tiene columna `id` (verificado
--    contra information_schema.columns el 23-ago-2026), así que auditar `config` sin este cambio
--    escribiría `fila_id = ''`: el registro diría que alguien cambió *algo* de configuración sin
--    decir QUÉ parámetro, que es la mitad inútil de la respuesta.
--
--    Las dos claves nuevas van DESPUÉS de las de `id`, así que sólo entran en juego cuando no hay
--    columna `id`: ninguna de las trece tablas ya auditadas cambia de comportamiento.
--
--    El resto del cuerpo es idéntico al de la 0058 a propósito —incluidos el BEGIN/EXCEPTION que
--    impide que un fallo de auditoría bloquee la escritura original y el borrado de
--    `password_hash`—: esto es un `create or replace`, no una función nueva, y las trece tablas
--    auditadas apuntan a ella.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.audit_log_trigger() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_fila_id text;
  v_antes   jsonb;
  v_despues jsonb;
begin
  -- Todo el cuerpo va envuelto en su propio BEGIN/EXCEPTION (instrucción explícita del plan de la
  -- 0058): un fallo de auditoría NUNCA debe bloquear la escritura original.
  begin
    v_fila_id := coalesce(
      to_jsonb(new)->>'id',
      to_jsonb(old)->>'id',
      to_jsonb(new)->>'clave',   -- `config`: su clave primaria es `clave`, no `id`
      to_jsonb(old)->>'clave',
      ''
    );
    v_antes   := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
    v_despues := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

    -- Nunca se registra el hash de contraseña, ni siquiera hasheado (reduce lo que hay que
    -- proteger si audit_log alguna vez se expone/exporta).
    if TG_TABLE_NAME = 'empleados' then
      if v_antes   is not null then v_antes   := v_antes   - 'password_hash'; end if;
      if v_despues is not null then v_despues := v_despues - 'password_hash'; end if;
    end if;

    insert into audit_log (tabla, operacion, fila_id, actor, antes, despues)
    values (TG_TABLE_NAME, TG_OP, v_fila_id, auth.uid(), v_antes, v_despues);
  exception when others then
    null;
  end;

  return coalesce(new, old);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Auditoría de `config`, partida en dos triggers
--
--    POR QUÉ DOS Y NO UNO. /configuracion manda TODOS los parámetros en cada «Guardar»
--    (app/configuracion/cliente.tsx:212 arma el arreglo con items.map(...) completo y
--    lib/config-repo.ts:94 lo mete con un upsert), y `config` tiene 45 filas. Un solo trigger
--    `after insert or update or delete` escribiría 45 filas de audit_log por cada clic, 44 de
--    ellas sin ningún cambio: el rastro quedaría enterrado bajo su propio ruido, que es
--    exactamente el defecto que esta ola vino a arreglar del otro lado (la pantalla no alcanzaba
--    el rastro porque una sola tabla copaba la ventana).
--
--    La cláusula `when (old.* is distinct from new.*)` resuelve eso, pero un trigger declarado
--    para varios eventos no admite un `when` que mire `old` (en INSERT no existe). De ahí que el
--    alta y la baja vayan por un lado y la edición por otro.
--
--    `permisos_modulos` queda FUERA a propósito: la RPC permisos_guardar_matriz borra y reinserta
--    la matriz entera en cada Guardar, así que ahí ni siquiera `is distinct from` ayudaría —cada
--    clic produciría 105 DELETE más 105 INSERT legítimos—. Auditar esa tabla necesita registrar la
--    diferencia y no las filas, y eso es otro cambio.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_audit_config on config;
drop trigger if exists trg_audit_config_alta_baja on config;
drop trigger if exists trg_audit_config_edicion   on config;

create trigger trg_audit_config_alta_baja after insert or delete on config
  for each row execute function private.audit_log_trigger();

create trigger trg_audit_config_edicion after update on config
  for each row when (old.* is distinct from new.*)
  execute function private.audit_log_trigger();
