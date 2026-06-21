-- 0006_pipeline_rls.sql — RLS del pipeline de lavandería (Fase 3).
-- Regla de negocio confirmada por el responsable: la lavandería es un flujo CENTRAL.
--   · admin / dueño            → ven todo (como en todas las tablas).
--   · encargado_almacen /      → ven TODO el pipeline (operan el flujo central).
--     confeccionista
--   · encargado_tienda /       → ven solo lo de SU sede.
--     ventas_junior(_2)
--
-- Patrón: app_es_admin() OR app_es_almacen() OR <filtro por sede>. FOR ALL (lectura y
-- escritura con el mismo filtro de sede); las reglas finas de quién puede escribir qué
-- las aplican las server actions. Las hijas heredan la visibilidad del padre por FK.

-- ── helper: ¿el usuario opera el pipeline central? ────────────────────────────
create or replace function app_es_almacen()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.empleados e
    where e.id = auth.uid() and e.rol in ('encargado_almacen','confeccionista')
  );
$$;
-- no exponer la función a anónimos (cierra el aviso del linter); authenticated la usa en las policies
revoke execute on function app_es_almacen() from public;
grant execute on function app_es_almacen() to authenticated;

-- ── prenda_pasada: reemplaza pasada_rw (antes solo sede) para incluir al almacén ──
drop policy if exists pasada_rw on prenda_pasada;
create policy pasada_rw on prenda_pasada for all
  using      (app_es_admin() or app_es_almacen() or sede_origen_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_origen_cod in (select app_sedes()));

-- ── prenda_historial: hereda del padre prenda_pasada ─────────────────────────
drop policy if exists hist_rw on prenda_historial;
create policy hist_rw on prenda_historial for all
  using (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from prenda_pasada p
      where p.id = prenda_historial.pasada_id and p.sede_origen_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from prenda_pasada p
      where p.id = prenda_historial.pasada_id and p.sede_origen_cod in (select app_sedes())
    )
  );

-- ── pipeline_puntos: almacén/admin todo; cada empleado sus propios puntos; o por padre ──
drop policy if exists puntos_rw on pipeline_puntos;
create policy puntos_rw on pipeline_puntos for all
  using (
    app_es_admin() or app_es_almacen() or empleado_id = auth.uid() or exists (
      select 1 from prenda_pasada p
      where p.id = pipeline_puntos.pasada_id and p.sede_origen_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or app_es_almacen() or empleado_id = auth.uid() or exists (
      select 1 from prenda_pasada p
      where p.id = pipeline_puntos.pasada_id and p.sede_origen_cod in (select app_sedes())
    )
  );

-- ── envios_prendas: por sede de destino (la tienda ve lo que le llega) ────────
drop policy if exists envios_rw on envios_prendas;
create policy envios_rw on envios_prendas for all
  using      (app_es_admin() or app_es_almacen() or sede_destino_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_destino_cod in (select app_sedes()));

-- ── prenda_calificacion: por padre (prenda) o por envío de destino ───────────
drop policy if exists calif_rw on prenda_calificacion;
create policy calif_rw on prenda_calificacion for all
  using (
    app_es_admin() or app_es_almacen()
    or exists (select 1 from prenda_pasada p where p.id = prenda_calificacion.pasada_id and p.sede_origen_cod in (select app_sedes()))
    or exists (select 1 from envios_prendas e where e.id = prenda_calificacion.envio_id and e.sede_destino_cod in (select app_sedes()))
  )
  with check (
    app_es_admin() or app_es_almacen()
    or exists (select 1 from prenda_pasada p where p.id = prenda_calificacion.pasada_id and p.sede_origen_cod in (select app_sedes()))
    or exists (select 1 from envios_prendas e where e.id = prenda_calificacion.envio_id and e.sede_destino_cod in (select app_sedes()))
  );

-- ── listas_lavanderia: por sede ──────────────────────────────────────────────
drop policy if exists listas_rw on listas_lavanderia;
create policy listas_rw on listas_lavanderia for all
  using      (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()));

-- ── lista_items: hereda de la lista ──────────────────────────────────────────
drop policy if exists lista_items_rw on lista_items;
create policy lista_items_rw on lista_items for all
  using (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from listas_lavanderia l where l.id = lista_items.lista_id and l.sede_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from listas_lavanderia l where l.id = lista_items.lista_id and l.sede_cod in (select app_sedes())
    )
  );

-- ── accesorios_log: por sede de origen ───────────────────────────────────────
drop policy if exists acc_log_rw on accesorios_log;
create policy acc_log_rw on accesorios_log for all
  using      (app_es_admin() or app_es_almacen() or sede_origen_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_origen_cod in (select app_sedes()));

-- ── envios_accesorios: por sede de destino ───────────────────────────────────
drop policy if exists envios_acc_rw on envios_accesorios;
create policy envios_acc_rw on envios_accesorios for all
  using      (app_es_admin() or app_es_almacen() or sede_destino_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_destino_cod in (select app_sedes()));

-- ── envio_accesorios_items: hereda del envío ─────────────────────────────────
drop policy if exists envio_acc_items_rw on envio_accesorios_items;
create policy envio_acc_items_rw on envio_accesorios_items for all
  using (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from envios_accesorios e where e.id = envio_accesorios_items.envio_id and e.sede_destino_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from envios_accesorios e where e.id = envio_accesorios_items.envio_id and e.sede_destino_cod in (select app_sedes())
    )
  );
