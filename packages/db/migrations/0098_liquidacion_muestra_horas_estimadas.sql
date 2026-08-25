-- 0098_liquidacion_muestra_horas_estimadas.sql — sueldo_entrada nombra qué horas propuso el
-- sistema, no una marca ni una carga a mano
--
-- Implementa docs/superpowers/specs/asistencias/2026-08-25-huellero-decide-por-horario-design.md
-- §3 C-3, la pieza que la 0097 dejó pendiente antes de poder aplicarse (ver el aviso de cabecera
-- de packages/db/migrations/0097_huellero_relleno_estimado_y_falta.sql): con C-3 aplicada, un día
-- sin marca se completa con la hora del turno contratado y DEJA de cortar la liquidación — pero el
-- detalle de la liquidación no decía todavía cuáles de esas horas las puso el sistema. Esta
-- migración cierra esa pieza: no toca la 0097 ni la 0096, sólo hace que `sueldo_entrada` emita la
-- marca que esas dos migraciones ya dejaron escrita en `asistencias.entrada_estimada` /
-- `salida_estimada` (0096) para que el motor (packages/core/src/sueldos.ts, mismo commit) arme una
-- advertencia con las fechas, y la vista previa, el detalle y el comprobante de una liquidación
-- —que ya muestran `advertencias`/`resultado.advertencias`, sin cambios— la muestren solos.
--
-- ZONA CRÍTICA (no-negociable 1). Reemplaza `sueldo_entrada` (misma firma que dejó la 0093:
-- `(p_acuerdo uuid, p_desde date, p_hasta date)`), la RPC que arma la entrada del motor de sueldos.
--
-- QUÉ CAMBIA, y nada más que esto (el resto de la función es una copia literal de la versión
-- vigente en 0093_liquidacion_por_tramos.sql — mismos guards, mismos cortes DATO/PERMISO, mismo
-- horario, mismas ventas, mismos movimientos):
--
--   1) La CTE `dias` agrega dos columnas agregadas con `bool_or()`, agrupadas por `s.fecha` igual
--      que el resto de la CTE. `asistencias` es por (empleado, fecha, turno) — un día con dos
--      tramos (mañana y tarde) es DOS filas — y si SÓLO uno de los dos tiene la hora estimada, el
--      día entero tiene que salir marcado: por eso `bool_or` y no `max`/`bool_and`.
--   2) La CTE `filas` agrega dos claves nuevas al jsonb que ya arma, `entradaEstimada` y
--      `salidaEstimada`, con el mismo tratamiento que ya reciben `horaIngreso`/`horaSalida`/
--      `tramos` para un día declarado 'falta' (se manda `false`, igual que esos otros se mandan en
--      null/vacío): una falta la declaró una persona, no tiene sentido decir que "la hora" de una
--      falta es estimada.
--
-- No se toca ni una línea de los guards, del control de "día sin declarar", del de "día a medio
-- declarar" (0085), del horario, de las ventas, de los movimientos ni de los permisos. Mismo
-- criterio que ya siguió la 0093 con `sueldo_liquidacion_cerrar` (addendum F-2): `create or
-- replace function` sobre la MISMA firma conserva el `revoke`/`grant` que ya tiene la 0093
-- (`revoke ... from public, anon` / `grant ... to authenticated`), así que no hace falta
-- repetirlos acá.
--
-- packages/core/src/sueldos.ts (mismo commit, sin migración): `RegistroAsistencia` gana
-- `entradaEstimada?`/`salidaEstimada?` opcionales — no rompen ningún snapshot congelado antes de
-- esta migración, que nunca tuvo esas claves — y `liquidarPeriodo()` agrega UNA advertencia
-- nombrando las fechas cuando el periodo tiene alguna. Ningún cálculo de plata cambia: la hora
-- estimada ya viajaba en `horaIngreso`/`horaSalida` como cualquier otra desde la 0096/0097 y se
-- pagaba igual — esto sólo la nombra. `MOTOR_VERSION` no sube por esta razón (ver su comentario en
-- sueldos.ts): no cambió ningún número que le llega a alguien.
--
-- Idempotente: `create or replace function` sobre una firma que ya existe.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5). Esta migración no agrega ningún parámetro
--     nuevo: sólo expone datos que la 0096/0097 ya escriben.
--
-- Prueba: packages/db/pruebas/0098_liquidacion_muestra_horas_estimadas.prueba.sql

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
    -- Precedencia de la spec §5: default del core ← config global ← override del contrato.
    'parametros',   private.sueldo_parametros_config() || a.parametros
  );
end;
$function$;

comment on function public.sueldo_entrada(uuid, date, date) is
  'Arma la EntradaLiquidacion de packages/core/src/sueldos.ts para el TRAMO p_desde..p_hasta de un
   acuerdo (no necesariamente el acuerdo completo: 2026-08-24-liquidacion-por-tramos-design.md).
   Corta nombrando las fechas si algún día contratado quedó sin declarar, y corta también si el
   rango pedido se sale de los bordes del acuerdo o si p_hasta es anterior a p_desde. Desde la
   0098, cada día de asistencia/horasFueraDeContrato lleva además entradaEstimada/salidaEstimada
   (bool_or por fecha): true cuando la hora la propuso el sistema con el horario contratado
   (0096/0097) y no salió de una marca ni de una carga a mano.';
