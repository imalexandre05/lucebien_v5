-- 0136 — Movimientos con fecha en un período cerrado: se pregunta, nunca quedan huérfanos.
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-movimientos-periodo-cerrado-design.md
-- Prueba: packages/db/pruebas/0136_movimientos_periodo_cerrado.prueba.sql (escrita antes).
-- Ticket: lucebien-tablero #29. Decisión del dueño: se pregunta cada vez (siguiente período
-- abierto, o anular el cierre). Idempotente: se puede reaplicar.

-- Fecha con la que el administrador tipeó el movimiento cuando se tuvo que mover al siguiente
-- período. Null = la fila está en la fecha en que se hizo.
alter table sueldo_movimientos add column if not exists fecha_original date;

-- Estado de una fecha para una persona: cerrado | abierto | sin_contrato.
create or replace function private.sueldo_estado_fecha(p_empleado uuid, p_fecha date)
  returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare l record;
begin
  -- SECURITY DEFINER con execute para authenticated (lo llaman RPC invoker): sin esta guarda cualquier
  -- empleado conocería el estado de cierre del sueldo de otro. auth.uid() nulo = servicio/superusuario.
  if auth.uid() is not null and not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador consulta el estado de los períodos de sueldo';
  end if;
  select id, periodo_desde, periodo_hasta into l
    from sueldo_liquidaciones
   where empleado_id = p_empleado and estado = 'cerrada'
     and p_fecha between periodo_desde and periodo_hasta
   limit 1;
  if found then
    return jsonb_build_object('estado', 'cerrado', 'liquidacion_id', l.id,
                              'desde', l.periodo_desde, 'hasta', l.periodo_hasta);
  end if;
  if exists (select 1 from sueldo_acuerdos
              where empleado_id = p_empleado and p_fecha between fecha_inicio and fecha_fin) then
    return jsonb_build_object('estado', 'abierto');
  end if;
  return jsonb_build_object('estado', 'sin_contrato');
end;
$fn$;
revoke execute on function private.sueldo_estado_fecha(uuid, date) from public, anon;
grant  execute on function private.sueldo_estado_fecha(uuid, date) to authenticated;

-- Primera fecha >= p_fecha que está en un período abierto, o null si ya no hay ninguno.
-- Salta los tramos cerrados consecutivos y los huecos entre contratos.
create or replace function private.sueldo_siguiente_abierto(p_empleado uuid, p_fecha date)
  returns date language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare d date := p_fecha; st jsonb; v_ini date; i int;
begin
  for i in 1..400 loop
    st := private.sueldo_estado_fecha(p_empleado, d);
    if st->>'estado' = 'abierto' then return d; end if;
    if st->>'estado' = 'cerrado' then
      d := (st->>'hasta')::date + 1;
    else
      select min(fecha_inicio) into v_ini from sueldo_acuerdos
       where empleado_id = p_empleado and fecha_inicio > d;
      if v_ini is null then return null; end if;
      d := v_ini;
    end if;
  end loop;
  return null;
end;
$fn$;
revoke execute on function private.sueldo_siguiente_abierto(uuid, date) from public, anon;
grant  execute on function private.sueldo_siguiente_abierto(uuid, date) to authenticated;

-- Consulta para la pantalla: estado de la fecha y, si no está abierta, a dónde iría «al siguiente».
create or replace function public.sueldo_movimiento_estado_fecha(p_empleado uuid, p_fecha date)
  returns jsonb language plpgsql stable security invoker set search_path = public
as $fn$
declare st jsonb;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador carga movimientos de sueldo';
  end if;
  st := private.sueldo_estado_fecha(p_empleado, p_fecha);
  if st->>'estado' <> 'abierto' then
    st := st || jsonb_build_object('siguiente', private.sueldo_siguiente_abierto(p_empleado, p_fecha));
  end if;
  return st;
end;
$fn$;
revoke execute on function public.sueldo_movimiento_estado_fecha(uuid, date) from public, anon;
grant  execute on function public.sueldo_movimiento_estado_fecha(uuid, date) to authenticated;

