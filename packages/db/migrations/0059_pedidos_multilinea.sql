-- 0059_pedidos_multilinea.sql — Fase 8 del plan de perfeccionamiento (Pedidos: modelo multi-línea).
--
-- Decisión de diseño (ya tomada, no se reabre aquí): UN SOLO pedido por visita, con el TIPO a
-- nivel de LÍNEA (pedido_items.tipo) y el tipo de cabecera (pedidos.tipo) DERIVADO — 'mixto'
-- cuando las líneas activas cubren más de un tipo. Razón: el cliente paga una vez y deja una sola
-- garantía; con dos pedidos, un adelanto quedaría ambiguo y la garantía no tendría dónde colgarse.
--
-- Verificado contra la base viva (scilb) antes de escribir esto: 2 filas en `pedidos`, 2 en
-- `pedido_items` (una por pedido, `precio` es la única columna de monto que tienen hoy), 3 en
-- `clientes`. Ninguna usa el valor 'anulado' (ya usan 'abierto'), pero el backfill de abajo lo
-- cubre igual por si acaso — es gratis y lo pide el plan explícitamente.
--
-- Migración idempotente: add column if not exists, drop+add constraint, create or replace.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) pedido_items — de "una fila = un pedido" a líneas reales.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table pedido_items
  add column if not exists tipo                 text,
  add column if not exists cantidad              integer not null default 1,
  add column if not exists precio_unitario       numeric(10,2) not null default 0,
  add column if not exists precio_lista          numeric(10,2),
  add column if not exists es_cortesia           boolean not null default false,
  add column if not exists estado                text not null default 'activo',
  add column if not exists notas                 text not null default '',
  add column if not exists orden                 integer not null default 0,
  add column if not exists devuelto_at           timestamptz,
  -- Campos de confección que bajan de la cabecera (0048): un pedido puede llevar 2 ternos a
  -- medida con pruebas distintas, así que viven por LÍNEA de aquí en adelante. Las columnas
  -- homónimas de `pedidos` NO se tocan en esta migración (se preservan hasta la Fase 10, que las
  -- deja caer solo tras confirmar por grep que ningún .ts las sigue leyendo del lado cabecera).
  add column if not exists tela                  text,
  add column if not exists fecha_prueba          date,
  add column if not exists fecha_segunda_prueba  date,
  add column if not exists etapa_confeccion      text,
  add column if not exists created_at            timestamptz not null default now();

-- Backfill: tipo ← el de la cabecera (hoy 1 línea = 1 pedido, así que es exacto); precio_unitario
-- ← la única columna de monto que ya tenían (`precio`); estado derivado del estado del pedido
-- padre (si ya estaba cerrado/devuelto, la línea nace 'devuelto'; si cancelado, 'cancelado').
update pedido_items pi
set tipo = p.tipo,
    precio_unitario = coalesce(pi.precio, 0),
    precio_lista = coalesce(pi.precio, 0),
    cantidad = 1,
    estado = case
      when p.estado = 'cancelado' then 'cancelado'
      when p.estado in ('devuelto', 'cerrado') then 'devuelto'
      else 'activo'
    end,
    tela = p.tela,
    fecha_prueba = p.fecha_prueba,
    fecha_segunda_prueba = p.fecha_segunda_prueba,
    etapa_confeccion = p.etapa_confeccion
from pedidos p
where p.id = pi.pedido_id and pi.tipo is null;

-- 'venta'/'alquiler'/'servicio'/'confeccion' eran ya los únicos valores de `pedidos.tipo` (el
-- tipo Zod nunca tuvo 'mixto' hasta esta fase) — no debería quedar ninguna fila sin backfillear,
-- pero por si el backfill de arriba no alcanzó a cubrir algo, no se deja NULL suelto.
update pedido_items set tipo = 'venta' where tipo is null;

alter table pedido_items alter column tipo set not null;

alter table pedido_items drop constraint if exists pedido_items_tipo_check;
alter table pedido_items add constraint pedido_items_tipo_check
  check (tipo in ('alquiler', 'venta', 'servicio', 'confeccion'));

alter table pedido_items drop constraint if exists pedido_items_estado_check;
alter table pedido_items add constraint pedido_items_estado_check
  check (estado in ('activo', 'devuelto', 'cancelado'));

alter table pedido_items drop constraint if exists pedido_items_cantidad_check;
alter table pedido_items add constraint pedido_items_cantidad_check check (cantidad > 0);

alter table pedido_items drop constraint if exists pedido_items_precio_unitario_check;
alter table pedido_items add constraint pedido_items_precio_unitario_check check (precio_unitario >= 0);

-- Cortesía = línea con precio_unitario=0 + flag, NUNCA un descuento (decisión del plan, no se
-- reabre): la prenda sale físicamente de la tienda y debe volver, así que necesita su propia
-- línea/estado/devuelto_at — como descuento desaparecería del contrato y del inventario.
alter table pedido_items drop constraint if exists pedido_items_cortesia_check;
alter table pedido_items add constraint pedido_items_cortesia_check
  check (not es_cortesia or precio_unitario = 0);

