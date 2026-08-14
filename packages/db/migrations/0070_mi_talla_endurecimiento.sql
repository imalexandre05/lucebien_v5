-- 0070_mi_talla_endurecimiento.sql — Correcciones del verificador adversarial (14-ago-2026)
-- sobre 0068/0069, ANTES de que el módulo reciba tráfico real:
--
--  V5 (importante) — Aislamiento: app_es_empleado() era cierto para CUALQUIER empleado de
--     cualquier sede, incluso cesado, y la policy de select de mt_medicion le daba también
--     las mediciones de origen web (spec §5 dice: sastre → solo origen taller). Ahora:
--     empleado ACTIVO ve solo origen='taller' de SUS sedes; admin/dueno ve todo; el cliente
--     web solo lo suyo. Mismo cuarto aislamiento del no-negociable nº3.
--  V4 (importante) — El tope de 20 mediciones/día era evadible mandando creada_en en el
--     pasado (PostgREST acepta columnas del cliente). Se retira el privilegio de INSERT
--     sobre las columnas de timestamp en las 4 tablas (quedan en default now()) y se
--     acotan los tamaños de los jsonb para que un uid no pueda llenar el free tier.
--  V10 (menor) — app_es_empleado() usaba search_path = public (pg_temp se antepone para
--     relaciones); se endurece a search_path = '' con nombres calificados, el patrón que
--     este repo ya aplicó en 0003/0037.
--  V9 (menor) — La query de mantenimiento de 0068 solo encontraba anónimos SIN mediciones;
--     los huérfanos que deja la rama "email ya registrado" siempre tienen una. Query
--     corregida al pie.
--
-- Idempotente: create or replace function, drop policy if exists + create policy,
-- revoke/grant (re-ejecutables), DO $$ duplicate_object para los checks.

-- ── 0) Helper endurecido: empleado ACTIVO, search_path vacío ───────────────────────────────
create or replace function private.app_es_empleado() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.empleados e where e.id = auth.uid() and e.activo
  );
$$;
revoke all on function private.app_es_empleado() from public, anon;
grant execute on function private.app_es_empleado() to authenticated;

-- ── 1) Aislamiento por origen y sede ────────────────────────────────────────────────────────
drop policy if exists mt_medicion_select on mt_medicion;
create policy mt_medicion_select on mt_medicion for select to authenticated
  using (
    cliente_id = (select auth.uid())
    or private.app_es_admin()
    or (private.app_es_empleado()
        and origen = 'taller'
        and sede in (select private.app_sedes()))
  );

drop policy if exists mt_medicion_real_select on mt_medicion_real;
create policy mt_medicion_real_select on mt_medicion_real for select to authenticated
  using (
    private.app_es_admin()
    or exists (
      select 1 from mt_medicion m
      where m.id = medicion_id
        and (m.cliente_id = (select auth.uid())
             or (private.app_es_empleado()
                 and m.origen = 'taller'
                 and m.sede in (select private.app_sedes())))
    )
  );

-- El insert de la real también respeta sede (antes bastaba ser empleado).
drop policy if exists mt_medicion_real_insert on mt_medicion_real;
create policy mt_medicion_real_insert on mt_medicion_real for insert to authenticated
  with check (
    tomada_por = (select auth.uid())
    and exists (
      select 1 from mt_medicion m
      where m.id = medicion_id
        and m.origen = 'taller'
        and (private.app_es_admin()
             or (private.app_es_empleado() and m.sede in (select private.app_sedes())))
    )
  );

drop policy if exists mt_consentimiento_select on mt_consentimiento;
create policy mt_consentimiento_select on mt_consentimiento for select to authenticated
  using (private.app_es_admin()
         or (private.app_es_empleado() and sede in (select private.app_sedes())));

drop policy if exists mt_consentimiento_insert on mt_consentimiento;
create policy mt_consentimiento_insert on mt_consentimiento for insert to authenticated
  with check (registrado_por = (select auth.uid())
              and (private.app_es_admin()
                   or (private.app_es_empleado() and sede in (select private.app_sedes()))));

