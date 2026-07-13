-- 0038_actividades_descuento_layout_rpc.sql — paridad del panel de administración del viejo.
-- 1) actividades_config.descuento: columna que el viejo guardaba y mostraba en "Gestionar
--    Actividades" (routes/actividades.js). Es dato configurable; el viejo NO lo aplicaba en
--    el puntaje ("ignoramos descuentos para el ranking", admin.js:542) y aquí tampoco.
-- 2) layout_guardar: guardado atómico del editor de layout (bulk replace por sede, espejo
--    de PUT /api/layout/bulk del viejo). security invoker → la RLS layout_admin_write (0023)
--    exige admin para el delete+insert; todo corre en una sola transacción.

alter table actividades_config add column if not exists descuento numeric not null default 0;

create or replace function layout_guardar(p_sede text, p_zonas jsonb)
returns integer language plpgsql security invoker set search_path = public
as $$
declare
  v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from sedes where cod = p_sede) then
    raise exception 'Sede % no existe', p_sede;
  end if;

  delete from layout_zonas where sede_cod = p_sede;

  insert into layout_zonas
    (sede_cod, cod, nombre, turno, tipo, peso, pos_x, pos_y, ancho, alto,
     color, forma, orden, nivel, sobre_cod)
  select
    p_sede,
    coalesce(z->>'cod', 'Z' || (ord - 1)::text),
    coalesce(z->>'nombre', ''),
    coalesce(z->>'turno', 'ambos'),
    coalesce(z->>'tipo', 'mueble'),
    coalesce((z->>'peso')::numeric, 1),
    coalesce((z->>'pos_x')::numeric, 0),
    coalesce((z->>'pos_y')::numeric, 0),
    coalesce((z->>'ancho')::numeric, 60),
    coalesce((z->>'alto')::numeric, 40),
    coalesce(z->>'color', '#3b82f6'),
    coalesce(z->>'forma', 'rect'),
    (ord - 1)::integer,
    coalesce(z->>'nivel', 'piso'),
    coalesce(z->>'sobre_cod', '')
  from jsonb_array_elements(coalesce(p_zonas, '[]'::jsonb)) with ordinality as t(z, ord);

  get diagnostics v_n = row_count;
  return v_n;
end $$;
