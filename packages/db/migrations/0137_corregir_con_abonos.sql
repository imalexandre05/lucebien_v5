-- 0137 — Corregir una liquidación que ya tiene abonos: lo pagado se descuenta solo.
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-corregir-con-abonos-design.md
-- Prueba: packages/db/pruebas/0137_corregir_con_abonos.prueba.sql (escrita antes).
-- Ticket: lucebien-tablero #30. Decisión del dueño: lo ya entregado se descuenta automáticamente de
-- la liquidación corregida y queda el saldo; no se obliga a anular pagos reales. Idempotente.

-- La corregida apunta a la liquidación (anulada) que reemplaza. Los pagos no se mueven.
alter table sueldo_liquidaciones add column if not exists corrige_a uuid references sueldo_liquidaciones(id);
create index if not exists idx_sueldo_liq_corrige_a on sueldo_liquidaciones(corrige_a) where corrige_a is not null;

-- Lo pagado (abonos no anulados) de una liquidación y de toda la cadena de liquidaciones que corrige.
-- `union` (no `union all`) corta cualquier ciclo.
create or replace function private.sueldo_pagado_cadena(p_liq uuid)
  returns numeric language sql stable security definer set search_path = public, pg_temp
as $fn$
  with recursive cadena(id) as (
    select p_liq
    union
    select l.corrige_a from sueldo_liquidaciones l join cadena c on l.id = c.id where l.corrige_a is not null
  )
  select coalesce(sum(p.monto), 0)
    from sueldo_liquidacion_pagos p join cadena c on p.liquidacion_id = c.id
   where not p.anulado;
$fn$;
revoke execute on function private.sueldo_pagado_cadena(uuid) from public, anon;
grant  execute on function private.sueldo_pagado_cadena(uuid) to authenticated;

-- Vínculo automático: una liquidación nueva se enlaza con una anulada del mismo contrato y
-- EXACTAMENTE el mismo período que tenga abonos vigentes en su cadena y sea la punta de la cadena (nadie la corrige todavía). Así los
-- abonos no quedan huérfanos aunque el borrador se cree en un segundo intento.
create or replace function private.sueldo_liq_enlazar_correccion() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if new.corrige_a is null then
    select l.id into new.corrige_a
      from sueldo_liquidaciones l
     where l.acuerdo_id = new.acuerdo_id and l.empleado_id = new.empleado_id
       and l.periodo_desde = new.periodo_desde and l.periodo_hasta = new.periodo_hasta
       and l.estado = 'anulada'
       and private.sueldo_pagado_cadena(l.id) > 0
       and not exists (select 1 from sueldo_liquidaciones s where s.corrige_a = l.id)
     order by l.anulada_en desc nulls last
     limit 1;
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_sueldo_liq_enlazar_correccion on sueldo_liquidaciones;
create trigger trg_sueldo_liq_enlazar_correccion before insert on sueldo_liquidaciones
  for each row execute function private.sueldo_liq_enlazar_correccion();

-- La anulación común sigue bloqueada con abonos; sólo la RPC de corrección (que fija la variable
-- local de la transacción con el id de la liquidación) la deja pasar.
create or replace function private.sueldo_liq_pagos_bloquean_anular() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_n    int;
  v_suma numeric;
begin
  if new.estado = 'anulada' and old.estado <> 'anulada'
     and coalesce(current_setting('scilb.corrigiendo', true), '') <> new.id::text then
    select count(*), coalesce(sum(monto), 0) into v_n, v_suma
    from sueldo_liquidacion_pagos
    where liquidacion_id = new.id and not anulado;

    if v_n > 0 then
      raise exception 'ESTADO:esta liquidación tiene % pago(s) vigente(s) por S/%; anulalos con motivo antes de anularla',
        v_n, v_suma;
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_sueldo_liq_pagos_vigentes on sueldo_liquidaciones;
create trigger trg_sueldo_liq_pagos_vigentes before update on sueldo_liquidaciones
  for each row execute function private.sueldo_liq_pagos_bloquean_anular();

-- El anti-sobrepago de la base cuenta la cadena de correcciones.
create or replace function private.sueldo_pago_inmutable() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_estado  text;
  v_total   numeric;
  v_pagado  numeric;