-- subtotal generada: se agrega en un ALTER TABLE separado para que `cantidad`/`precio_unitario`
-- ya existan como columnas resueltas al momento de evaluar la expresión (evita cualquier duda de
-- orden de evaluación dentro de un único ALTER TABLE con múltiples ADD COLUMN).
alter table pedido_items add column if not exists subtotal
  numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored;

drop index if exists idx_pedido_items_pedido;
create index idx_pedido_items_pedido on pedido_items(pedido_id);
create index if not exists idx_pedido_items_activo on pedido_items(activo_id);

-- `descripcion` seguía nullable desde 0001; de aquí en más siempre se escribe (default '').
update pedido_items set descripcion = '' where descripcion is null;
alter table pedido_items alter column descripcion set not null;
alter table pedido_items alter column descripcion set default '';

-- El monto viejo (una sola columna de precio por pedido) ya se copió arriba a precio_unitario/
-- precio_lista — se elimina al final de esta migración, como pide el plan ("drop column precio
-- al final"). Nada en apps/erp-web debe seguir leyéndola después de este punto (ver pedidos-repo.ts).
alter table pedido_items drop column if exists precio;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) pedidos — unificar estado, numeración/código, autoría, y los totales derivados.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Unificar 'anulado' → 'cancelado' (el core de TS solo tuvo 'cancelado' siempre; esto es por si
-- algún dato viejo fuera de este repo usó el literal 'anulado' antes de que existiera el tipo).
update pedidos set estado = 'cancelado' where estado = 'anulado';

alter table pedidos drop constraint if exists pedidos_estado_check;
alter table pedidos add constraint pedidos_estado_check
  check (estado in ('abierto', 'entregado', 'devuelto', 'cerrado', 'cancelado'));

-- tipo de cabecera: los 4 tipos de línea + 'mixto' (derivado, nunca lo escribe un cliente
-- directamente — lo mantiene el trigger de la sección 4).
alter table pedidos drop constraint if exists pedidos_tipo_check;
alter table pedidos add constraint pedidos_tipo_check
  check (tipo in ('alquiler', 'venta', 'servicio', 'confeccion', 'mixto'));

-- sede_cod NOT NULL: requisito para poder generar `codigo` (sede-numero) determinísticamente.
-- Backfill defensivo (no debería hacer falta — se verificó que las 2 filas vivas ya tienen sede;
-- se deja igual por si el entorno cambia entre la investigación y la aplicación de esto).
update pedidos set sede_cod = coalesce(sede_cod, 'LB') where sede_cod is null;
alter table pedidos alter column sede_cod set not null;

-- Autoría (requisito del plan: "el código de quien vende"). Nullable: los pedidos históricos no
-- tienen forma de reconstruir quién los creó — quedan en NULL, no se inventa un autor.
alter table pedidos add column if not exists creado_por_id  uuid references empleados(id);
alter table pedidos add column if not exists creado_por_cod text;

-- Numeración: correlativo GLOBAL (no por sede) vía IDENTITY — más simple y sin condición de
-- carrera que un contador por sede, y el propio `codigo` (sede + número) ya lo hace distinguible
-- por tienda a simple vista. No es una fórmula de negocio (no hay monto ni reparto involucrado),
-- así que no se trata como "regla a confirmar" — pero si el dueño prefiere un correlativo propio
-- por sede (ej. que LB y ST arranquen cada uno en 1), es un cambio aislado a esta columna, ver
-- docs/pendientes-negocio.md. Postgres rellena `numero` para las filas existentes automáticamente
-- al agregar una columna IDENTITY — no hace falta backfill manual.
alter table pedidos add column if not exists numero integer generated always as identity;

alter table pedidos add column if not exists cobrado numeric(10,2) not null default 0;

-- codigo: generada, `{sede}-{numero con 5 dígitos}` (ej. LB-00043, el mismo formato del plan).
-- Se agrega en su propio ALTER TABLE para que `numero`/`sede_cod` ya existan resueltas.
alter table pedidos add column if not exists codigo text
  generated always as (sede_cod || '-' || lpad(numero::text, 5, '0')) stored;

create unique index if not exists uq_pedidos_codigo on pedidos(codigo);

-- saldo / estado_pago: generadas a partir de total/cobrado (ambas columnas planas mantenidas por
-- trigger, sección 4) — nunca las escribe la aplicación directamente. total<=0 cuenta como
-- 'completo' (nada que cobrar, ej. un pedido 100% cortesía) para no mostrar "pendiente" en un
-- pedido de S/ 0.
alter table pedidos add column if not exists saldo numeric(10,2)
  generated always as (round(total - cobrado, 2)) stored;

alter table pedidos add column if not exists estado_pago text
  generated always as (
    case
      when total <= 0 then 'completo'
      when cobrado <= 0 then 'pendiente'
      when cobrado >= total then 'completo'
      else 'parcial'
    end
  ) stored;