drop policy if exists mt_medicion_imagen_select on mt_medicion_imagen;
create policy mt_medicion_imagen_select on mt_medicion_imagen for select to authenticated
  using (
    private.app_es_admin()
    or exists (
      select 1 from mt_medicion m
      where m.id = medicion_id
        and private.app_es_empleado()
        and m.sede in (select private.app_sedes())
    )
  );

drop policy if exists mt_medicion_imagen_insert on mt_medicion_imagen;
create policy mt_medicion_imagen_insert on mt_medicion_imagen for insert to authenticated
  with check (
    exists (
      select 1 from mt_medicion m
      where m.id = medicion_id
        and m.origen = 'taller'
        and (private.app_es_admin()
             or (private.app_es_empleado() and m.sede in (select private.app_sedes())))
    )
  );

-- ── 2) Timestamps solo por default (cierra la evasión del tope 20/día) ─────────────────────
revoke insert on mt_medicion from authenticated;
grant insert (cliente_id, cliente_nombre, cliente_dni, motor, version_calibracion,
              entrada, medidas, confianza, vector_rasgos, origen, sede)
  on mt_medicion to authenticated;

revoke insert, update on mt_medicion_real from authenticated;
grant insert (medicion_id, tomada_por, medidas, observacion) on mt_medicion_real to authenticated;
grant update (medidas, observacion) on mt_medicion_real to authenticated;

revoke insert on mt_consentimiento from authenticated;
grant insert (nombre, dni, texto_version, sede, registrado_por) on mt_consentimiento to authenticated;

revoke insert on mt_medicion_imagen from authenticated;
-- borrar_despues_de queda SIEMPRE en su default (+24 meses): ni el sastre lo elige.
grant insert (medicion_id, storage_path, vista, consentimiento_id) on mt_medicion_imagen to authenticated;

-- ── 3) Tamaños acotados (un uid no puede llenar los 500 MB del free tier) ──────────────────
do $$ begin
  alter table mt_medicion add constraint mt_medicion_tamanos_check check (
    pg_column_size(entrada) <= 2048
    and pg_column_size(medidas) <= 2048
    and pg_column_size(confianza) <= 2048
    and (vector_rasgos is null or pg_column_size(vector_rasgos) <= 65536)
    and (cliente_nombre is null or char_length(cliente_nombre) <= 120)
    and (cliente_dni is null or cliente_dni ~ '^[0-9]{8}$')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table mt_medicion_real add constraint mt_medicion_real_tamanos_check check (
    pg_column_size(medidas) <= 2048
    and (observacion is null or char_length(observacion) <= 500)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table mt_consentimiento add constraint mt_consentimiento_tamanos_check check (
    char_length(nombre) <= 120 and dni ~ '^[0-9]{8}$' and char_length(texto_version) <= 40
  );
exception when duplicate_object then null; end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr tras aplicar):
--   select policyname from pg_policies where tablename='mt_medicion';  -- select + 2 insert
--   select column_name from information_schema.column_privileges
--     where table_name='mt_medicion' and grantee='authenticated' and privilege_type='INSERT'
--     order by 1;  -- 11 columnas, SIN creada_en ni id
--   -- Como empleado NO admin de sede ST: select de mt_medicion no devuelve filas de sede LB.
--
-- Mantenimiento corregido (reemplaza al de 0068 §pie): anónimos de +90 días, tengan o no
-- mediciones (sus filas web son descartables: nunca convirtieron a cuenta). Con service role:
--   -- delete from mt_medicion m using auth.users u
--   --   where m.cliente_id = u.id and u.is_anonymous and u.created_at < now() - interval '90 days';
--   -- delete from auth.users where is_anonymous and created_at < now() - interval '90 days';
-- ═══════════════════════════════════════════════════════════════════════════════════════════
