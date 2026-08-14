-- 0068_mi_talla_esquema.sql — Módulo "Mi Talla" (web pública LB-Web): mediciones corporales
-- estimadas por motor (estadístico hoy, visión mañana), verdad de cinta del taller,
-- consentimiento digital Ley 29733, metadatos de imágenes y configuración de tallaje.
--
-- Decisión de negocio (Alexander, 13/14-ago-2026, spec docs/superpowers/specs/
-- 2026-08-13-mi-talla-design.md): el cliente web se mide anónimo (signInAnonymously) y
-- opcionalmente convierte a cuenta por email OTP CONSERVANDO el mismo auth.uid(); el sastre
-- usa su usuario Supabase del ERP (autorización = existe fila en empleados, sin rol nuevo).
--
-- Numeración: 0067 está tomado por 0067_aislamiento_datos_personas.sql en la rama
-- feat/sueldos-motor (pendiente de merge al escribir esto); esta migración es independiente
-- de aquella y puede aplicarse antes o después sin conflicto.
--
-- Prefijo mt_: public ya tiene 53 tablas del ERP y `clientes` del ERP NO son usuarios Auth,
-- mientras que mt_medicion.cliente_id SÍ es auth.uid() — el prefijo evita joins accidentales
-- entre dominios y deja el módulo auditable con like 'mt\_%'.
--
-- Regla invariante nº1 del spec: la estimación NUNCA se sobreescribe con la medida real
-- (el par estimación⟷cinta es el dataset de calibración) → mt_medicion sin policies de
-- UPDATE/DELETE; mt_medicion_real en tabla aparte con unique(medicion_id).
--
-- Sobre el claim is_anonymous: NO se restringe el INSERT web a propósito — el flujo público
-- entero corre con sesión anónima y la conversión a cuenta conserva el uid, así que las
-- filas insertadas de anónimo SON las que el usuario "guarda". El claim se usa solo en la
-- limpieza de anónimos huérfanos (query de mantenimiento al pie).
--
-- Idempotente: create table/index if not exists, drop policy if exists + create policy,
-- create or replace function, insert on conflict do nothing.

-- ── 0) Helper: ¿el usuario autenticado es empleado del ERP? ─────────────────────────────────
-- security definer (como private.app_es_admin, 0037): la RLS de empleados solo deja ver la
-- fila propia, y esta función debe poder responder para CUALQUIER sesión (p.ej. evaluar la
-- policy de select de mt_medicion para un cliente web sin tocar empleados).
create or replace function private.app_es_empleado() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from empleados e where e.id = auth.uid());
$$;
revoke all on function private.app_es_empleado() from public, anon;
grant execute on function private.app_es_empleado() to authenticated;

-- ── 1) mt_config — tallaje y umbrales editables (lectura pública, escritura admin) ─────────
create table if not exists mt_config (
  clave          text primary key,
  valor          jsonb not null,
  descripcion    text,
  actualizada_en timestamptz not null default now()
);
alter table mt_config enable row level security;

drop policy if exists mt_config_select on mt_config;
create policy mt_config_select on mt_config for select to anon, authenticated
  using ( true );  -- guard-ok: catálogo público de tallas/umbrales, sin ningún dato personal

drop policy if exists mt_config_write on mt_config;
create policy mt_config_write on mt_config for all to authenticated
  using (private.app_es_admin()) with check (private.app_es_admin());

-- Seeds PROVISIONALES (defaults inventados → docs/pendientes-negocio.md sección Mi Talla).
-- tabla_saco: US par 34–52, letra equivalente y hombro de prenda en cm (el hombro por talla
-- es el filtro duro del algoritmo de tallas; los valores son la progresión típica 1 cm/talla
-- desde 45.5 cm en el 38 — NADIE midió los sacos reales aún). EU = US + 10, lo pone el código.
insert into mt_config (clave, valor, descripcion) values
  ('tabla_saco', '{"tallas":[
     {"us":34,"letra":"XS","hombro_cm":43.5},{"us":36,"letra":"S","hombro_cm":44.5},
     {"us":38,"letra":"M","hombro_cm":45.5},{"us":40,"letra":"M","hombro_cm":46.5},
     {"us":42,"letra":"L","hombro_cm":47.5},{"us":44,"letra":"XL","hombro_cm":48.5},
     {"us":46,"letra":"XXL","hombro_cm":49.5},{"us":48,"letra":"XXL","hombro_cm":50.5},
     {"us":50,"letra":"3XL","hombro_cm":51.5},{"us":52,"letra":"3XL","hombro_cm":52.5}]}'::jsonb,
   'Tallas de saco US (pecho en pulgadas, pares). PROVISIONAL: hombro_cm por medir en prendas reales.'),
  ('tabla_pantalon', '{"min_us":28,"max_us":38,"paso":2}'::jsonb,
   'Tallas de pantalón por cintura en pulgadas US (la basta siempre se ajusta).'),
  ('umbrales_drop', '{"slim_min":7,"regular_min":5}'::jsonb,
   'Drop = pecho−cintura en pulgadas: >=7 slim, 5–6 regular, <=4 executive. PROVISIONAL (varía por marca).'),
  ('largos_saco', '{"S":{"hasta_cm":167},"R":{"hasta_cm":182},"L":{"hasta_cm":250}}'::jsonb,
   'Largo S/R/L por estatura en cm. PROVISIONAL.'),
  ('tolerancia_hombro_cm', '1'::jsonb,
   'Tolerancia en cm del filtro de hombro entre dos tallas.'),
  ('retencion_imagenes_meses', '24'::jsonb,
   'borrar_despues_de por defecto para imágenes de taller. PROVISIONAL (sin política legal escrita).')