-- Backfill de `cobrado`: suma de los cobros de caja ya vinculados a cada pedido (antes de esta
-- fase, el "saldo" se calculaba en Node uniendo pedidos+caja_movimientos — ver cobrosPendientes()
-- en lib/caja-repo.ts, que esta fase reemplaza por `where saldo > 0` directo sobre esta columna).
update pedidos p set cobrado = coalesce((
  select sum(m.monto) from caja_movimientos m
  where m.pedido_id = p.id and m.categoria = 'cobro' and m.tipo = 'ingreso'
), 0);

comment on column pedidos.tipo is
  'Derivado de pedido_items.tipo (líneas no canceladas): el tipo único si todas coinciden, o
   ''mixto'' si hay más de uno. Lo mantiene el trigger trg_pedido_items_recalc — nunca se escribe
   a mano desde la aplicación.';
comment on column pedidos.total is
  'Σ subtotal de pedido_items no cancelados. Lo mantiene el trigger trg_pedido_items_recalc.';
comment on column pedidos.cobrado is
  'Σ neto (ingreso−egreso) de caja_movimientos categoría ''cobro'' de este pedido. Lo mantiene el
   trigger trg_caja_movimientos_recalc_cobrado — se recalcula ante CUALQUIER movimiento de esa
   categoría, se registre desde /pedidos o desde /caja, así el saldo nunca deriva.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) private.pedido_items_recalc() — trigger #1: total y tipo de la cabecera, derivados de las
--    líneas NO canceladas. SECURITY DEFINER a propósito (a diferencia de las RPC de la migración
--    0061, que son security invoker): es una invariante contable de sistema que debe mantenerse
--    SIEMPRE, sin depender de que la RLS de `pedidos` visto desde la fila que disparó el trigger
--    coincida con la del actor — mismo criterio que private.audit_log_trigger() (0058), pero SIN
--    el bloque try/exception de esa: un fallo acá (a diferencia de auditar) SÍ debe abortar la
--    transacción — un total desincronizado en silencio es justo el bug que esta fase corrige.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.pedido_items_recalc() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_pedido_id uuid := coalesce(new.pedido_id, old.pedido_id);
  v_total     numeric;
  v_tipos     text[];
  v_tipo      text;
begin
  select coalesce(sum(subtotal), 0) into v_total
    from pedido_items where pedido_id = v_pedido_id and estado <> 'cancelado';

  select array_agg(distinct tipo) into v_tipos
    from pedido_items where pedido_id = v_pedido_id and estado <> 'cancelado';

  v_tipo := case
    -- Sin líneas activas (ej. se anuló el pedido entero): conserva el tipo que ya tenía en vez de
    -- forzar un valor — evita pisar el último tipo "real" del pedido con algo arbitrario.
    when v_tipos is null or array_length(v_tipos, 1) = 0 then (select tipo from pedidos where id = v_pedido_id)
    when array_length(v_tipos, 1) = 1 then v_tipos[1]
    else 'mixto'
  end;

  update pedidos set total = v_total, tipo = coalesce(v_tipo, tipo) where id = v_pedido_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_pedido_items_recalc on pedido_items;
create trigger trg_pedido_items_recalc after insert or update or delete on pedido_items
  for each row execute function private.pedido_items_recalc();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) private.caja_movimientos_recalc_cobrado() — trigger #2: `pedidos.cobrado` recalculado ante
--    CUALQUIER movimiento de caja categoría 'cobro' (ingreso o egreso — un egreso categoría
--    'cobro' es el contra-asiento que usa pedido_anular, migración 0061, para revertir lo ya
--    cobrado). Neto ingreso−egreso, no solo suma de ingresos: así una reversa parcial también
--    cuadra. SECURITY DEFINER por el mismo motivo que el trigger #1.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.caja_movimientos_recalc_cobrado() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_pedido_id uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  if v_pedido_id is null then
    return coalesce(new, old);
  end if;

  update pedidos set cobrado = coalesce((
    select sum(case when tipo = 'ingreso' then monto else -monto end)
    from caja_movimientos
    where pedido_id = v_pedido_id and categoria = 'cobro'
  ), 0)
  where id = v_pedido_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_caja_movimientos_recalc_cobrado on caja_movimientos;
create trigger trg_caja_movimientos_recalc_cobrado after insert or update or delete on caja_movimientos
  for each row execute function private.caja_movimientos_recalc_cobrado();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr manualmente tras aplicar):
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   -- 1) Nadie quedó sin backfillear:
--   select count(*) from pedido_items where tipo is null;                    -- esperado: 0
--   select count(*) from pedidos where estado = 'anulado';                   -- esperado: 0
--   -- 2) Generadas cuadran:
--   select id, total, cobrado, saldo, estado_pago, numero, codigo from pedidos order by numero;
--   -- 3) El trigger reacciona a un cambio de línea (usar un pedido de prueba, no uno real):
--   -- insert into pedido_items (pedido_id, tipo, precio_unitario) values ('<id>', 'venta', 25);
--   -- select total, tipo from pedidos where id = '<id>';  -- total sube 25; tipo puede pasar a 'mixto'

