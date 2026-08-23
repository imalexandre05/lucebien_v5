-- 0067_aislamiento_datos_personas.sql — cierra tres agujeros del no-negociable 3 y hace que la
-- RLS respete la matriz de permisos que el administrador edita.
--
-- Spec: docs/superpowers/specs/permisos/SPEC-aislamiento-datos-personas.md
--
-- QUÉ ARREGLA
--
-- P-01  private.app_es_almacen() devuelve true para 'encargado_almacen' Y 'confeccionista'
--       (0006_pipeline_rls.sql:22-25). Correcto para el pipeline, que es para lo que se creó,
--       pero quedó en la policy de LECTURA de tres tablas de datos personales: pagos (0028:6),
--       asistencias (0025:14) y evaluaciones_valores (0057:48). Hoy una confeccionista lee el
--       sueldo de todo el equipo y ve quién puntuó a quién en Valores 360°.
--
-- P-02  evaluacion_componentes() es security definer, concedida a authenticated, y no comprueba
--       quién la llama (0032, 0044, 0053): cualquier usuario pide los componentes de evaluación
--       de cualquier otro.
--
-- P-03  empleado_tiendas tiene RLS activa y sólo policy de select (0050): sus insert fallan con
--       42501 y sus delete quitan 0 filas, en silencio.
--
-- IDEMPOTENTE: se puede reaplicar sin efecto. Los `drop policy if exists` + `create policy` y los
-- `create or replace function` son naturalmente repetibles; el renombrado de P-02 va detrás de un
-- guard que comprueba si ya se hizo.
--
-- NO TOCA app_es_almacen(): sigue igual para el pipeline, que es su uso legítimo.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) El helper nuevo: quién puede ver datos de OTRAS personas
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Lee `permisos_modulos` (0045), la misma tabla que edita /configuracion/permisos, con el módulo
-- 'datos_personas' y la acción 'ver'.
--
-- Seguro por defecto: sin ninguna fila configurada, sólo pasan admin y dueno. Nadie hereda acceso
-- por accidente. admin/dueno quedan fuera de la matriz a propósito — quitarles el acceso a sí
-- mismos dejaría el sistema sin nadie que pueda arreglarlo.
--
-- coalesce(rol_cod, rol) es el mismo criterio que usa puede() en packages/core/src/permisos.ts,
-- así que la RLS y la interfaz coinciden en vez de contradecirse.

create or replace function private.app_ve_datos_personas()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.empleados e
    left join public.permisos_modulos p
      on  p.rol    = coalesce(e.rol_cod, e.rol)
      and p.modulo = 'datos_personas'
    where e.id = auth.uid()
      and (
        e.rol in ('admin', 'dueno')
        or 'ver' = any(coalesce(p.acciones, '{}'::text[]))
      )
  );
$$;

revoke execute on function private.app_ve_datos_personas() from public, anon;
grant  execute on function private.app_ve_datos_personas() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) P-01 — las tres policies de lectura
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Sólo cambia el segundo término: app_es_almacen() → app_ve_datos_personas(). El administrador
-- sigue pasando y cada quien sigue viendo lo suyo.
--
-- Los helpers van con el prefijo `private.`: se movieron de schema en 0037 y las migraciones
-- anteriores los escriben sin prefijo sólo porque son previas a ese cambio.

drop policy if exists pago_select on pagos;
create policy pago_select on pagos for select
  using (private.app_es_admin() or private.app_ve_datos_personas() or empleado_id = auth.uid());

drop policy if exists asist_select on asistencias;
create policy asist_select on asistencias for select
  using (private.app_es_admin() or private.app_ve_datos_personas() or empleado_id = auth.uid());