-- Única vía de alta de movimientos. p_decision: null | 'siguiente' | 'anular_cierre'.
create or replace function public.sueldo_movimiento_crear(
  p_empleado uuid, p_fecha date, p_tipo text, p_monto numeric, p_cantidad int, p_motivo text,
  p_decision text default null
) returns uuid language plpgsql volatile security invoker set search_path = public
as $fn$
declare
  st jsonb; v_estado text; v_fecha date := p_fecha; v_orig date := null;
  v_motivo text := trim(coalesce(p_motivo, '')); v_sig date; v_id uuid; v_conteo boolean;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador carga movimientos de sueldo';
  end if;
  if p_decision is not null and p_decision not in ('siguiente', 'anular_cierre') then
    raise exception 'DATO:decisión desconocida "%"', p_decision;
  end if;
  if v_motivo = '' then raise exception 'DATO:el motivo es obligatorio'; end if;

  -- Carrera con el cierre: si hay un borrador que cubre la fecha, esperar a que termine un cierre en
  -- curso (el cierre lo bloquea `for update`) y recién entonces mirar el estado.
  perform 1 from sueldo_liquidaciones
   where empleado_id = p_empleado and estado = 'borrador' and p_fecha between periodo_desde and periodo_hasta
   for share;

  st := private.sueldo_estado_fecha(p_empleado, p_fecha);
  v_estado := st->>'estado';

  if v_estado <> 'abierto' then
    v_sig := private.sueldo_siguiente_abierto(p_empleado, p_fecha);
    if p_decision is null then
      raise exception 'PERIODO:la fecha % % (decide: cargarlo al siguiente período abierto o anular el cierre)',
        to_char(p_fecha, 'DD/MM/YYYY'),
        case v_estado when 'cerrado' then 'está en un período ya cerrado' else 'no tiene contrato' end;
    elsif p_decision = 'siguiente' then
      if v_sig is null then
        raise exception 'PERIODO:no hay un período siguiente abierto: crea el contrato siguiente o anula el cierre; no se guardó nada';
      end if;
      -- Carrera con el cierre del borrador que cubre la fecha destino: esperar a que termine y releer.
      perform 1 from sueldo_liquidaciones
       where empleado_id = p_empleado and estado = 'borrador' and v_sig between periodo_desde and periodo_hasta
       for share;
      if private.sueldo_estado_fecha(p_empleado, v_sig)->>'estado' <> 'abierto' then
        raise exception 'PERIODO:el período siguiente se cerró mientras tanto; vuelve a intentarlo; no se guardó nada';
      end if;
      v_orig := p_fecha;
      v_fecha := v_sig;
      v_motivo := v_motivo || ' (fecha original ' || to_char(p_fecha, 'DD/MM/YYYY')
                  || case v_estado when 'cerrado' then ', período cerrado)' else ', sin contrato)' end;
    else -- anular_cierre
      if v_estado <> 'cerrado' then
        raise exception 'PERIODO:la fecha % no tiene contrato: no hay cierre que anular; no se guardó nada',
          to_char(p_fecha, 'DD/MM/YYYY');
      end if;
      -- Pagos de toda la cadena de correcciones (private.sueldo_pagado_cadena, de la 0137; se resuelve al ejecutar).
      if private.sueldo_pagado_cadena((st->>'liquidacion_id')::uuid) > 0 then
        raise exception 'PERIODO:esa liquidación ya tiene pagos registrados; no se anula el cierre. Corrígela desde Liquidación y pago con «Corregir» (no anules pagos entregados); no se guardó nada';
      end if;
      perform sueldo_liquidacion_anular((st->>'liquidacion_id')::uuid,
        'Anulada para cargar un movimiento con fecha ' || to_char(p_fecha, 'DD/MM/YYYY') || ': ' || v_motivo);
    end if;
  end if;

  v_conteo := p_tipo in ('capacitacion', 'almuerzo_entregado');
  insert into sueldo_movimientos (empleado_id, fecha, fecha_original, tipo, monto, cantidad, motivo, creado_por)
    values (p_empleado, v_fecha, v_orig, p_tipo,
            case when v_conteo then null else p_monto end,
            case when v_conteo then coalesce(p_cantidad, 1) else 1 end,
            v_motivo, auth.uid())
    returning id into v_id;
  return v_id;
end;
$fn$;
revoke execute on function public.sueldo_movimiento_crear(uuid, date, text, numeric, int, text, text) from public, anon;
grant  execute on function public.sueldo_movimiento_crear(uuid, date, text, numeric, int, text, text) to authenticated;

-- Red de seguridad: ningún insert sin sello puede caer en un período cerrado, venga de donde venga.
create or replace function private.sueldo_mov_no_en_cerrado() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if new.liquidacion_id is null
     and private.sueldo_estado_fecha(new.empleado_id, new.fecha)->>'estado' in ('cerrado', 'sin_contrato') then
    raise exception 'PERIODO_CERRADO:la fecha % está en un período cerrado o sin contrato; usa sueldo_movimiento_crear y elige a qué período cargarlo',
      to_char(new.fecha, 'DD/MM/YYYY');
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_sueldo_mov_no_en_cerrado on sueldo_movimientos;
create trigger trg_sueldo_mov_no_en_cerrado before insert or update of fecha, empleado_id on sueldo_movimientos
  for each row execute function private.sueldo_mov_no_en_cerrado();
