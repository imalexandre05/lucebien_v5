-- 0108_notificaciones_global_no_incluye_personal.sql — un aviso con destinatario_id puesto ya no
-- se cuela por la rama de "aviso global" de la política de lectura.
--
-- Corrige un agujero real de la propia migración 0100 (8-sep-2026), encontrado al aplicar y probar
-- la 0107 (las seis reglas nuevas de control interno) contra `scilb`: dos de esas reglas
-- (dia_con_hora_estimada, dia_sin_marca) insertan, para la copia dirigida a la PERSONA, una fila con
-- `destinatario_id = <esa persona>` y `destinatario_rol`/`destinatario_sede` en null — exactamente
-- como C-5 de la spec pide (docs/superpowers/specs/notificaciones/
-- 2026-09-06-notificaciones-de-control-interno-design.md §5). Pero `notif_sel` (0100) tenía una
-- rama de "aviso REALMENTE global" que sólo miraba `destinatario_sede is null and destinatario_rol
-- is null` — sin excluir que `destinatario_id` también estuviera puesto. Esa rama es un OR
-- independiente de las demás: aunque otra rama (`destinatario_id = auth.uid()`) exista para acotar
-- el aviso a esa persona, ésta lo abre a cualquiera con sesión igual.
--
-- Confirmado empíricamente contra `scilb` (no sólo leído): se aplicó la 0107, se montó su prueba
-- (empleados PRUEBA0107-P/Q), y el caso 9a — "Q, un colaborador ajeno, no ve ninguna de las dos
-- filas" — dio FALLA: Q veía la fila dirigida a P. Con este fix, el mismo caso pasa a [ok].
--
-- QUÉ CAMBIA. La rama de "aviso global" exige ADEMÁS `destinatario_id is null`: un aviso global de
-- verdad no apunta a sede, ni a rol, ni a una persona en particular. Un aviso con `destinatario_id`
-- puesto sólo lo ve esa persona (por la rama `destinatario_id = auth.uid()`) y el administrador —
-- nunca por la rama de "todos con sesión".
--
-- Las otras cuatro ramas de `notif_sel` no cambian. `notif_rw` (0100, A-2) tampoco: su `with check`
-- ya no admitía `destinatario_sede is null` desde la 0100, así que un insert con `destinatario_id`
-- puesto y sede/rol en null sigue pasando igual por la rama `destinatario_id = auth.uid()` — sólo
-- relevante para un insert hecho por la propia persona a su propio nombre, que no es el caso de
-- generar_alertas() (security definer, no evalúa RLS).
--
-- Idempotente: drop policy if exists + create policy.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · Un OR nuevo en una política de RLS es una fuga hasta que se prueba con una sesión que NO
--     debería ver la fila — no alcanza con que las sesiones que SÍ deberían verla, la vean.

drop policy if exists notif_sel on notificaciones;
create policy notif_sel on notificaciones for select using (
  private.app_es_admin()
  or destinatario_id = auth.uid()
  or destinatario_sede in (select private.app_sedes())
  or (
    destinatario_sede is null
    and destinatario_rol is not null
    and destinatario_rol = private.app_mi_rol()
  )
  or (
    -- Aviso REALMENTE global: sin sede, sin rol, Y sin persona. Cualquiera con sesión lo ve.
    destinatario_sede is null
    and destinatario_rol is null
    and destinatario_id is null
    and auth.uid() is not null
  )
);
