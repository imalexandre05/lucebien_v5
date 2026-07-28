-- 0055_inventario_despiece_tipos_estados.sql — Fase 7 del plan de perfeccionamiento (inventario:
-- despiece, tipos y estados). Migración idempotente (add column/create if not exists, create or
-- replace en funciones/vista, drop+add en constraints, on conflict do nothing en seeds).
--
-- Verificado contra la base viva (scilb) antes de escribir esto: inventario_activo tiene HOY solo
-- 4 filas de seed (tipos "SC"/"TN"), y las migraciones 0050-0054 (Fases 1-6) TODAVÍA NO están
-- aplicadas ahí (no hay SUPABASE_DB_URL en este entorno para aplicarlas desde este worktree). Esta
-- migración NO depende de ninguna de esas — solo de 0001 (inventario_activo) y 0047 (atributos/
-- publicable), que sí están aplicadas. Aplíquese en orden 0050→0051→0052→0053→0054→0055 cuando
-- haya acceso a la base.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) DESPIECE SACO/PANTALÓN — auto-referencia, NO tabla de composición.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- pieza: 'unica' es el default para el 99% de las prendas (nunca se despiezan). 'completo' marca
-- al padre YA despiezado (sigue siendo una unidad rentable del set completo). 'saco'/'pantalon'
-- son las piezas hijas. La columna y su check se agregan juntas (if not exists cubre ambas: si la
-- columna ya existe de una corrida anterior, esta sentencia entera es un no-op).
alter table inventario_activo
  add column if not exists activo_padre_id uuid references inventario_activo(id) on delete set null,
  add column if not exists pieza text not null default 'unica'
    check (pieza in ('unica', 'completo', 'saco', 'pantalon'));

create index if not exists idx_inventario_activo_padre on inventario_activo(activo_padre_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) ESTADOS DEL CICLO COMPLETO — reemplaza 'en_lavanderia' (solo lavado) por 'en_pipeline' (todo
--    el pipeline: codificación, compostura, lavado...). Backfill ANTES del check constraint para
--    no romper filas existentes (la base viva tiene al menos 1 fila con 'en_lavanderia', del seed).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
update inventario_activo set estado = 'en_pipeline' where estado = 'en_lavanderia';

