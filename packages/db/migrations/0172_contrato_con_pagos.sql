-- 0172_contrato_con_pagos.sql — un contrato con liquidaciones no se recorta; la renovación hereda la tarifa vigente
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-contrato-con-pagos-no-se-recorta-design.md
-- Prueba: packages/db/pruebas/0172_contrato_con_pagos.prueba.sql.   ZONA CRÍTICA (verificador antes de mergear).
--
-- 1) Trigger before update en sueldo_acuerdos: ninguna liquidación no anulada puede quedar fuera de su
--    contrato (desde < fecha_inicio o hasta > fecha_fin), ni el contrato cambiar de dueño si ya tiene
--    liquidaciones. Cubre la RPC de edición y cualquier update directo. Sin esto, acortar un contrato ya
--    pagado dejaba pagar dos veces el tramo liberado desde el contrato siguiente.
-- 2) sueldo_acuerdo_renovar (0170): el único cambio es el cálculo de v_tarifa (última tarifa no nula de los
--    cambios con desde <= fecha_fin; si no, la del contrato). Frecuencia, cuota, grants: iguales.
--
-- Defaults inventados: ninguno. Idempotente (create or replace, drop trigger if exists).

create or replace function private.sueldo_acuerdo_cubre_liquidaciones()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  l record;
begin
  if new.empleado_id is distinct from old.empleado_id
     and exists (select 1 from sueldo_liquidaciones x where x.acuerdo_id = old.id and x.estado <> 'anulada') then
    raise exception 'PERIODO:este contrato ya tiene liquidaciones, así que no se puede pasar a otra persona. Anula esas liquidaciones desde Liquidaciones y vuelve a intentar, o crea un contrato nuevo para la otra persona.';
  end if;

  if new.fecha_inicio is distinct from old.fecha_inicio or new.fecha_fin is distinct from old.fecha_fin then
    select x.periodo_desde, x.periodo_hasta, x.estado into l
      from sueldo_liquidaciones x
     where x.acuerdo_id = old.id and x.estado <> 'anulada'
       and (x.periodo_desde < new.fecha_inicio or x.periodo_hasta > new.fecha_fin)
     order by x.periodo_desde
     limit 1;
    if found then
      raise exception 'PERIODO:el contrato tiene una liquidación % del % al %, que quedaría fuera de las fechas nuevas (% a %). Anula esa liquidación desde Liquidaciones primero, o deja el contrato desde el % hasta el %.',
        l.estado, l.periodo_desde, l.periodo_hasta, new.fecha_inicio, new.fecha_fin,
        least(new.fecha_inicio, l.periodo_desde), greatest(new.fecha_fin, l.periodo_hasta);
    end if;
  end if;
  return new;
end;
$fn$;

comment on function private.sueldo_acuerdo_cubre_liquidaciones() is
  'Un contrato no se acorta ni cambia de dueño dejando liquidaciones no anuladas fuera de él (0172).';

drop trigger if exists trg_sueldo_acuerdo_cubre_liquidaciones on sueldo_acuerdos;
create trigger trg_sueldo_acuerdo_cubre_liquidaciones before update on sueldo_acuerdos
  for each row execute function private.sueldo_acuerdo_cubre_liquidaciones();