-- En Valores 360° el evaluador ve lo que envió (para no re-evaluar a quien ya evaluó este mes) y
-- el evaluado ve lo suyo, pero SIN saber quién lo puntuó — eso lo resuelve la pantalla, que nunca
-- muestra evaluador_id. Lo que se cierra acá es que un tercero lea la tabla entera.
drop policy if exists eval_valores_select on evaluaciones_valores;
create policy eval_valores_select on evaluaciones_valores for select
  using (
    private.app_es_admin()
    or private.app_ve_datos_personas()
    or evaluado_id  = auth.uid()
    or evaluador_id = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) P-02 — portero delante de evaluacion_componentes, sin reescribir su cuerpo
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Se renombra la función actual a private.evaluacion_componentes_datos con `alter function`, así
-- su cuerpo (55 líneas de SQL agregando reportes, actividades, incidencias, puntos, valores y
-- extras) NO se transcribe y no hay riesgo de copiarlo mal. Después se crea con el nombre y la
-- firma originales un envoltorio que valida y delega: ningún repo ni pantalla se entera.

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'evaluacion_componentes_datos'
  ) then
    alter function public.evaluacion_componentes(uuid, date, date)
      rename to evaluacion_componentes_datos;
    alter function public.evaluacion_componentes_datos(uuid, date, date)
      set schema private;
  end if;
end $$;

revoke execute on function private.evaluacion_componentes_datos(uuid, date, date) from public, anon, authenticated;

create or replace function public.evaluacion_componentes(p_empleado uuid, p_desde date, p_hasta date)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  -- El administrador consulta a cualquiera; cualquier otro, sólo a sí mismo.
  if not (private.app_es_admin() or p_empleado = auth.uid()) then
    raise exception 'PERMISO:no puede consultar los componentes de evaluación de otra persona';
  end if;
  return private.evaluacion_componentes_datos(p_empleado, p_desde, p_hasta);
end;
$$;

revoke execute on function public.evaluacion_componentes(uuid, date, date) from public, anon;
grant  execute on function public.evaluacion_componentes(uuid, date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) P-03 — empleado_tiendas necesita policy de escritura, no sólo de lectura
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Con RLS activa y sólo select, todo insert devuelve 42501 y todo delete afecta 0 filas sin error.
-- La RPC empleado_actualizar (0050) escribe esta tabla como security invoker, así que hoy falla
-- en silencio.

drop policy if exists emp_tiendas_admin on empleado_tiendas;
create policy emp_tiendas_admin on empleado_tiendas for all
  using      (private.app_es_admin())
  with check (private.app_es_admin());

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) Semilla del módulo nuevo en la matriz de permisos
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Las filas se crean vacías (acciones = '{}') para los cinco roles base que NO son admin/dueno,
-- de modo que el módulo aparezca en /configuracion/permisos y el administrador pueda repartirlo.
-- Vacío = no ve datos de otros, que es el estado seguro y el que corresponde hoy.
--
-- El `on conflict do nothing` respeta cualquier configuración que ya exista.

insert into permisos_modulos (rol, modulo, acciones) values
  ('encargado_tienda',  'datos_personas', '{}'),
  ('encargado_almacen', 'datos_personas', '{}'),
  ('confeccionista',    'datos_personas', '{}'),
  ('ventas_junior',     'datos_personas', '{}'),
  ('ventas_junior_2',   'datos_personas', '{}')
on conflict (rol, modulo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación manual (ejecutar a mano, no forma parte de la migración)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Con una sesión de rol 'confeccionista':
--   select count(*) from pagos;                  -- sólo los propios
--   select count(*) from asistencias;            -- sólo las propias
--   select count(*) from evaluaciones_valores;   -- sólo donde es evaluado o evaluador
--   select evaluacion_componentes('<uuid ajeno>', '2026-08-01', '2026-08-31');
--                                                -- debe fallar con PERMISO:...
--   select evaluacion_componentes(auth.uid(), '2026-08-01', '2026-08-31');
--                                                -- debe funcionar
--
-- Con el administrador: los cuatro devuelven todo, igual que antes.
--
-- Y que el envoltorio quedó bien armado:
--   select prokind, prolang::regtype from pg_proc where proname = 'evaluacion_componentes';
--   select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'private' and p.proname = 'evaluacion_componentes_datos';