alter table inventario_activo drop constraint if exists inventario_activo_estado_check;
alter table inventario_activo add constraint inventario_activo_estado_check
  check (estado in ('disponible', 'alquilado', 'vendido', 'en_pipeline', 'codificando',
                     'en_compostura', 'en_almacen', 'baja'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) inventario_familia(p_id) — {self} ∪ {padre} ∪ {hijos directos}. A propósito NO incluye al
--    hermano (ver packages/core/src/inventario.ts::familiaDeActivo, misma regla, testeada ahí).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function inventario_familia(p_id uuid)
  returns setof inventario_activo
  language sql stable security invoker set search_path = public
as $$
  select a.* from inventario_activo a
  where a.id = p_id
     or a.id = (select ia.activo_padre_id from inventario_activo ia where ia.id = p_id)
     or a.activo_padre_id = p_id;
$$;
revoke execute on function inventario_familia(uuid) from public;
grant execute on function inventario_familia(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) v_activo_disponible — para que el selector de activos muestre las piezas bloqueadas en gris
--    con "ocupado por AST-501" en vez de esconderlas. security_invoker: respeta la RLS de
--    inventario_activo del usuario que consulta (sede propia o admin), no la del dueño de la vista.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace view v_activo_disponible
  with (security_invoker = true) as
select
  a.*,
  bloq.codigo as bloqueado_por_codigo,
  bloq.estado as bloqueado_por_estado,
  (bloq.id is not null) as bloqueado
from inventario_activo a
left join lateral (
  select f.id, f.codigo, f.estado
  from inventario_activo f
  where f.id <> a.id
    and f.estado in ('alquilado', 'vendido')
    and (f.id = a.activo_padre_id or f.activo_padre_id = a.id)  -- padre o hijo directo, NUNCA hermano
  order by f.estado
  limit 1
) bloq on true;

grant select on v_activo_disponible to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) inventario_despiece(p_activo_id) — RPC atómico e idempotente. 'ST-501' → 'AST-501' (saco) +
--    'BST-501' (pantalón): el código de la pieza es SIEMPRE 'A'/'B' + el código del padre (por
--    eso el regex de packages/core/src/inventario.ts subió a {2,4} letras). Reparto de precio
--    desde config.despiece_pct_saco (default 0.6, NO confirmado — ver docs/pendientes-negocio.md).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function inventario_despiece(p_activo_id uuid)
  returns table (id uuid, codigo text, pieza text)
  language plpgsql security invoker set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_padre    inventario_activo;
  v_pct_saco numeric;
  v_saco_id  uuid;
  v_pant_id  uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  select * into v_padre from inventario_activo where id = p_activo_id for update;
  if not found then raise exception 'Activo no encontrado'; end if;
  if v_padre.pieza not in ('unica', 'completo') then
    raise exception 'Solo se puede despiezar una pieza "unica" o "completo" (esta es "%")', v_padre.pieza;
  end if;

  -- Idempotente: si ya existen las hijas (llamada repetida), devolverlas tal cual sin duplicar.
  if exists (select 1 from inventario_activo where activo_padre_id = p_activo_id) then
    return query
      select h.id, h.codigo, h.pieza from inventario_activo h
      where h.activo_padre_id = p_activo_id order by h.pieza;
    return;
  end if;

  select valor::numeric into v_pct_saco from config where clave = 'despiece_pct_saco';
  if v_pct_saco is null then v_pct_saco := 0.6; end if;

  insert into inventario_activo
    (codigo, tipo, talla, color, sede_cod, estado, pieza, activo_padre_id,
     precio_base, precio_alquiler, precio_venta, usos_acumulados, atributos)
  values
    ('A' || v_padre.codigo, 'saco', v_padre.talla, v_padre.color, v_padre.sede_cod, v_padre.estado,
     'saco', v_padre.id,
     round(v_padre.precio_base * v_pct_saco, 2), round(v_padre.precio_alquiler * v_pct_saco, 2),
     round(v_padre.precio_venta * v_pct_saco, 2), v_padre.usos_acumulados, v_padre.atributos)
  returning inventario_activo.id into v_saco_id;

  insert into inventario_activo
    (codigo, tipo, talla, color, sede_cod, estado, pieza, activo_padre_id,
     precio_base, precio_alquiler, precio_venta, usos_acumulados, atributos)
  values
    ('B' || v_padre.codigo, 'pantalon', v_padre.talla, v_padre.color, v_padre.sede_cod, v_padre.estado,
     'pantalon', v_padre.id,
     round(v_padre.precio_base * (1 - v_pct_saco), 2), round(v_padre.precio_alquiler * (1 - v_pct_saco), 2),
     round(v_padre.precio_venta * (1 - v_pct_saco), 2), v_padre.usos_acumulados, v_padre.atributos)
  returning inventario_activo.id into v_pant_id;

  update inventario_activo set pieza = 'completo' where id = p_activo_id;

  return query
    select h.id, h.codigo, h.pieza from inventario_activo h
    where h.id in (v_saco_id, v_pant_id) order by h.pieza;
end;
$$;
revoke execute on function inventario_despiece(uuid) from public;
grant execute on function inventario_despiece(uuid) to authenticated;

insert into config (clave, valor) values
  ('despiece_pct_saco', '0.6')  -- DEFAULT NO CONFIRMADO por el dueño — ver docs/pendientes-negocio.md
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) producto_tipos — catálogo de tipos de producto (hoy `inventario_activo.tipo` es texto libre;
--    esto solo lo alimenta con sugerencias, no lo restringe: `tipo` sigue siendo texto libre para
--    no romper datos existentes). `prefijo` es el código de 2-4 letras usado en formatCodigo/
--    parseCodigo (packages/core/src/inventario.ts) — separado de `cod` (clave estable del
--    catálogo) para poder reordenar/renombrar el catálogo sin tocar códigos ya emitidos.
--    `atributos_sugeridos` es un array de claves (jsonb) que el modal de inventario ofrece
--    pre-cargar en `inventario_activo.atributos` — NO fuerza ni valida nada, solo sugiere.
--
--    Sembrado con los tipos reales que pide el plan (terno/saco/pantalón/camisa/corbata/chaleco/
--    pañuelo/zapatos/correa) — SE VERIFICÓ CONTRA LA BASE VIVA antes de escribir esto (lección de
--    la Fase 5, que se topó con un catálogo de extras ya sembrado y distinto al del repo): hoy
--    inventario_activo NO tiene un catálogo real de tipos que preservar, solo 4 filas de datos de
--    seed/demo con tipos "SC"/"TN" (coinciden con los prefijos 'SC' y 'TN' de abajo) — no hay
--    nada que este seed pise o duplique.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists producto_tipos (
  cod                  text primary key,
  nombre               text not null,
  prefijo              text not null,
  atributos_sugeridos  jsonb not null default '[]'::jsonb,
  activo               boolean not null default true,
  created_at           timestamptz not null default now()
);