-- ═══ Renovar: igual que la 0170, salvo la tarifa heredada ═══════════════════════════════════════
create or replace function sueldo_acuerdo_renovar(p_acuerdo uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  a        sueldo_acuerdos%rowtype;
  v_ini    date;
  v_fin    date;
  v_meses  int;
  v_nuevo  uuid;
  c        sueldo_acuerdo_cambios%rowtype;
  v_mod    text;
  v_cada   int;
  v_cuota  numeric;
  v_tarifa numeric;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede renovar un contrato';
  end if;

  select * into a from sueldo_acuerdos where id = p_acuerdo for update;
  if not found then
    raise exception 'DATO:ese contrato no existe';
  end if;
  if a.estado = 'borrador' then
    raise exception 'ESTADO:un contrato en borrador no se renueva; actívalo primero';
  end if;
  if exists (select 1 from sueldo_acuerdos n where n.empleado_id = a.empleado_id and n.fecha_inicio > a.fecha_fin) then
    raise exception 'ESTADO:este contrato ya tiene uno que lo sigue; edita ese';
  end if;

  -- Frecuencia y cuota VIGENTES al final del contrato (0120/0121): la última fila de cambios con
  -- desde <= fecha_fin; sin cambios, las del contrato. Una tarifa nula en el cambio sigue la anterior.
  select * into c from sueldo_acuerdo_cambios where acuerdo_id = a.id and desde <= a.fecha_fin order by desde desc limit 1;
  v_mod    := coalesce(c.modalidad, a.modalidad);
  v_cada   := case when c.id is not null then c.cada_dias else a.cada_dias end;
  -- Tarifa: la última NO nula entre los cambios con desde <= fecha_fin (nula = «sigue la anterior»,
  -- igual que el arrastre del core); si ninguno la fija, la del contrato (0172).
  v_tarifa := coalesce(
    (select x.tarifa_hora from sueldo_acuerdo_cambios x
      where x.acuerdo_id = a.id and x.desde <= a.fecha_fin and x.tarifa_hora is not null
      order by x.desde desc limit 1),
    a.tarifa_hora);
  v_cuota  := case when v_tarifa is not null then 0 when c.id is not null then c.sueldo_pactado else a.sueldo_pactado end;

  v_ini := a.fecha_fin + 1;
  -- Meses completos (1-oct a 31-oct → 1 mes): el nuevo dura lo mismo. Si no, los mismos días.
  v_meses := (extract(year from age(a.fecha_fin + 1, a.fecha_inicio)) * 12
              + extract(month from age(a.fecha_fin + 1, a.fecha_inicio)))::int;
  if v_meses >= 1 and (a.fecha_inicio + make_interval(months => v_meses))::date = a.fecha_fin + 1 then
    v_fin := (v_ini + make_interval(months => v_meses))::date - 1;
  else
    v_fin := v_ini + (a.fecha_fin - a.fecha_inicio);
  end if;

  -- Reutiliza la 0167/0149: mismo contrato + horario atómicos y mismas validaciones.
  v_nuevo := sueldo_acuerdo_guardar(
    null,
    jsonb_build_object(
      'empleado_id',         a.empleado_id,
      'fecha_inicio',        v_ini,
      'fecha_fin',           v_fin,
      'modalidad',           v_mod,
      'cada_dias',           v_cada,
      'sueldo_pactado',      v_cuota,
      'tarifa_hora',         v_tarifa,
      'escala',              a.escala,
      'almuerzo_habilitado', a.almuerzo_habilitado,
      'parametros',          a.parametros,
      'creado_por',          auth.uid()
    ),
    coalesce((select jsonb_agg(jsonb_build_object(
                'dia_semana',  t.dia_semana,
                'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
                'hora_fin',    to_char(t.hora_fin, 'HH24:MI'),
                'lugar',       t.lugar) order by t.dia_semana, t.hora_inicio)
              from sueldo_acuerdo_turnos t where t.acuerdo_id = a.id), '[]'::jsonb)
  );

  update sueldo_acuerdos set renueva_a = a.id where id = v_nuevo;
  return v_nuevo;
end;
$fn$;

comment on function sueldo_acuerdo_renovar(uuid) is
  'Crea en borrador el contrato que sigue a p_acuerdo, copiando frecuencia, cuota o tarifa, escala, almuerzo, parámetros y horario (0170). Solo admin.';
revoke execute on function sueldo_acuerdo_renovar(uuid) from public, anon;
grant  execute on function sueldo_acuerdo_renovar(uuid) to authenticated;