begin
  if TG_OP = 'DELETE' then
    raise exception 'CONGELADA:un pago de liquidación no se borra; se anula con motivo, el rastro tiene que quedar';
  end if;

  if TG_OP = 'INSERT' then
    -- `registrado_por` no lleva `not null` en la columna (así puede quedar en null si el empleado
    -- que lo cargó se borra después — on delete set null), pero AL NACER un pago siempre tiene
    -- que traer quién lo registró. Sin este guard, un insert directo por SQL crudo deja un pago
    -- sin autor desde el origen, no sólo después de un borrado.
    if new.registrado_por is null then
      raise exception 'DATO:un pago tiene que quedar con quién lo registró';
    end if;

    select l.estado, l.total into v_estado, v_total
    from sueldo_liquidaciones l where l.id = new.liquidacion_id for update;

    if v_estado is distinct from 'cerrada' then
      raise exception 'ESTADO:sólo se paga una liquidación cerrada (está %)', coalesce(v_estado, 'inexistente');
    end if;

    -- Anti-sobrepago acá también. Un pago que nace ya anulado (caso raro, pero la tabla lo
    -- permite) no cuenta contra el saldo: no se le está pidiendo plata a nadie con esa fila.
    -- 'NaN' cae solo: por cómo Postgres ordena numeric, NaN es "mayor" que cualquier total, así
    -- que la comparación de abajo lo rechaza igual (y el check de la tabla lo cierra aparte).
    if not new.anulado then
      -- Cuenta también lo pagado en las liquidaciones que ésta corrige (0137).
      v_pagado := private.sueldo_pagado_cadena(new.liquidacion_id);

      if v_pagado + new.monto > v_total then
        raise exception 'SALDO:este abono deja % pagado contra un total de %; supera lo que falta cobrar',
          (v_pagado + new.monto), v_total;
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: única transición permitida es anular (false → true), con motivo y autor, sin tocar
  -- ninguna otra columna. La comparación va por jsonb, como private.sueldo_liq_inmutable() de la
  -- 0072: así cualquier columna que se agregue después queda protegida sola.
  if old.anulado = false
     and new.anulado = true
     and coalesce(length(trim(new.anulado_motivo)), 0) > 0
     and new.anulado_por is not null
     and new.anulado_en is not null
     and (to_jsonb(new) - 'anulado' - 'anulado_motivo' - 'anulado_por' - 'anulado_en')
       = (to_jsonb(old) - 'anulado' - 'anulado_motivo' - 'anulado_por' - 'anulado_en')
  then
    return new;
  end if;

  raise exception 'CONGELADA:un pago no se modifica; la única transición permitida es anularlo una vez, con motivo y autor';
end;
$$;
-- sueldo_liquidacion_pagar: mismo cuerpo que la 0080, pero el pagado es el de la cadena.
create or replace function sueldo_liquidacion_pagar(
  p_liquidacion_id uuid,
  p_fecha          date,
  p_monto          numeric,
  p_metodo         text,
  p_nota           text default null
) returns uuid language plpgsql volatile security invoker set search_path = public as $fn$
declare
  l        record;
  v_pagado numeric;
  v_id     uuid;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador registra pagos de liquidación';
  end if;
  p_monto := round(p_monto, 2);
  if p_fecha is null then raise exception 'DATO:hace falta la fecha del pago'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'DATO:el monto tiene que ser mayor a cero'; end if;
  if coalesce(length(trim(coalesce(p_metodo, ''))), 0) = 0 then
    raise exception 'DATO:hace falta el método de pago';
  end if;

  select * into l from sueldo_liquidaciones where id = p_liquidacion_id for update;
  if not found then raise exception 'DATO:la liquidación no existe o no es visible'; end if;
  if l.estado <> 'cerrada' then
    raise exception 'ESTADO:esta liquidación está %; sólo se paga una cerrada', l.estado;
  end if;

  v_pagado := private.sueldo_pagado_cadena(p_liquidacion_id);
  if v_pagado + p_monto > l.total then
    raise exception 'SALDO:este abono deja % pagado contra un total de %; supera lo que falta cobrar',
      (v_pagado + p_monto), l.total;
  end if;

  insert into sueldo_liquidacion_pagos (liquidacion_id, fecha, monto, metodo, nota, registrado_por)
  values (p_liquidacion_id, p_fecha, p_monto, trim(p_metodo), nullif(trim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke execute on function sueldo_liquidacion_pagar(uuid, date, numeric, text, text) from public, anon;
grant  execute on function sueldo_liquidacion_pagar(uuid, date, numeric, text, text) to authenticated;

-- Corregir: anula aunque haya abonos vigentes (que quedan intactos y pasan a la corregida).
create or replace function sueldo_liquidacion_corregir_anular(p_liquidacion uuid, p_motivo text)
  returns jsonb language plpgsql volatile security invoker set search_path = public as $fn$
declare v_pagado numeric; r jsonb;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador corrige una liquidación';
  end if;
  v_pagado := private.sueldo_pagado_cadena(p_liquidacion);
  perform set_config('scilb.corrigiendo', p_liquidacion::text, true);
  r := sueldo_liquidacion_anular(p_liquidacion, p_motivo);
  perform set_config('scilb.corrigiendo', '', true);
  return r || jsonb_build_object('yaPagado', v_pagado);
end;
$fn$;
revoke execute on function sueldo_liquidacion_corregir_anular(uuid, text) from public, anon;
grant  execute on function sueldo_liquidacion_corregir_anular(uuid, text) to authenticated;

-- Abonos de la cadena de cada liquidación pedida (incluidos los de las anuladas que reemplaza).
create or replace function sueldo_pagos_de_cadena(p_ids uuid[])
  returns table (consulta_id uuid, id uuid, liquidacion_id uuid, fecha date, monto numeric, metodo text,
                 nota text, registrado_por uuid, anulado boolean, anulado_motivo text,
                 anulado_en timestamptz, creado_en timestamptz)
  language sql stable security invoker set search_path = public
as $fn$
  with recursive cadena(raiz, id) as (
    select x, x from unnest(p_ids) x
    union
    select c.raiz, l.corrige_a from sueldo_liquidaciones l join cadena c on l.id = c.id where l.corrige_a is not null
  )
  select c.raiz, p.id, p.liquidacion_id, p.fecha, p.monto, p.metodo, p.nota, p.registrado_por,
         p.anulado, p.anulado_motivo, p.anulado_en, p.creado_en
    from cadena c join sueldo_liquidacion_pagos p on p.liquidacion_id = c.id
   order by p.fecha desc, p.creado_en desc;
$fn$;
revoke execute on function sueldo_pagos_de_cadena(uuid[]) from public, anon;
grant  execute on function sueldo_pagos_de_cadena(uuid[]) to authenticated;