on conflict (clave) do nothing;

-- ── 2) mt_medicion — estimación del motor; INMUTABLE una vez creada ────────────────────────
create table if not exists mt_medicion (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid,            -- auth.uid() del medido (anónimo o permanente); NULL en taller
  cliente_nombre      text,            -- solo origen='taller': identidad del cliente sin cuenta
  cliente_dni         text,            -- (pre-vínculo por dni con un futuro módulo comercial)
  motor               text not null check (motor in ('estadistico','vision','proveedor')),
  version_calibracion text not null,
  entrada             jsonb not null check (jsonb_typeof(entrada) = 'object'),   -- {altura_cm,peso_kg,edad,sexo}
  medidas             jsonb not null check (jsonb_typeof(medidas) = 'object'),   -- 8 claves *_cm
  confianza           jsonb not null check (jsonb_typeof(confianza) = 'object'), -- {global,porMedida}
  vector_rasgos       jsonb,           -- landmarks/siluetas normalizados; NO identifican a la persona
  origen              text not null check (origen in ('web','taller')),
  sede                text,            -- cod de sede ('LB') cuando origen='taller'
  creada_en           timestamptz not null default now()
);
create index if not exists mt_medicion_cliente_idx on mt_medicion (cliente_id, creada_en desc);
create index if not exists mt_medicion_taller_idx  on mt_medicion (origen, sede, creada_en desc);
alter table mt_medicion enable row level security;

-- SELECT: el dueño de la medición (auth.uid(), vale igual para sesión anónima) o cualquier
-- empleado (el sastre revisa mediciones de taller; la calibración F3 lee los pares).
drop policy if exists mt_medicion_select on mt_medicion;
create policy mt_medicion_select on mt_medicion for select to authenticated
  using (cliente_id = (select auth.uid()) or private.app_es_empleado());

-- INSERT web: cualquier sesión authenticated (anónima incluida) crea SU fila. Tope de 20/día
-- por uid como freno de spam (PROVISIONAL, pendientes-negocio; la subconsulta corre bajo la
-- policy de select y solo ve filas propias — barata y sin recursión).
drop policy if exists mt_medicion_insert_web on mt_medicion;
create policy mt_medicion_insert_web on mt_medicion for insert to authenticated
  with check (
    origen = 'web'
    and cliente_id = (select auth.uid())
    and sede is null and cliente_nombre is null and cliente_dni is null
    and (select count(*) from mt_medicion x
         where x.cliente_id = (select auth.uid())
           and x.creada_en > now() - interval '1 day') < 20
  );

-- INSERT taller: solo empleados; el cliente medido en tienda no tiene sesión → cliente_id NULL
-- (el vínculo futuro con una cuenta se hará por RPC dedicada, nunca suplantando uid ajenos).
drop policy if exists mt_medicion_insert_taller on mt_medicion;
create policy mt_medicion_insert_taller on mt_medicion for insert to authenticated
  with check (
    origen = 'taller'
    and private.app_es_empleado()
    and sede is not null
    and cliente_id is null
  );

-- Sin policies de UPDATE/DELETE: inmutable para todo el mundo (regla invariante nº1).
revoke update, delete on mt_medicion from anon, authenticated;
revoke all on mt_medicion from anon;

-- ── 3) mt_medicion_real — verdad de cinta métrica; tabla aparte A PROPÓSITO ────────────────
create table if not exists mt_medicion_real (
  id          uuid primary key default gen_random_uuid(),
  medicion_id uuid not null references mt_medicion(id) on delete cascade,
  tomada_por  uuid not null references empleados(id),
  medidas     jsonb not null check (jsonb_typeof(medidas) = 'object'),
  observacion text,
  tomada_en   timestamptz not null default now(),
  -- una sola verdad por medición: si el sastre re-mide, se crea OTRA mt_medicion (otro par)
  constraint mt_medicion_real_unica unique (medicion_id)
);
alter table mt_medicion_real enable row level security;