alter table producto_tipos enable row level security;

drop policy if exists producto_tipos_select on producto_tipos;
create policy producto_tipos_select on producto_tipos for select
  using (auth.uid() is not null);
drop policy if exists producto_tipos_admin on producto_tipos;
create policy producto_tipos_admin on producto_tipos for all
  using (private.app_es_admin())
  with check (private.app_es_admin());

insert into producto_tipos (cod, nombre, prefijo, atributos_sugeridos) values
  ('terno',    'Terno',    'TN', '["tela","forro","cuello","manga"]'::jsonb),
  ('saco',     'Saco',     'SC', '["tela","forro","cuello"]'::jsonb),
  ('pantalon', 'Pantalón', 'PT', '["tela","cintura","largo"]'::jsonb),
  ('camisa',   'Camisa',   'CM', '["tela","cuello","manga"]'::jsonb),
  ('corbata',  'Corbata',  'CB', '["ancho","material"]'::jsonb),
  ('chaleco',  'Chaleco',  'CH', '["tela","forro"]'::jsonb),
  ('panuelo',  'Pañuelo',  'PN', '["material","estampado"]'::jsonb),
  ('zapatos',  'Zapatos',  'ZP', '["material","numero"]'::jsonb),
  ('correa',   'Correa',   'CR', '["material","hebilla"]'::jsonb)
on conflict (cod) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7) pipeline_enviar — se amplía (create or replace, mismo cuerpo de 0009 + el bloque nuevo al
--    final) para que un activo vinculado que sale del pipeline hacia una tienda quede
--    'disponible' automáticamente. Guard explícito: SOLO pisa un estado "de proceso"
--    (codificando/en_pipeline/en_compostura) — nunca alquilado/vendido/baja, que pueden coexistir
--    con una pasada de pipeline por otras razones (ej. reparación de un activo ya vendido).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pipeline_enviar(p_id uuid, p_sede text)
  returns void language plpgsql security invoker set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_etapa text; v_envio uuid; v_activo_id uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select etapa, activo_id into v_etapa, v_activo_id from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'listo' then raise exception 'Solo se envían prendas listas'; end if;

  insert into envios_prendas (sede_destino_cod, fecha, responsable_id, estado)
    values (p_sede, now(), v_actor, 'enviado') returning id into v_envio;
  update prenda_pasada set etapa = 'enviado', envio_id = v_envio, fecha_actualizado = now() where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, 'listo', 'enviado', v_actor, 'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede);

  -- Fase 7 tarea 2: el activo vinculado sale del pipeline y queda disponible para la venta/alquiler.
  if v_activo_id is not null then
    update inventario_activo
      set estado = 'disponible'
      where id = v_activo_id and estado in ('codificando', 'en_pipeline', 'en_compostura');
  end if;
end;
$$;
revoke execute on function pipeline_enviar(uuid, text) from public;
grant execute on function pipeline_enviar(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr manualmente tras aplicar, contra un activo de prueba QA-F7-*):
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   -- 1) Despiece + idempotencia:
--   select * from inventario_despiece('<id-terno>');   -- crea ATN.../BTN..., padre → 'completo'
--   select * from inventario_despiece('<id-terno>');   -- 2da vez: mismas filas, sin duplicar
--   select count(*) from inventario_activo where activo_padre_id = '<id-terno>';  -- esperado: 2
--
--   -- 2) La asimetría (lo más importante de probar):
--   update inventario_activo set estado = 'alquilado' where codigo = 'ATN-042'; -- alquila el saco
--   select bloqueado, bloqueado_por_codigo from v_activo_disponible where codigo = 'TN-042';  -- true, 'ATN-042'
--   select bloqueado, bloqueado_por_codigo from v_activo_disponible where codigo = 'BTN-042'; -- false, null
--
--   -- 3) Backfill de estado:
--   select count(*) from inventario_activo where estado = 'en_lavanderia';  -- esperado: 0
--
--   -- 4) Catálogo de tipos:
--   select cod, nombre, prefijo from producto_tipos order by nombre;  -- 9 filas
