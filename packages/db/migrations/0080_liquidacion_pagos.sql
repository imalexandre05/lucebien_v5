-- 0080_liquidacion_pagos.sql — los abonos con los que se salda una liquidación cerrada.
--
-- Implementa docs/superpowers/specs/sueldos/2026-08-23-personal-fusion-design.md §2.6: «la
-- liquidación es el pago». Sobre una liquidación cerrada se registran abonos (fecha, monto,
-- método) hasta saldarla, cada uno anulable con motivo, nunca editable ni borrable.
--
-- ZONA CRÍTICA (CLAUDE.md no-negociable 1): esta tabla guarda plata que YA se le entregó a una
-- persona real. Un pago que se pueda editar en silencio, borrar, o que deje pagar de más, es un
-- error de caja que nadie puede reconstruir después.
--
-- Idempotente: se puede reaplicar sin fallar. Cada `create` lleva su `if not exists` y cada
-- restricción que no lo soporta va envuelta en un `do $$ ... $$` que consulta pg_constraint.
--
-- Recordatorios que este repo pagó caros (docs/aprendizajes.md):
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25). Acá ni
--     siquiera aplica: el aislamiento es admin vs. dueño de la liquidación.
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio (le pasó a `empleado_tiendas`, meses en
--     producción hasta la 0067).
--   · Todo default de negocio va comentado como provisional. El catálogo de métodos de pago ya
--     está anotado como pendiente de confirmar con el dueño en la propia spec §6 — no hace falta
--     otra fila en pendientes-negocio.md (y este commit no toca docs, por Zone Guard).
--   · Una prueba que corre por el editor SQL de Supabase no tiene sesión: `auth.uid()` es null
--     ahí. La prueba de esta migración se hace pasar por admin con `set_config('request.jwt.claims', ...)`,
--     igual que la prueba de la 0073 — sin eso, todo devuelve PERMISO y no comprueba nada.
--
-- Reutiliza de la 0072/0073, nada se reescribe: private.app_es_admin(),
-- private.sueldo_liquidacion_es_mia(uuid), private.sueldo_no_truncate(), private.audit_log_trigger().

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) sueldo_liquidacion_pagos — un abono contra el total ya congelado
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists sueldo_liquidacion_pagos (
  id             uuid primary key default gen_random_uuid(),
  -- on delete restrict: un pago no desaparece porque alguien borre la liquidación. En la práctica
  -- es un cinturón de más — sólo una liquidación 'borrador' se puede borrar (private.sueldo_liq_
  -- inmutable de la 0072), y ninguna liquidación con pagos llega nunca a ese estado.
  liquidacion_id uuid    not null references sueldo_liquidaciones(id) on delete restrict,
  fecha          date    not null,
  monto          numeric(10,2) not null,
  metodo         text    not null,
  nota           text,
  -- Quién lo cargó. on delete set null: mismo criterio que sueldo_liquidaciones.cerrada_por — el
  -- rastro del pago no depende de que la cuenta del empleado siga existiendo.
  registrado_por uuid references empleados(id) on delete set null,
  anulado        boolean not null default false,
  anulado_motivo text,
  anulado_por    uuid references empleados(id) on delete set null,
  anulado_en     timestamptz,
  creado_en      timestamptz not null default now(),

  constraint sueldo_pago_monto_chk      check (monto > 0),
  constraint sueldo_pago_metodo_chk     check (length(trim(metodo)) > 0),
  -- Mismo criterio que sueldo_liq_anulacion_chk (0072): anular sin motivo es perder el rastro de
  -- por qué. anulado_por queda fuera del check por la misma razón que allá — es `on delete set
  -- null`, y un check que lo exigiera convertiría el borrado de un empleado en un error opaco
  -- mucho tiempo después.
  constraint sueldo_pago_anulacion_chk  check (
    not anulado or coalesce(length(trim(anulado_motivo)), 0) > 0
  )
);

create index if not exists idx_sueldo_pago_liquidacion on sueldo_liquidacion_pagos(liquidacion_id);

