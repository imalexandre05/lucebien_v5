-- 0123_login_seguro.sql — login seguro: contador de intentos, parámetros de acceso y cambio
-- obligatorio de contraseña.
--
-- Implementa docs/superpowers/specs/permisos/2026-10-06-login-usuario-contrasena-design.md §3, §5 y
-- §7 (H0 de la auditoría docs/auditorias/2026-10-06-seguridad.md).
--
-- Número reservado a mano, autorizado por la sesión maestra el 6-oct-2026: el script proponía 0121,
-- pero 0121 (feat/frecuencia-pago-flexible) y 0122 (fix/seguridad-produccion) ya están asignadas.
--
-- ESTA MIGRACIÓN NO CAMBIA NINGUNA CONTRASEÑA. Hace tres cosas:
--   1. Crea `login_intentos` (fallos seguidos y bloqueo temporal por persona).
--   2. Siembra los tres parámetros editables de /configuracion → «Acceso».
--   3. Marca las cuentas de Supabase Auth de los empleados con
--      app_metadata.debe_cambiar_contrasena = true: desde que se aplica, cada persona debe cambiar
--      su contraseña al entrar (el middleware la lleva a /cambiar-contrasena).
--
-- Orden del día del cambio (spec §8): backup → desplegar el ERP → consulta de diagnóstico →
-- aplicar esta migración → contraseñas temporales a quien haga falta.
--
-- Idempotente: create if not exists, on conflict do nothing, y la marca sólo se pone donde la clave
-- no existe — reaplicarla no vuelve a obligar a quien ya cambió (la app deja la clave en false, no
-- la borra).

-- ── 1) Contador de intentos ─────────────────────────────────────────────────────────────────
-- Sólo el servidor (clave de servicio, apps/erp-web/lib/auth.ts) la lee y la escribe: corre ANTES
-- de que exista sesión. RLS activada SIN policies a propósito + revoke explícito: ni anon ni
-- authenticated pueden ver ni borrar su contador por la API (si pudieran borrarlo, el límite no
-- existiría). Es la excepción declarada a «toda tabla con RLS necesita policy de lectura y de
-- escritura»: aquí nadie salvo service_role debe leer ni escribir.
create table if not exists public.login_intentos (
  empleado_id     uuid primary key references public.empleados(id) on delete cascade,
  fallidos        integer not null default 0 check (fallidos >= 0),
  bloqueado_hasta timestamptz,
  actualizado     timestamptz not null default now()
);

alter table public.login_intentos enable row level security;
revoke all on public.login_intentos from anon, authenticated;

comment on table public.login_intentos is
  'Fallos seguidos de login y bloqueo temporal por persona. Sólo service_role (apps/erp-web/lib/auth.ts). Spec permisos/2026-10-06-login-usuario-contrasena.';

-- ── 2) Parámetros editables ─────────────────────────────────────────────────────────────────
-- DEFAULTS PROVISIONALES (no-negociable 5): ninguno lo confirmó el dueño. Se editan desde
-- /configuracion → «Acceso» (catálogo en apps/erp-web/lib/config-catalogo.ts) y están anotados en
-- docs/pendientes-negocio.md. Si una fila falta o tiene basura, el core cae a estos mismos valores
-- (leerReglasAcceso en packages/core/src/acceso.ts).
insert into config (clave, valor) values
  ('acceso_contrasena_min', '8'),   -- default provisional: largo mínimo de una contraseña nueva
  ('acceso_intentos_max',   '5'),   -- default provisional: fallos seguidos antes de bloquear
  ('acceso_bloqueo_min',    '15')   -- default provisional: minutos de bloqueo
on conflict (clave) do nothing;

-- ── 3) Cambio obligatorio en el primer ingreso ──────────────────────────────────────────────
-- app_metadata sólo lo escribe la clave de servicio: un empleado no puede quitarse la marca por
-- la API. Sólo cuentas que son empleados; no se toca ninguna otra cuenta de Auth.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"debe_cambiar_contrasena": true}'::jsonb,
    updated_at = now()
from public.empleados e
where u.id = e.id
  and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'debe_cambiar_contrasena');