drop policy if exists mt_medicion_real_select on mt_medicion_real;
create policy mt_medicion_real_select on mt_medicion_real for select to authenticated
  using (
    private.app_es_empleado()
    or exists (select 1 from mt_medicion m
               where m.id = medicion_id and m.cliente_id = (select auth.uid()))
  );

drop policy if exists mt_medicion_real_insert on mt_medicion_real;
create policy mt_medicion_real_insert on mt_medicion_real for insert to authenticated
  with check (private.app_es_empleado() and tomada_por = (select auth.uid()));

-- UPDATE solo para quien la tomó (corregir un dedo mal puesto no viola la regla nº1: la
-- inmutable es la ESTIMACIÓN). Sin DELETE.
drop policy if exists mt_medicion_real_update on mt_medicion_real;
create policy mt_medicion_real_update on mt_medicion_real for update to authenticated
  using (tomada_por = (select auth.uid()))
  with check (tomada_por = (select auth.uid()));

revoke delete on mt_medicion_real from anon, authenticated;
revoke all on mt_medicion_real from anon;

-- ── 4) mt_consentimiento — evidencia Ley 29733; solo taller; nunca se edita ni borra ───────
create table if not exists mt_consentimiento (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  dni            text not null,
  texto_version  text not null,     -- ej. 'consentimiento-v1'; el texto vive versionado en LB-Web
  sede           text not null,
  registrado_por uuid not null references empleados(id),
  aceptado_en    timestamptz not null default now()
);
alter table mt_consentimiento enable row level security;

drop policy if exists mt_consentimiento_select on mt_consentimiento;
create policy mt_consentimiento_select on mt_consentimiento for select to authenticated
  using (private.app_es_empleado());

drop policy if exists mt_consentimiento_insert on mt_consentimiento;
create policy mt_consentimiento_insert on mt_consentimiento for insert to authenticated
  with check (private.app_es_empleado() and registrado_por = (select auth.uid()));

revoke update, delete on mt_consentimiento from anon, authenticated;
revoke all on mt_consentimiento from anon;

-- ── 5) mt_medicion_imagen — metadatos de fotos del bucket privado 'mi-talla' ───────────────
-- La tabla nace aquí (esquema completo junto) aunque el bucket llega en la migración de
-- storage de F2 — hasta entonces simplemente no hay filas.
create table if not exists mt_medicion_imagen (
  id                uuid primary key default gen_random_uuid(),
  medicion_id       uuid not null references mt_medicion(id) on delete cascade,
  storage_path      text not null,   -- '<medicion_id>/frontal.jpg' dentro del bucket mi-talla
  vista             text not null check (vista in ('frontal','lateral','video')),
  consentimiento_id uuid not null references mt_consentimiento(id),  -- NOT NULL: sin consentimiento no hay fila
  borrar_despues_de date not null default (current_date + interval '24 months')::date,
  creada_en         timestamptz not null default now()
);
create index if not exists mt_medicion_imagen_retencion_idx on mt_medicion_imagen (borrar_despues_de);
alter table mt_medicion_imagen enable row level security;

drop policy if exists mt_medicion_imagen_select on mt_medicion_imagen;
create policy mt_medicion_imagen_select on mt_medicion_imagen for select to authenticated
  using (private.app_es_empleado());

drop policy if exists mt_medicion_imagen_insert on mt_medicion_imagen;
create policy mt_medicion_imagen_insert on mt_medicion_imagen for insert to authenticated
  with check (private.app_es_empleado());

-- DELETE solo admin: derecho de supresión ARCO (Ley 29733) y retención vencida.
drop policy if exists mt_medicion_imagen_delete on mt_medicion_imagen;
create policy mt_medicion_imagen_delete on mt_medicion_imagen for delete to authenticated
  using (private.app_es_admin());

revoke update on mt_medicion_imagen from anon, authenticated;
revoke all on mt_medicion_imagen from anon;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr tras aplicar):
--   select tablename, rowsecurity from pg_tables
--     where schemaname='public' and tablename like 'mt\_%' order by 1;
--     -- esperado: 5 tablas, rowsecurity = true en todas
--   select tablename, policyname, cmd from pg_policies
--     where tablename like 'mt\_%' order by tablename, policyname;
--     -- esperado: 11 policies (config 2 · medicion 3 · medicion_real 3 · consentimiento 2
--     --            · imagen 3 = 13 menos las 2 que no existen: update/delete de medicion)
--   select clave, jsonb_typeof(valor) from mt_config order by clave;   -- 6 claves
--   select private.app_es_empleado();   -- como postgres: false (no hay auth.uid())
--
-- Mantenimiento (documentado, NO programado — anónimos huérfanos de +90 días):
--   -- select count(*) from auth.users u where u.is_anonymous
--   --   and u.created_at < now() - interval '90 days'
--   --   and not exists (select 1 from mt_medicion m where m.cliente_id = u.id);
-- ═══════════════════════════════════════════════════════════════════════════════════════════