comment on table sueldo_liquidacion_pagos is
  'Abonos contra una liquidación cerrada (spec 2026-08-23-personal-fusion-design.md §2.6). El
   total a saldar es sueldo_liquidaciones.total, ya congelado; acá sólo se acumula lo pagado.
   Nunca se edita ni se borra: se anula con motivo, como la liquidación misma.';
comment on column sueldo_liquidacion_pagos.nota is
  'Opcional. No es el lugar de los adelantos: esos ya están descontados dentro del total
   calculado (RN-19) y sellados en sueldo_movimientos. Pagar acá el mismo monto sería pagarlo dos
   veces — la pantalla (T9) lo aclara para que nadie lo haga.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Aislamiento y RLS — mismo aislamiento 1 que sueldo_liquidacion_lineas: uno ve sus propios
--    pagos, el administrador los ve todos. Reusa private.sueldo_liquidacion_es_mia(uuid) de la
--    0072, no se reescribe el helper.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table sueldo_liquidacion_pagos enable row level security;

drop policy if exists sueldo_pago_select on sueldo_liquidacion_pagos;
create policy sueldo_pago_select on sueldo_liquidacion_pagos for select
  using (private.app_es_admin() or private.sueldo_liquidacion_es_mia(liquidacion_id));

-- Policy de escritura: sin esta, RLS activa + sólo select deja el insert/update/delete fallando
-- en silencio (regla del guard, docs/aprendizajes.md). La escritura real pasa por las dos RPC de
-- más abajo — que además exigen private.app_es_admin() adentro, aunque sean `security invoker` —
-- pero la tabla necesita su policy `for all` para que la RPC (que corre con los permisos de quien
-- la llama) pueda ejecutar el insert/update que le pide.
drop policy if exists sueldo_pago_admin on sueldo_liquidacion_pagos;
create policy sueldo_pago_admin on sueldo_liquidacion_pagos for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Inmutabilidad — un pago nace, y después sólo se anula. Nunca se edita, nunca se borra.
--
--    Cubre INSERT también, y no sólo UPDATE/DELETE: sin ese primer guard, un insert que evite la
--    RPC (misma cuenta admin, por SQL directo) podría crear un pago contra una liquidación que
--    todavía es 'borrador' o que ya está 'anulada'. La RPC ya lo valida — este es el mismo
--    cinturón de más que sueldo_sellado_inmutable le puso a sueldo_movimientos en la 0072: la
--    regla no depende de que quien escribe la respete, depende de que la base la haga cumplir.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.sueldo_pago_inmutable() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
begin
  if TG_OP = 'DELETE' then
    raise exception 'CONGELADA:un pago de liquidación no se borra; se anula con motivo, el rastro tiene que quedar';
  end if;

  if TG_OP = 'INSERT' then
    select l.estado into v_estado from sueldo_liquidaciones l where l.id = new.liquidacion_id;
    if v_estado is distinct from 'cerrada' then
      raise exception 'ESTADO:sólo se paga una liquidación cerrada (está %)', coalesce(v_estado, 'inexistente');
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

drop trigger if exists trg_sueldo_pago_inmutable on sueldo_liquidacion_pagos;
create trigger trg_sueldo_pago_inmutable before insert or update or delete on sueldo_liquidacion_pagos
  for each row execute function private.sueldo_pago_inmutable();

-- TRUNCATE no dispara ningún trigger `for each row` ni respeta RLS. Reusa el guard genérico de
-- la 0072 (private.sueldo_no_truncate()), no se reescribe.
drop trigger if exists trg_sueldo_pago_no_truncate on sueldo_liquidacion_pagos;
create trigger trg_sueldo_pago_no_truncate before truncate on sueldo_liquidacion_pagos
  for each statement execute function private.sueldo_no_truncate();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) Auditoría — mismo trigger genérico de la 0058 que ya audita el resto de las tablas de
--    sueldos (0072 §10). Un pago es una decisión de plata tanto como cualquiera de esas.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_audit_sueldo_liquidacion_pagos on sueldo_liquidacion_pagos;
create trigger trg_audit_sueldo_liquidacion_pagos after insert or update or delete on sueldo_liquidacion_pagos
  for each row execute function private.audit_log_trigger();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) sueldo_liquidacion_pagar(...) — registra un abono
