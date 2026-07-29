-- 0058_config_tipado_auditoria.sql — Fase 13: Configuración integral + auditoría.
--
-- Tres piezas independientes, todas idempotentes:
--   1) Metadatos tipados en `config` (tipo/descripcion/seccion/opciones) — SOLO para que el admin
--      pueda crear parámetros NUEVOS con su propio tipo/descripción desde /configuracion. Los
--      parámetros YA CONOCIDOS (pts_*, peso_*, turno_*_cierre, despiece_pct_saco, valores_*) usan
--      el catálogo tipado que vive en código (apps/erp-web/lib/config-catalogo.ts) como fuente de
--      verdad — estas columnas quedan NULL para ellos a propósito, así no hay dos lugares
--      (SQL y TS) describiendo lo mismo y pudiendo desincronizarse.
--   2) Ventana de habilitación de Valores 360° (Fase 13 tarea 3: "sube a config lo que quedó
--      hardcodeado" — la Fase 12 dejó el módulo SIEMPRE abierto a propósito, ver
--      docs/pendientes-negocio.md). Default = sigue exactamente igual de abierto que hoy.
--   3) audit_log + trigger genérico en las 5 tablas sensibles del plan (pedidos, caja_movimientos,
--      empleados, pagos, evaluaciones_mensuales). `prenda_pasada` queda fuera A PROPÓSITO (tabla de
--      alta frecuencia, instrucción explícita del plan).
--
-- ⚠️ Como 0050-0057 (F1,F2,F4,F5,F6,F7,F11,F12), esta migración está escrita y lista pero NO se
-- pudo aplicar contra scilb en este entorno: no hay MCP de Supabase disponible ni SUPABASE_DB_URL
-- (verificado, igual que reportaron las fases anteriores). El código de la app se escribió para
-- degradarse con un aviso ("falta aplicar la migración") en vez de reventar con un 500 mientras
-- esto siga pendiente — ver AuditoriaNoMigradoError en lib/auditoria-repo.ts.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Metadatos tipados en config (solo para parámetros CUSTOM creados desde la UI)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table config add column if not exists tipo        text;   -- numero|booleano|texto|lista|color|horario
alter table config add column if not exists descripcion text;
alter table config add column if not exists seccion     text;
alter table config add column if not exists opciones    text[]; -- solo si tipo='lista'

-- Ningún valor por defecto forzado: si tipo es null, la UI lo trata como 'texto' (fallback seguro).
comment on column config.tipo is
  'Tipo de control para parámetros CUSTOM creados desde /configuracion. NULL para los parámetros
   del catálogo de código (pts_*, peso_*, turno_*_cierre, despiece_pct_saco, valores_*): esos usan
   su propio tipo/descripción de apps/erp-web/lib/config-catalogo.ts, no estas columnas.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Valores 360°: ventana de habilitación (Fase 13 tarea 3)
--    El sistema viejo (routes/valores.js) tenía eval_valores_habilitado/modo/dias; la Fase 12 no
--    lo portó y dejó el módulo siempre abierto (decisión explícita, ver docs/pendientes-negocio.md
--    sección Fase 12 — "si el dueño quiere recuperar la ventana de días, es una clave de config").
--    Default = habilitado + modo 'siempre': CERO cambio de comportamiento hasta que el dueño decida
--    activar la ventana desde /configuracion.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('valores_habilitado', 'true'),
  ('valores_modo',       'siempre'),  -- 'siempre' | 'ventana'
  ('valores_dia_inicio', '1'),
  ('valores_dia_fin',    '31')
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Auditoría — tabla + trigger genérico (Fase 13 tarea 4)
--    Puerto del middleware de server.js:22-79 (interceptaba res.json y registraba todo
--    POST/PUT/DELETE 2xx) pero como TRIGGERS de Postgres: el ERP nuevo escribe por RPC y por
--    PostgREST directo, así que un middleware de Express no vería nada de eso.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists audit_log (
  id        bigint generated always as identity primary key,
  tabla     text not null,
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  fila_id   text not null default '',
  actor     uuid references empleados(id) on delete set null,
  antes     jsonb,
  despues   jsonb,
  at        timestamptz not null default now()
);
create index if not exists idx_audit_log_tabla_at on audit_log(tabla, at desc);
create index if not exists idx_audit_log_actor     on audit_log(actor);

alter table audit_log enable row level security;
-- Solo lectura para admin/dueño. A propósito NO hay policy de insert/update/delete para
-- 'authenticated': con RLS activo, la ausencia de policy deniega por defecto — el ÚNICO camino de
-- escritura es el trigger de abajo, que corre security definer (bypassa RLS como el dueño de la
-- función). Así el log queda de solo-anexado incluso para un admin usando la API REST directo.
drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log for select
  using (private.app_es_admin());

-- Función genérica: se reusa en las 5 tablas. SECURITY DEFINER porque quien dispara el trigger
-- puede ser cualquier rol autenticado (p.ej. ventas_junior cobrando en caja) que NO tiene permiso
-- de escribir en audit_log por su cuenta — el trigger sí puede, porque corre como el dueño de la
-- función (mismo mecanismo que private.app_es_admin() y el resto de helpers de RLS).
create or replace function private.audit_log_trigger() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_fila_id text;
  v_antes   jsonb;
  v_despues jsonb;
begin
  -- Todo el cuerpo va envuelto en su propio BEGIN/EXCEPTION (instrucción explícita del plan): un
  -- fallo de auditoría (columna inesperada, lo que sea) NUNCA debe bloquear la escritura original
  -- en pedidos/caja_movimientos/empleados/pagos/evaluaciones_mensuales.
  begin
    v_fila_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', '');
    v_antes   := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
    v_despues := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

    -- Nunca se registra el hash de contraseña, ni siquiera hasheado (reduce lo que hay que
    -- proteger si audit_log alguna vez se expone/exporta). El plan solo pedía cuidar tamaño y
    -- frecuencia, pero excluir un secreto es barato y es buena práctica igual.
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

-- Las 5 tablas sensibles del plan. `prenda_pasada` queda FUERA a propósito (alta frecuencia).
drop trigger if exists trg_audit_pedidos on pedidos;
create trigger trg_audit_pedidos after insert or update or delete on pedidos
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_caja_movimientos on caja_movimientos;
create trigger trg_audit_caja_movimientos after insert or update or delete on caja_movimientos
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_empleados on empleados;
create trigger trg_audit_empleados after insert or update or delete on empleados
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_pagos on pagos;
create trigger trg_audit_pagos after insert or update or delete on pagos
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_evaluaciones_mensuales on evaluaciones_mensuales;
create trigger trg_audit_evaluaciones_mensuales after insert or update or delete on evaluaciones_mensuales
  for each row execute function private.audit_log_trigger();
