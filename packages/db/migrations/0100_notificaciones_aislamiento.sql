-- 0100_notificaciones_aislamiento.sql — cierra los dos agujeros de aislamiento de notificaciones:
-- un aviso sin sede ya no lo ve cualquiera con sesión (mira destinatario_rol), y ya no se puede
-- insertar un aviso global desde el cliente.
--
-- Implementa docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md
-- §2 y §8 paso 1. SÓLO RLS: ni una regla de negocio nueva, ni un cambio en generar_alertas() — eso
-- es la 0101 (paso 2) y los pasos 3/4/5 de la spec, que no son de esta migración.
--
-- Las dos policies vivas hoy, verificadas contra 0041_notificaciones.sql (grep de notif_sel/
-- notif_rw en las 99 migraciones anteriores no devuelve ningún otro archivo que las toque):
--
--   notif_sel (select) using: app_es_admin() OR destinatario_sede IS NULL
--                             OR destinatario_sede IN (select app_sedes()) OR destinatario_id = auth.uid()
--   notif_rw  (all)    using:      app_es_admin() OR sede propia OR destinatario_id = auth.uid()
--                      with check: app_es_admin() OR destinatario_sede IS NULL OR sede propia
--                                  OR destinatario_id = auth.uid()
--
-- ── A-1 (notif_sel) ─────────────────────────────────────────────────────────────────────────
-- `destinatario_sede is null` significaba "lo ve cualquiera con sesión", sin mirar nunca
-- `destinatario_rol` (columna que las 5 reglas ya llenan). Ahora, para un aviso SIN sede:
--   · si tiene destinatario_rol, sólo lo ve quien tenga ESE rol (además de admin/destinatario_id,
--     que ya pasaban antes);
--   · si además destinatario_rol es null, ahí SÍ es un aviso realmente global, y lo ve cualquiera
--     con sesión — mismo idiom que ya usa reglas_sel (0041): `auth.uid() is not null`.
--
-- Helper nuevo: private.app_mi_rol(). No existía ninguno para "el rol de quien pregunta" (sólo
-- app_es_admin()/app_sedes()/app_es_almacen()/app_ve_datos_personas(), ninguno sirve acá). Devuelve
-- el `rol` BASE (empleados.rol, el que fija empleados_rol_base_check en 0050) porque
-- `alertas_reglas.destinatario_rol` y las 5 reglas de 0041/0046 sólo insertan valores base
-- ('admin', 'encargado_tienda', 'encargado_almacen'), nunca un rol derivado (`rol_cod`). Mismo
-- idiom que private.app_es_admin()/private.app_sedes() desde la 0083: una persona suspendida
-- (activo=false) no tiene rol para la RLS, igual que no tiene sedes ni es admin.
--
-- ── A-2 (notif_rw) ──────────────────────────────────────────────────────────────────────────
-- Se saca `destinatario_sede is null` del `with check`: un cliente autenticado ya no puede
-- insertar un aviso global. `generar_alertas()` sigue pudiendo crearlos porque es SECURITY
-- DEFINER (corre como su dueño, no como el rol `authenticated`, así que ni siquiera evalúa este
-- check) — es justo la lectura de la spec: "un aviso global lo genera la función, no un cliente".
--
-- El `using` de notif_rw NO se toca (la tarea es sólo el `with check`). Se comprobó que
-- marcar-leído sigue andando: marcarLeida/marcarTodasLeidas (apps/erp-web/lib/notificaciones-repo.ts)
-- sólo tocan `leida`/`updated_at` — ningún campo de destinatario cambia — así que la rama que
-- habilitaba el update de un aviso PERSONAL (`destinatario_id = auth.uid()`) sigue estando en el
-- `using` y en el `with check`, exactamente igual antes y después de este cambio. El botón manual
-- del administrador (generarAlertas() en notificaciones-repo.ts) tampoco se rompe: sólo llega ahí
-- quien ya es admin/dueño (notificaciones/actions.ts corta antes con "Solo un administrador puede
-- generar alertas."), y private.app_es_admin() ya cubre esa rama sin necesitar la del nulo.
-- Por eso NO hizo falta partir notif_rw en políticas por comando.
--
-- Idempotente: create or replace function + drop policy if exists + create policy.

-- ── El rol de quien pregunta (null si no existe, o si está suspendido) ────────────────────────
create or replace function private.app_mi_rol()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select e.rol
    from public.empleados e
   where e.id = auth.uid() and e.activo;
$function$;

revoke execute on function private.app_mi_rol() from public, anon;
grant  execute on function private.app_mi_rol() to authenticated;

-- ── A-1: la lectura respeta destinatario_rol para los avisos sin sede ─────────────────────────
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
    -- Aviso realmente global: sin sede Y sin rol. Cualquiera CON SESIÓN lo ve (no un anónimo).
    destinatario_sede is null
    and destinatario_rol is null
    and auth.uid() is not null
  )
);

-- ── A-2: el with check ya no admite sede nula (sólo generar_alertas(), security definer, la crea) ──
drop policy if exists notif_rw on notificaciones;
create policy notif_rw on notificaciones for all
  using (
    private.app_es_admin()
    or destinatario_sede in (select private.app_sedes())
    or destinatario_id = auth.uid()
  )
  with check (
    private.app_es_admin()
    or destinatario_sede in (select private.app_sedes())
    or destinatario_id = auth.uid()
  );