--
--    `security invoker` con `set search_path = public` y un guard explícito adentro, igual que
--    las tres RPC de la 0073: la RLS del actor decide el alcance, y el guard no depende de que
--    ser `invoker` alcance solo.
--
--    Anti-sobrepago con seguridad de concurrencia: el `select ... for update` bloquea la FILA de
--    la liquidación antes de sumar. Dos abonos simultáneos no leen el mismo saldo dos veces — el
--    segundo espera a que el primero termine su transacción, y recién ahí vuelve a sumar contra
--    lo que el primero ya insertó. Sin el `for update`, dos requests a la vez podrían leer el
--    mismo "falta S/100" y los dos insertar S/100, pagando S/200 de un total de S/100.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
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

  if p_fecha is null then
    raise exception 'DATO:hace falta la fecha del pago';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'DATO:el monto tiene que ser mayor a cero';
  end if;
  if coalesce(length(trim(coalesce(p_metodo, ''))), 0) = 0 then
    raise exception 'DATO:hace falta el método de pago';
  end if;

  select * into l from sueldo_liquidaciones where id = p_liquidacion_id for update;
  if not found then
    raise exception 'DATO:la liquidación no existe o no es visible';
  end if;
  if l.estado <> 'cerrada' then
    raise exception 'ESTADO:esta liquidación está %; sólo se paga una cerrada', l.estado;
  end if;

  select coalesce(sum(monto), 0) into v_pagado
  from sueldo_liquidacion_pagos
  where liquidacion_id = p_liquidacion_id and not anulado;

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

comment on function sueldo_liquidacion_pagar(uuid, date, numeric, text, text) is
  'Registra un abono contra una liquidación cerrada. El adelanto de mitad de mes NO se registra
   acá: ya está descontado dentro del total (RN-19). Anti-sobrepago con select ... for update
   sobre la liquidación, a prueba de dos abonos simultáneos.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) sueldo_liquidacion_pago_anular(...) — el único camino para deshacer un abono
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function sueldo_liquidacion_pago_anular(p_pago_id uuid, p_motivo text)
  returns jsonb language plpgsql volatile security invoker set search_path = public as $fn$
declare
  p record;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador anula un pago';
  end if;

  if coalesce(length(trim(coalesce(p_motivo, ''))), 0) = 0 then
    raise exception 'DATO:hace falta el motivo de la anulación; sin motivo se pierde el rastro';
  end if;

  select * into p from sueldo_liquidacion_pagos where id = p_pago_id for update;
  if not found then
    raise exception 'DATO:el pago no existe o no es visible';
  end if;
  if p.anulado then
    raise exception 'ESTADO:este pago ya está anulado';
  end if;

  update sueldo_liquidacion_pagos
     set anulado = true, anulado_motivo = trim(p_motivo), anulado_por = auth.uid(), anulado_en = now()
   where id = p_pago_id;

  return jsonb_build_object('id', p_pago_id, 'anulado', true);
end;
$fn$;

revoke execute on function sueldo_liquidacion_pago_anular(uuid, text) from public, anon;
grant  execute on function sueldo_liquidacion_pago_anular(uuid, text) to authenticated;

comment on function sueldo_liquidacion_pago_anular(uuid, text) is
  'Anula un pago con motivo obligatorio. Nunca lo edita ni lo borra — private.sueldo_pago_inmutable()
   sólo deja pasar exactamente esta transición.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7) Catálogo de métodos de pago (spec §2.6 y §6) — no-negociable 5: default explícito,
--    comentado como tal, editable desde /configuracion. Los cinco valores son los que la spec
--    PROPONE (23-ago-2026, sin confirmar con el dueño todavía — ya anotado en la spec §6, no
--    hace falta otra fila en pendientes-negocio.md).
--
--    `on conflict do nothing`: reaplicar esta migración no pisa lo que el administrador ya editó.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('sueldo_metodos_pago', 'Efectivo,Yape,Plin,Transferencia,Otro')
on conflict (clave) do nothing;
