-- 0040_estadisticas_rpc.sql — S20: RPCs de agregación para el panel gerencial /estadisticas.
-- Cruzan datos ya existentes (caja, pedidos, pipeline, incidencias, FR-01, inventario, compras)
-- con rango de fechas. TODAS security invoker: la RLS por sede aplica sola (admin ve todo, un
-- encargado ve su sede), sin agregar funciones SECURITY DEFINER nuevas (0028/0029). El core
-- (@scilb/core estadisticas.ts) arma las series/porcentajes; aquí solo se suma en la BD.
-- Idempotente (create or replace).

-- Ingresos/egresos de caja por día.
create or replace function est_ingresos(p_desde date, p_hasta date)
  returns table (fecha date, ingresos numeric, egresos numeric)
  language sql security invoker set search_path = public stable
as $$
  select m.fecha,
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'egreso'), 0)
  from caja_movimientos m
  where m.fecha between p_desde and p_hasta
  group by m.fecha
  order by m.fecha;
$$;

-- Ingresos de caja por categoría (cobro, garantía, gasto…).
create or replace function est_ingresos_categoria(p_desde date, p_hasta date)
  returns table (tipo text, categoria text, total numeric)
  language sql security invoker set search_path = public stable
as $$
  select m.tipo, m.categoria, coalesce(sum(m.monto), 0)
  from caja_movimientos m
  where m.fecha between p_desde and p_hasta
  group by m.tipo, m.categoria
  order by 3 desc;
$$;

-- Pedidos por tipo (alquiler/venta/servicio) y estado.
create or replace function est_pedidos(p_desde date, p_hasta date)
  returns table (tipo text, estado text, n bigint, total numeric)
  language sql security invoker set search_path = public stable
as $$
  select p.tipo, p.estado, count(*), coalesce(sum(p.total), 0)
  from pedidos p
  where p.fecha between p_desde and p_hasta
  group by p.tipo, p.estado
  order by 4 desc;
$$;

-- Productividad del pipeline: puntos y acciones por operario (fecha es timestamptz).
create or replace function est_productividad(p_desde date, p_hasta date)
  returns table (empleado_id uuid, puntos numeric, acciones bigint)
  language sql security invoker set search_path = public stable
as $$
  select pp.empleado_id, coalesce(sum(pp.puntos), 0), count(*)
  from pipeline_puntos pp
  where pp.fecha::date between p_desde and p_hasta
  group by pp.empleado_id
  order by 2 desc;
$$;

-- Incidencias por sede y nivel + penalidad acumulada.
create or replace function est_incidencias(p_desde date, p_hasta date)
  returns table (sede_cod text, nivel text, n bigint, penalidad numeric)
  language sql security invoker set search_path = public stable
as $$
  select i.sede_cod, i.nivel, count(*), coalesce(sum(i.puntos_penalidad), 0)
  from incidencias i
  where i.fecha between p_desde and p_hasta
  group by i.sede_cod, i.nivel
  order by 3 desc;
$$;

-- Cumplimiento del FR-01 por sede: reportes, actividades hechas/total y puntaje promedio.
create or replace function est_fr01(p_desde date, p_hasta date)
  returns table (sede_cod text, reportes bigint, act_total bigint, act_done bigint, puntaje_prom numeric)
  language sql security invoker set search_path = public stable
as $$
  select r.sede_cod,
         count(*),
         coalesce(sum(r.act_total), 0),
         coalesce(sum(r.act_done), 0),
         round(avg(r.puntaje) filter (where r.evaluado), 1)
  from reportes r
  where r.fecha between p_desde and p_hasta
  group by r.sede_cod
  order by 1;
$$;

-- Evolución de compras de material por día (S16).
create or replace function est_compras(p_desde date, p_hasta date)
  returns table (fecha date, estado text, n bigint, total numeric)
  language sql security invoker set search_path = public stable
as $$
  select c.fecha, c.estado, count(*), coalesce(sum(c.total), 0)
  from compras c
  where c.fecha between p_desde and p_hasta
  group by c.fecha, c.estado
  order by c.fecha;
$$;

-- Ocupación del inventario de alquiler/venta por estado (foto actual, sin rango).
create or replace function est_inventario()
  returns table (estado text, n bigint, valor numeric)
  language sql security invoker set search_path = public stable
as $$
  select a.estado, count(*), coalesce(sum(a.precio_base), 0)
  from inventario_activo a
  group by a.estado
  order by 2 desc;
$$;

revoke execute on function est_ingresos(date, date)           from public;
revoke execute on function est_ingresos_categoria(date, date) from public;
revoke execute on function est_pedidos(date, date)            from public;
revoke execute on function est_productividad(date, date)      from public;
revoke execute on function est_incidencias(date, date)        from public;
revoke execute on function est_fr01(date, date)               from public;
revoke execute on function est_compras(date, date)            from public;
revoke execute on function est_inventario()                   from public;

grant execute on function est_ingresos(date, date)            to authenticated;
grant execute on function est_ingresos_categoria(date, date)  to authenticated;
grant execute on function est_pedidos(date, date)             to authenticated;
grant execute on function est_productividad(date, date)       to authenticated;
grant execute on function est_incidencias(date, date)         to authenticated;
grant execute on function est_fr01(date, date)                to authenticated;
grant execute on function est_compras(date, date)             to authenticated;
grant execute on function est_inventario()                    to authenticated;
