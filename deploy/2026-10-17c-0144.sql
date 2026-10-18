-- Release 2026-10-17c (complemento): solo la migración 0144. Aplicar DESPUÉS de deploy/2026-10-17c.sql. Idempotente. NO registra en schema_migrations.
begin;

-- ===== 0144_ventas_asistencia_periodo_cerrado.sql =====
-- 0144_ventas_asistencia_periodo_cerrado.sql — ventas y tardanzas con fecha en un período cerrado
-- se suman al SIGUIENTE período abierto de la persona (decisión del dueño, opción a). Nunca quedan
-- huérfanas y nunca tocan lo ya pagado.
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-ventas-asistencia-periodo-cerrado-design.md
-- Prueba: packages/db/pruebas/0144_ventas_asistencia_periodo_cerrado.prueba.sql (escrita antes).
-- Reutiliza private.sueldo_estado_fecha y private.sueldo_siguiente_abierto de la 0136.
-- ZONA CRÍTICA (cadena del sueldo). Idempotente. No agrega ningún parámetro de negocio.

alter table sueldo_ventas add column if not exists fecha_original date;

create or replace function private.sueldo_mes_es(p_fecha date) returns text language sql immutable as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])
         [extract(month from p_fecha)::int] || ' de ' || extract(year from p_fecha)::int
$$;

-- ═══ 1) Ventas ══════════════════════════════════════════════════════════════════════════════════
-- Fecha efectiva de una carga: la misma si el período está abierto; el primer día del siguiente período
-- abierto si está cerrado o sin contrato; error PERIODO: si no hay siguiente. Devuelve {fecha, original, aviso}.
create or replace function private.sueldo_fecha_efectiva(p_empleado uuid, p_fecha date, p_que text)
  returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $fn$
declare st jsonb; v_estado text; v_sig date;
begin
  -- Carrera con el cierre (como la 0136): si un borrador cubre la fecha, esperar a que termine un cierre en
  -- curso (el cierre lo bloquea `for update`) y recién entonces mirar el estado.
  perform 1 from sueldo_liquidaciones
   where empleado_id = p_empleado and estado = 'borrador' and p_fecha between periodo_desde and periodo_hasta
   for share;
  st := private.sueldo_estado_fecha(p_empleado, p_fecha);
  v_estado := st->>'estado';
  if v_estado = 'abierto' then
    return jsonb_build_object('fecha', p_fecha, 'original', null, 'aviso', null);
  end if;
  v_sig := private.sueldo_siguiente_abierto(p_empleado, p_fecha);
  if v_sig is null then
    raise exception 'PERIODO:% no tiene un período siguiente abierto: crea el contrato siguiente o anula el cierre; no se guardó nada',
      initcap(private.sueldo_mes_es(p_fecha));
  end if;
  -- Lo mismo con el período destino: si se cerró mientras tanto, no se guarda nada.
  perform 1 from sueldo_liquidaciones
   where empleado_id = p_empleado and estado = 'borrador' and v_sig between periodo_desde and periodo_hasta
   for share;
  if private.sueldo_estado_fecha(p_empleado, v_sig)->>'estado' <> 'abierto' then
    raise exception 'PERIODO:el período siguiente se cerró mientras tanto; vuelve a intentarlo; no se guardó nada';
  end if;
  return jsonb_build_object('fecha', v_sig, 'original', p_fecha,
    'aviso', case v_estado when 'cerrado'
        then initcap(private.sueldo_mes_es(p_fecha)) || ' ya está pagado: ' || p_que || ' se sumó al período que empieza el '
        else 'El ' || to_char(p_fecha, 'DD/MM/YYYY') || ' no tiene contrato: ' || p_que || ' se sumó al período que empieza el ' end
      || to_char(v_sig, 'DD/MM/YYYY'));
