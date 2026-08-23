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
--
-- Cierra, en este mismo archivo (Zone Guard: la spec ya se actualizó en un commit aparte,
-- c02c41a), tres hallazgos del verificador adversarial antes de aplicarse — spec §2.6:
--   · Una liquidación con pagos vigentes no se anula (sección 2, trigger nuevo sobre
--     sueldo_liquidaciones).
--   · La regla del saldo vive en la base, no sólo en la RPC (sección 4, rama INSERT del trigger
--     de sueldo_liquidacion_pagos) — mismo `for update`, mismo código SALDO:.
--   · El monto se redondea a 2 decimales ANTES de validar (sección 6), y 'NaN' queda rechazado
--     tanto por el check de la tabla como por la propia comparación del saldo.

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

  -- `monto > 0` sólo NO alcanza para 'NaN': Postgres ordena NaN como MAYOR que cualquier valor
  -- no-NaN (a diferencia de IEEE754), así que 'NaN' > 0 es verdadero y ese check lo deja pasar.
  -- La segunda mitad lo cierra explícito: 'NaN' = 'NaN' sí es verdadero para el tipo numeric de
  -- Postgres (otra diferencia con float), así que la comparación detecta el caso.
  constraint sueldo_pago_monto_chk      check (monto > 0 and not (monto = 'NaN'::numeric)),
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
-- 2) sueldo_liquidaciones — una liquidación con pagos vigentes no se anula
--
--    Agregado el 23-ago-2026 tras el verificador adversarial (spec §2.6, hallazgo 1, ya en
--    `docs/pendientes-negocio.md` como default de seguridad pendiente de confirmar con el dueño).
--    Si se dejara anular con pagos colgando, la reemisión arrancaría en pagado=0: el camino
--    directo a pagar dos veces el mismo mes. Para anular una liquidación con pagos hace falta
--    anular antes cada pago con SU motivo — el rastro de por qué ese dinero ya no cuenta queda
--    escrito, nunca implícito.
--
--    Convive con private.sueldo_liq_inmutable() de la 0072: mismo evento (BEFORE UPDATE) sobre
--    la misma tabla, y Postgres corre los triggers de un mismo evento en orden alfabético por
--    nombre — 'trg_sueldo_liq_inmutable' < 'trg_sueldo_liq_pagos_vigentes', así que el de la 0072
--    corre primero. Pero el orden no cambia el resultado: este trigger sólo VALIDA (nunca toca
--    NEW) y cualquiera de los dos que levante una excepción aborta el UPDATE entero. La 0072 deja
--    pasar la transición cerrada→anulada bien formada; este trigger, después, la bloquea igual si
--    quedan pagos sin anular.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.sueldo_liq_pagos_bloquean_anular() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_n    int;
  v_suma numeric;
begin
  if new.estado = 'anulada' and old.estado <> 'anulada' then
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Aislamiento y RLS — mismo aislamiento 1 que sueldo_liquidacion_lineas: uno ve sus propios
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
-- 4) Inmutabilidad — un pago nace, y después sólo se anula. Nunca se edita, nunca se borra.
--
--    Cubre INSERT también, y no sólo UPDATE/DELETE: sin ese primer guard, un insert que evite la
--    RPC (misma cuenta admin, por SQL directo o PostgREST) podría crear un pago contra una
--    liquidación que todavía es 'borrador' o que ya está 'anulada' — o pagar de más. La RPC ya
--    valida todo esto para dar el mensaje amable, pero **la regla del saldo vive acá, en la base,
--    no sólo en la RPC** (spec §2.6, hallazgo del verificador): este es el mismo cinturón de más
--    que sueldo_sellado_inmutable le puso a sueldo_movimientos en la 0072. Mismo `for update`
--    sobre la liquidación que usa sueldo_liquidacion_pagar() — dentro de la misma transacción
--    Postgres no se autobloquea por pedir un lock que ya tiene, así que un abono por RPC no
--    duplica el lock al disparar este trigger.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
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
      select coalesce(sum(monto), 0) into v_pagado
      from sueldo_liquidacion_pagos
      where liquidacion_id = new.liquidacion_id and not anulado;

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

drop trigger if exists trg_sueldo_pago_inmutable on sueldo_liquidacion_pagos;
create trigger trg_sueldo_pago_inmutable before insert or update or delete on sueldo_liquidacion_pagos
  for each row execute function private.sueldo_pago_inmutable();

-- TRUNCATE no dispara ningún trigger `for each row` ni respeta RLS. Reusa el guard genérico de
-- la 0072 (private.sueldo_no_truncate()), no se reescribe.
drop trigger if exists trg_sueldo_pago_no_truncate on sueldo_liquidacion_pagos;
create trigger trg_sueldo_pago_no_truncate before truncate on sueldo_liquidacion_pagos
  for each statement execute function private.sueldo_no_truncate();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) Auditoría — mismo trigger genérico de la 0058 que ya audita el resto de las tablas de
--    sueldos (0072 §10). Un pago es una decisión de plata tanto como cualquiera de esas.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_audit_sueldo_liquidacion_pagos on sueldo_liquidacion_pagos;
create trigger trg_audit_sueldo_liquidacion_pagos after insert or update or delete on sueldo_liquidacion_pagos
  for each row execute function private.audit_log_trigger();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) sueldo_liquidacion_pagar(...) — registra un abono
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

  -- Se redondea ANTES de validar nada, para que lo que se valida (contra cero, contra el saldo)
  -- sea exactamente lo que se guarda. Redondear después dejaría pasar un monto que aprobó la
  -- validación con más decimales y se guarda distinto (spec §2.6, hallazgo del verificador).
  p_monto := round(p_monto, 2);

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
-- 7) sueldo_liquidacion_pago_anular(...) — el único camino para deshacer un abono
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
-- 8) Catálogo de métodos de pago (spec §2.6 y §6) — no-negociable 5: default explícito,
--    comentado como tal, editable desde /configuracion. Los cinco valores son los que la spec
--    PROPONE (23-ago-2026, sin confirmar con el dueño todavía — ya anotado en la spec §6, no
--    hace falta otra fila en pendientes-negocio.md).
--
--    `on conflict do nothing`: reaplicar esta migración no pisa lo que el administrador ya editó.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('sueldo_metodos_pago', 'Efectivo,Yape,Plin,Transferencia,Otro')
on conflict (clave) do nothing;