end;
$fn$;
revoke execute on function private.sueldo_fecha_efectiva(uuid, date, text) from public, anon;
grant  execute on function private.sueldo_fecha_efectiva(uuid, date, text) to authenticated;

create or replace function public.sueldo_venta_crear(
  p_fecha date, p_monto numeric, p_tipo text, p_sede text, p_empleado uuid, p_vendedor_externo text default null
) returns jsonb language plpgsql volatile security invoker set search_path = public
as $fn$
declare ef jsonb; v_fecha date := p_fecha; v_orig date; v_id uuid;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador carga ventas';
  end if;
  if p_empleado is not null then
    ef := private.sueldo_fecha_efectiva(p_empleado, p_fecha, 'la venta');
    v_fecha := (ef->>'fecha')::date;
    v_orig  := (ef->>'original')::date;
  end if;
  insert into sueldo_ventas (origen, fecha, fecha_original, monto, tipo, sede_cod, empleado_id, vendedor_externo)
    values ('manual', v_fecha, v_orig, p_monto, coalesce(p_tipo, 'venta'), p_sede, p_empleado, p_vendedor_externo)
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'fecha', v_fecha, 'fecha_original', v_orig, 'aviso', ef->>'aviso');
end;
$fn$;
revoke execute on function public.sueldo_venta_crear(date, numeric, text, text, uuid, text) from public, anon;
grant  execute on function public.sueldo_venta_crear(date, numeric, text, text, uuid, text) to authenticated;

create or replace function public.sueldo_venta_asignar(p_venta uuid, p_empleado uuid)
  returns jsonb language plpgsql volatile security invoker set search_path = public
as $fn$
declare v record; ef jsonb;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador asigna ventas';
  end if;
  select * into v from sueldo_ventas where id = p_venta for update;
  if not found then raise exception 'DATO:la venta no existe'; end if;
  -- Parte de la fecha original (la que tipeó la persona), no de la ya trasladada.
  ef := private.sueldo_fecha_efectiva(p_empleado, coalesce(v.fecha_original, v.fecha), 'la venta');
  update sueldo_ventas
     set empleado_id = p_empleado,
         fecha = (ef->>'fecha')::date,
         fecha_original = case when ef->>'original' is null then null else coalesce(v.fecha_original, v.fecha) end
   where id = p_venta;
  return jsonb_build_object('id', p_venta, 'fecha', ef->>'fecha', 'fecha_original', ef->>'original', 'aviso', ef->>'aviso');
end;
$fn$;
revoke execute on function public.sueldo_venta_asignar(uuid, uuid) from public, anon;
grant  execute on function public.sueldo_venta_asignar(uuid, uuid) to authenticated;

-- Red de seguridad: ninguna venta con vendedor y sin liquidación cae en un período cerrado o sin contrato.
create or replace function private.sueldo_venta_no_en_cerrado() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if new.empleado_id is not null and new.liquidacion_id is null
     and private.sueldo_estado_fecha(new.empleado_id, new.fecha)->>'estado' in ('cerrado', 'sin_contrato') then
    raise exception 'PERIODO_CERRADO:la fecha % está en un período cerrado o sin contrato; usa sueldo_venta_crear y se sumará al siguiente período abierto',
      to_char(new.fecha, 'DD/MM/YYYY');
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_sueldo_venta_no_en_cerrado on sueldo_ventas;
create trigger trg_sueldo_venta_no_en_cerrado before insert or update of fecha, empleado_id on sueldo_ventas
  for each row execute function private.sueldo_venta_no_en_cerrado();

-- ═══ 2) Tardanzas trasladadas ═══════════════════════════════════════════════════════════════════
create table if not exists sueldo_tardanzas_diferidas (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references empleados(id) on delete restrict,
  fecha_original date not null,
  aplicada_en    date not null,
  motivo         text not null,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references empleados(id) on delete set null,
  constraint sueldo_tard_dif_motivo_chk check (length(trim(motivo)) > 0),
  constraint sueldo_tard_dif_fechas_chk check (aplicada_en > fecha_original)
);
-- Una tardanza trasladada por día y persona: el doble clic o un reenvío no descuentan dos veces.
create unique index if not exists uq_sueldo_tard_dif_dia on sueldo_tardanzas_diferidas(empleado_id, fecha_original);
create index if not exists idx_sueldo_tard_dif_emp on sueldo_tardanzas_diferidas(empleado_id, aplicada_en);
alter table sueldo_tardanzas_diferidas enable row level security;
drop policy if exists sueldo_tard_dif_admin on sueldo_tardanzas_diferidas;
create policy sueldo_tard_dif_admin on sueldo_tardanzas_diferidas for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- Congelada: si su fecha de aplicación ya está en un período cerrado, no se toca.
create or replace function private.sueldo_tard_dif_congelada() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare r record;
begin
  r := case when tg_op = 'DELETE' then old else old end;
  if private.sueldo_estado_fecha(r.empleado_id, r.aplicada_en)->>'estado' = 'cerrado' then
    raise exception 'CONGELADA:esa tardanza ya entró en una liquidación cerrada';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;
-- Red de seguridad: aplicada_en no puede caer en un período cerrado o sin contrato (insert o cambio de fecha).
create or replace function private.sueldo_tard_dif_destino_abierto() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if private.sueldo_estado_fecha(new.empleado_id, new.aplicada_en)->>'estado' <> 'abierto' then
    raise exception 'PERIODO_CERRADO:la fecha % no está en un período abierto; usa sueldo_tardanza_diferida_crear',
      to_char(new.aplicada_en, 'DD/MM/YYYY');
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_sueldo_tard_dif_destino on sueldo_tardanzas_diferidas;
create trigger trg_sueldo_tard_dif_destino before insert or update of aplicada_en, empleado_id on sueldo_tardanzas_diferidas
  for each row execute function private.sueldo_tard_dif_destino_abierto();

drop trigger if exists trg_sueldo_tard_dif_congelada on sueldo_tardanzas_diferidas;
create trigger trg_sueldo_tard_dif_congelada before update or delete on sueldo_tardanzas_diferidas
  for each row execute function private.sueldo_tard_dif_congelada();

create or replace function public.sueldo_tardanza_diferida_crear(p_empleado uuid, p_fecha date, p_motivo text)
  returns jsonb language plpgsql volatile security invoker set search_path = public
as $fn$
declare ef jsonb; v_id uuid; v_motivo text := trim(coalesce(p_motivo, ''));
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador carga tardanzas';
  end if;
  if v_motivo = '' then raise exception 'DATO:el motivo es obligatorio'; end if;
  -- Si el día ya tiene asistencia cargada, ya se liquidó con ella: se corrige allí («Corregir»), no se traslada.
  if exists (select 1 from asistencias s where s.empleado_id = p_empleado and s.fecha = p_fecha
                and s.condicion in ('trabajado', 'falta')) then
    raise exception 'DATO:el % ya tiene la asistencia cargada; corrígela con «Corregir» en vez de trasladar la tardanza',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;
  ef := private.sueldo_fecha_efectiva(p_empleado, p_fecha, 'la tardanza');
  if ef->>'original' is null then
    raise exception 'DATO:el % está en un período abierto: cárgala en la asistencia del día', to_char(p_fecha, 'DD/MM/YYYY');
  end if;
  insert into sueldo_tardanzas_diferidas (empleado_id, fecha_original, aplicada_en, motivo, creado_por)
    values (p_empleado, p_fecha, (ef->>'fecha')::date, v_motivo, auth.uid())
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'aplicada_en', ef->>'fecha', 'fecha_original', p_fecha, 'aviso', ef->>'aviso');
end;
$fn$;
revoke execute on function public.sueldo_tardanza_diferida_crear(uuid, date, text) from public, anon;
grant  execute on function public.sueldo_tardanza_diferida_crear(uuid, date, text) to authenticated;

-- ═══ 3) sueldo_entrada — cuerpo de la 0126 con `tardanzasDiferidas` ═════════════════════════════
create or replace function public.sueldo_entrada(p_acuerdo uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  a          record;
  v_faltan   text;
  v_mixtos   text;
  v_horario  jsonb;
  v_asist    jsonb;
  v_fuera    jsonb;
  v_ventas   jsonb;
  v_meses    jsonb;
  v_par      jsonb;
  v_tard_dif int;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede liquidar';
  end if;

  select * into a from sueldo_acuerdos where id = p_acuerdo;
  if not found then
    raise exception 'DATO:el acuerdo no existe o no es visible';
  end if;

  -- ── El rango pedido tiene que ser válido y caer DENTRO del acuerdo (C-2, spec §3) ───────────
  -- El trigger sueldo_liq_coherente (0072) ya lo comprobaría al insertar la liquidación, pero
  -- cortar acá, antes de armar todo el jsonb, da un mensaje mejor y más rápido — mismo criterio
  -- que ya usa esta función para sus otros cortes.
  if p_hasta < p_desde then
    raise exception 'DATO:el rango pedido no es válido: % es anterior a %', p_hasta, p_desde;
  end if;
  if p_desde < a.fecha_inicio or p_hasta > a.fecha_fin then
    raise exception 'DATO:el rango % a % se sale del acuerdo, que va de % a %',
      p_desde, p_hasta, a.fecha_inicio, a.fecha_fin;
  end if;

  if not exists (select 1 from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo) then
    raise exception 'DATO:el acuerdo no tiene horario cargado; sin horas contratadas no hay nada que liquidar';
  end if;

  -- ── El control que evita liquidar faltas inventadas ──────────────────────────────────────
  -- Todo día del RANGO PEDIDO (ya no del acuerdo completo: C-2) que caiga en un día con turno
  -- contratado tiene que tener su fila de asistencia DECLARADA. 'sin_dato' no cuenta: significa
  -- que nadie cargó nada, y mandarlo al motor con la hora en null lo convertiría en una falta de
  -- dos días de sueldo.
  select string_agg(to_char(d.dia, 'YYYY-MM-DD'), ', ' order by d.dia)
    into v_faltan
  from generate_series(p_desde, p_hasta, interval '1 day') as d(dia)
  where exists (
          select 1 from sueldo_acuerdo_turnos t
          where t.acuerdo_id = p_acuerdo and t.dia_semana = extract(isodow from d.dia)
        )
    and not exists (
          select 1 from asistencias s
          where s.empleado_id = a.empleado_id
            and s.fecha = d.dia::date
            and s.condicion <> 'sin_dato'
        );

  if v_faltan is not null then
    raise exception 'DATO:falta declarar la asistencia de %; ningún día contratado puede quedar sin cargar',
      v_faltan;
  end if;

  -- ── El control del día a medio declarar (0085) ───────────────────────────────────────────
  -- El de arriba mira si el día tiene ALGUNA fila declarada. Éste mira si le falta ALGUNA. Desde
  -- que el huellero escribe una fila por tramo, un día puede tener las dos cosas: la mañana
  -- emparejada y la tarde con la entrada puesta y la salida en null, esperando que alguien diga a
  -- qué hora se fue.
  --
  -- Sin este control ese día se armaba con un solo tramo y se liquidaba a medias sin avisar. Se
  -- corta acá, con el mismo prefijo `DATO:` que usa el resto, para que la pantalla lo muestre igual
  -- que a un día sin cargar y el administrador lo resuelva antes de pagar.
  --
  -- Se miran TODOS los días del RANGO PEDIDO con filas, contratados o no: un tramo trabajado fuera
  -- del horario pactado también se paga (RN-17), así que perderlo en silencio duele lo mismo.
  select string_agg(t.fecha_txt, ', ' order by t.fecha_txt)
    into v_mixtos
  from (
    select to_char(s.fecha, 'YYYY-MM-DD') as fecha_txt
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between p_desde and p_hasta
    group by s.fecha
    having bool_or(s.condicion = 'sin_dato') and bool_or(s.condicion <> 'sin_dato')
  ) t;

  if v_mixtos is not null then
    raise exception 'DATO:hay tramos sin cerrar en %; ese día quedaría pagado a medias', v_mixtos;
  end if;

  -- ── El horario contratado ────────────────────────────────────────────────────────────────
  -- No depende del tramo que se esté liquidando: sigue por acuerdo entero (C-2, "lo que NO cambia").
  select coalesce(jsonb_agg(jsonb_build_object(
           'diaSemana',  t.dia_semana,
           'horaInicio', to_char(t.hora_inicio, 'HH24:MI'),
           'horaFin',    to_char(t.hora_fin,    'HH24:MI')
         ) order by t.dia_semana, t.hora_inicio), '[]'::jsonb)
    into v_horario
  from sueldo_acuerdo_turnos t where t.acuerdo_id = p_acuerdo;

  -- ── La asistencia, con los TRAMOS del día (RN-05, C-01) ─────────────────────────────
  -- El grano de la tabla es (empleado, fecha, turno) y cada fila con sus dos horas es un tramo
  -- continuo. Antes se colapsaban con min(entrada)/max(salida) y el hueco del medio se pagaba.
  --
  -- Acá NO se ordena, ni se fusiona, ni se aplica el umbral de pausa: eso vive entero en
  -- packages/core/src/sueldos.ts, en un solo lugar. Es la única forma de que un día cargado a mano
  -- por el administrador y un día derivado del huellero se paguen exactamente igual. Esta función
  -- entrega el dato crudo y nada más.
  --
  -- Se sigue emitiendo el par de punta a punta: la tardanza (RN-08) se mide contra el primer
  -- ingreso, y un snapshot guardado antes de esta migración tiene que seguir leyéndose igual.
  --
  -- Se separan los días CON turno contratado (asistencia) de los que no lo tienen
  -- (horasFueraDeContrato, RN-17): el motor los cobra distinto.
  with dias as (
    select
      s.fecha,
      min(s.hora_entrada)                                as entrada,
      max(s.hora_salida)                                 as salida,
      bool_or(s.condicion = 'falta')                     as es_falta,
      bool_or(s.tardanza_justificada)                    as tardanza_just,
      bool_or(s.falta_justificada)                       as falta_just,
      max(s.motivo_justificacion)                        as motivo,
      -- Migración 0098: si CUALQUIER tramo del día tiene la entrada o la salida puesta por el
      -- sistema (0096/0097), el día entero sale marcado — un día con dos tramos donde sólo uno
      -- está estimado no puede salir "limpio" sólo porque el otro tramo sí tiene marca real.
      bool_or(s.entrada_estimada)                        as entrada_estimada,
      bool_or(s.salida_estimada)                         as salida_estimada,
      -- Un tramo por fila. El `filter` deja fuera las filas sin ninguna de las dos horas: eso no
      -- es un tramo, es una declaración de falta o una fila que alguien creó y no completó.
      coalesce(jsonb_agg(jsonb_build_object(
        'ingreso', to_char(s.hora_entrada, 'HH24:MI'),
        'salida',  to_char(s.hora_salida,  'HH24:MI')
      ) order by s.hora_entrada nulls last, s.turno)
      filter (where s.hora_entrada is not null or s.hora_salida is not null), '[]'::jsonb) as tramos,
      exists (
        select 1 from sueldo_acuerdo_turnos t
        where t.acuerdo_id = p_acuerdo and t.dia_semana = extract(isodow from s.fecha)
      )                                                  as contratado
    from asistencias s
    where s.empleado_id = a.empleado_id
      and s.fecha between p_desde and p_hasta
      and s.condicion <> 'sin_dato'
    group by s.fecha
  ),
  filas as (
    select contratado, jsonb_build_object(
      'fecha',      to_char(fecha, 'YYYY-MM-DD'),
      -- Una falta se DECLARA con el ingreso en null. Si la condición dice 'falta', se manda null
      -- aunque haya quedado una hora suelta de una carga anterior.
      'horaIngreso', case when es_falta then null else to_char(entrada, 'HH24:MI') end,
      'horaSalida',  case when es_falta then null else to_char(salida,  'HH24:MI') end,
      -- Los tramos de un día declarado 'falta' no se emiten: una falta se declara con el ingreso
      -- en null, y mandar tramos además sería contradecirla con el dato de una carga anterior.
      'tramos',      case when es_falta then '[]'::jsonb else tramos end,
      'tardanzaJustificada', tardanza_just,
      'faltaJustificada',    falta_just,
      'motivoJustificacion', motivo,
      -- Migración 0098: mismo tratamiento que horaIngreso/horaSalida para un día 'falta' — la
      -- declaró una persona, así que no hay ninguna hora "estimada" que nombrar ese día.
      'entradaEstimada', case when es_falta then false else entrada_estimada end,
      'salidaEstimada',  case when es_falta then false else salida_estimada end
    ) as fila, fecha
    from dias
  )
  select
    coalesce(jsonb_agg(fila order by fecha) filter (where contratado),     '[]'::jsonb),
    coalesce(jsonb_agg(fila order by fecha) filter (where not contratado), '[]'::jsonb)
    into v_asist, v_fuera
  from filas;

  -- ── Las ventas del RANGO PEDIDO que todavía no consumió ninguna liquidación ──────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha',    to_char(v.fecha, 'YYYY-MM-DD'),
           'monto',    v.monto,
           'tipo',     v.tipo,
           'tiendaId', v.sede_cod
         ) order by v.fecha), '[]'::jsonb)
    into v_ventas
  from sueldo_ventas v
  where v.empleado_id = a.empleado_id
    and v.fecha between p_desde and p_hasta
    and v.liquidacion_id is null;

  -- ── 0144: tardanzas de días de períodos cerrados que se trasladaron a este tramo ───────────
  select count(*)::int into v_tard_dif
  from sueldo_tardanzas_diferidas t
  where t.empleado_id = a.empleado_id
    and t.aplicada_en between p_desde and p_hasta;

  -- ── Los puntos de los MESES DEL CONTRATO que cierran en el tramo (0126, spec §8.2) ─────────
  -- Un mes del contrato va del día de inicio al día anterior al mismo día del mes siguiente. Se
  -- calcula SIEMPRE desde fecha_inicio (ws_k = fecha_inicio + k meses): Postgres recorta a fin de
  -- mes (31-ene + 1 mes = 28-feb) y encadenar mes a mes derivaría el día. El mes k termina en
  -- we_k = ws_(k+1) − 1 y su último día efectivo es e_k = least(we_k, fin del contrato). Se paga,
  -- completo, en el tramo que contiene e_k; los demás tramos reciben `[]`.
  --
  -- «Activo» se decide con los parámetros EFECTIVOS DEL CONTRATO (los mismos que viajan en
  -- `parametros`): las dos claves numéricas. Un `null` del contrato (JSON null) gana a la
  -- configuración y apaga el pago aunque /configuracion esté encendida (§8.1). Apagado viaja
  -- `null`: la liquidación de hoy no depende de la evaluación y la clave no cambia entre cálculos.
  --
  -- Los puntos de cada mes son `puntosTotal` de evaluacion_componentes_datos, a través de
  -- private.sueldo_puntos_periodo (el wrapper exige administrador). Una sola definición de «puntos».
  v_par := private.sueldo_parametros_config() || a.parametros;
  if jsonb_typeof(v_par -> 'puntosMetaMensual') = 'number'
     and jsonb_typeof(v_par -> 'solesPorPunto') = 'number' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'desde',    to_char(m.ws, 'YYYY-MM-DD'),
             'hasta',    to_char(m.e,  'YYYY-MM-DD'),
             'hastaMes', to_char(m.we, 'YYYY-MM-DD'),
             'puntos',   private.sueldo_puntos_periodo(a.empleado_id, m.ws, m.e)
           ) order by m.ws), '[]'::jsonb)
      into v_meses
    from (
      select k.ws, k.we, least(k.we, a.fecha_fin) as e
      from (
        select (a.fecha_inicio + make_interval(months => g.k))::date as ws,
               (a.fecha_inicio + make_interval(months => g.k + 1))::date - 1 as we
        from generate_series(
               0,
               (extract(year from a.fecha_fin)::int - extract(year from a.fecha_inicio)::int) * 12
                 + (extract(month from a.fecha_fin)::int - extract(month from a.fecha_inicio)::int) + 1
             ) as g(k)
      ) k
      where k.ws <= a.fecha_fin
    ) m
    where m.e between p_desde and p_hasta;
  end if;

  -- Los nulls NO se quitan: `horaIngreso: null` ES la declaración de una falta (sueldos.ts:569
  -- lee `== null`), y quien abra este snapshot dentro de un año tiene que verlo.
  return jsonb_build_object(
    'acuerdoId',     a.id,
    'empleadoId',    a.empleado_id,
    -- Antes eran a.fecha_inicio/a.fecha_fin (el acuerdo completo). Ahora son el TRAMO pedido: es
    -- lo que packages/core/src/sueldos.ts usa para diasDelPeriodo()/horasContratadas(), así que
    -- este es el cambio que hace que valorPorHora se calcule contra las horas del tramo, no las
    -- de todo el contrato (spec §2).
    'fechaInicio',   to_char(p_desde, 'YYYY-MM-DD'),
    'fechaFin',      to_char(p_hasta, 'YYYY-MM-DD'),
    'modalidad',     a.modalidad,
    'sueldoPactado', a.sueldo_pactado,
    'horario',       v_horario,
    'asistencia',    v_asist,
    'horasFueraDeContrato', v_fuera,
    'ventas',        v_ventas,
    'tardanzasDiferidas', v_tard_dif,
    'almuerzoHabilitadoPorAdmin', a.almuerzo_habilitado,
    -- Los tres tipos de PLATA van como lista; los dos de CONTEO van como número. Es la distinción
    -- que la 0072 hizo excluyente con sueldo_mov_unidad_chk. Los cinco, ahora acotados al TRAMO
    -- pedido (p_desde..p_hasta) y no al acuerdo completo: si no, liquidar julio y agosto por
    -- separado contaría el mismo adelanto, la misma venta consumida o el mismo almuerzo dos veces.
    'adelantos',    private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'adelanto'),
    'reportes',     private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'reporte'),
    'bonosExtras',  private.sueldo_movimientos_lista(a.empleado_id, p_desde, p_hasta, 'bono_extra'),
    'almuerzosEntregados', private.sueldo_movimientos_conteo(a.empleado_id, p_desde, p_hasta, 'almuerzo_entregado'),
    'personasCapacitadas', private.sueldo_movimientos_conteo(a.empleado_id, p_desde, p_hasta, 'capacitacion'),
    -- 0126: puntos de cada mes del contrato que cierra en este tramo, para el «Bono por puntos».
    -- Reemplaza a `puntosPeriodo` (0117). Viaja dentro de la entrada guardada de la liquidación,
    -- así el cierre que compara «datos actuales» también ve si cambiaron.
    'puntosMeses',  v_meses,
    -- Precedencia de la spec §5: default del core ← config global ← override del contrato.
    'parametros',   private.sueldo_parametros_config() || a.parametros
  );
end;
$function$;

commit;
