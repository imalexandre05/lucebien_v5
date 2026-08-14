-- 0068_sueldos_esquema.sql — Capa de datos del sistema de sueldos.
--
-- Implementa docs/superpowers/specs/sueldos/SPEC-esquema-sueldos.md §4 (modelo), §5 (parámetros),
-- §6 (congelado) y §7 (aislamiento). Es donde se guarda lo que calcula
-- packages/core/src/sueldos.ts.
--
-- ZONA CRÍTICA (CLAUDE.md no-negociable 1 y 3): estas tablas guardan cuánto cobra una persona
-- real, y el no-negociable 3 dice que nadie ve el sueldo de otro. Toda tabla nueva sale con RLS
-- activa y con policy de lectura Y de escritura desde esta misma migración.
--
-- SIN RPC A PROPÓSITO. Las tres RPC de la spec §8 (sueldo_entrada, sueldo_liquidacion_cerrar,
-- sueldo_liquidacion_anular) van en la 0069, para que este diff se pueda revisar entero.
--
-- Idempotente: se puede reaplicar sin fallar. Cada `create` lleva su `if not exists` y cada
-- restricción que no lo soporta va envuelta en un `do $$ ... $$` que consulta pg_constraint.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 0) Las dos piezas de Postgres que el diseño necesita y no existen todavía
--    Verificado contra scilb el 14-ago-2026: btree_gist no estaba instalada y `timerange` no
--    existía. Postgres trae int4range/numrange/daterange/tsrange/tstzrange y NINGUNO de `time`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- btree_gist: sin ella, `exclude using gist (empleado_id with =, ...)` falla, porque gist no sabe
-- comparar un uuid ni un int por igualdad. Va al schema `extensions`, que es donde Supabase pone
-- las suyas; si ese schema no existiera, cae al default.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'btree_gist') then
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      execute 'create extension btree_gist with schema extensions';
    else
      execute 'create extension btree_gist';
    end if;
  end if;
end $$;

-- timerange: el tipo de rango de horas que necesita el solape de turnos dentro del día.
-- `create type` no admite `if not exists`, de ahí el envoltorio.
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'timerange' and n.nspname = 'public'
  ) then
    execute 'create type public.timerange as range (subtype = time)';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) sueldo_acuerdos — la unidad (spec §4.1)
--    Lo pactado con una persona para un periodo concreto. Todo lo demás cuelga de acá, y eso es
--    lo que hace que el congelado salga casi gratis.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists sueldo_acuerdos (
  id             uuid primary key default gen_random_uuid(),
  -- on delete restrict: un acuerdo pagado no se borra junto con la persona. La spec §9.bis lo
  -- dice explícito — cuando alguien deja de trabajar se SUSPENDE, nunca se elimina.
  empleado_id    uuid not null references empleados(id) on delete restrict,
  fecha_inicio   date not null,
  fecha_fin      date not null,
  modalidad      text not null default 'mensual',
  -- Input manual. NO se deriva de empleados.salario_base: ese es el salario de referencia de la
  -- evaluación mensual, y mezclarlos haría que editar la ficha de alguien cambie un pago pasado.
  sueldo_pactado numeric(12,2) not null,
  escala         int,
  -- Overrides de este colaborador sobre los parámetros globales (spec §5). Acá vive la tolerancia
  -- por contrato que pidió Alexander, y `metaSemanal`, que no puede vivir en `config` porque su
  -- null es significativo ("no hay meta pactada, sugerila") y config.valor es text.
  parametros     jsonb not null default '{}'::jsonb,
  estado         text not null default 'borrador',
  creado_en      timestamptz not null default now(),
  creado_por     uuid references empleados(id) on delete set null,

  constraint sueldo_acuerdos_fechas_chk    check (fecha_fin >= fecha_inicio),
  -- Sin 'diario': el contrato mínimo es de un mes (Alexander, 14-ago-2026) y ModalidadPago del
  -- motor (sueldos.ts:146) es 'mensual' | 'semanal'. La base acepta exactamente lo mismo que el
  -- motor, para que no exista una fila insertable por PostgREST que después no se pueda liquidar.
  constraint sueldo_acuerdos_modalidad_chk check (modalidad in ('mensual', 'semanal')),
  constraint sueldo_acuerdos_pactado_chk   check (sueldo_pactado >= 0),
  constraint sueldo_acuerdos_escala_chk    check (escala is null or escala between 1 and 5),
  constraint sueldo_acuerdos_estado_chk    check (estado in ('borrador', 'vigente', 'liquidado')),
  constraint sueldo_acuerdos_parametros_chk check (jsonb_typeof(parametros) = 'object'),
  constraint sueldo_acuerdos_emp_inicio_uniq unique (empleado_id, fecha_inicio)
);

-- Dos acuerdos vigentes que se pisan significan dos sueldos pactados para el mismo día. La base
-- lo impide, no la pantalla.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sueldo_acuerdos_sin_solape') then
    alter table sueldo_acuerdos add constraint sueldo_acuerdos_sin_solape
      exclude using gist (
        empleado_id with =,
        daterange(fecha_inicio, fecha_fin, '[]') with &&
      );
  end if;
end $$;

create index if not exists idx_sueldo_acuerdos_empleado on sueldo_acuerdos(empleado_id, fecha_inicio desc);

comment on table sueldo_acuerdos is
  'Lo pactado con una persona para un periodo. Es también la tabla del módulo de contratos
   (SPEC-esquema-sueldos.md §9.bis): un contrato ES un acuerdo de periodo.';
comment on column sueldo_acuerdos.parametros is
  'Overrides de ParametrosSueldo para esta persona y este periodo. Cuelga del acuerdo y no de la
   persona a propósito: un override sin periodo se retroaplica y cambiaría un pago ya emitido.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) sueldo_acuerdo_turnos — el horario contratado (spec §4.2, resuelve el bloqueante B-01)
--    Antes de esto no existía NINGUNA tabla de horario contratado en las 67 migraciones. Sin
--    horas contratadas, valor_por_hora = sueldo / 0 y no hay nada que liquidar.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists sueldo_acuerdo_turnos (
  id          uuid primary key default gen_random_uuid(),
  acuerdo_id  uuid not null references sueldo_acuerdos(id) on delete cascade,
  dia_semana  int  not null,   -- 1 = lunes … 7 = domingo, igual que TurnoContratado del core
  hora_inicio time not null,
  hora_fin    time not null,
  lugar       text,            -- informativo: en qué sede se cumple ese turno

  constraint sueldo_turnos_dia_chk   check (dia_semana between 1 and 7),
  constraint sueldo_turnos_horas_chk check (hora_fin > hora_inicio)
);

-- El motor ya rechaza turnos solapados, pero un insert por PostgREST no pasa por el motor. Y el
-- efecto es caro: dos turnos que se pisan inflan las horas contratadas y HUNDEN el valor por hora
-- de todo el periodo — con el horario real de LuceBien basta un tipeo para que el pago del mes
-- caiga a menos de la mitad.
--
-- El intervalo va '[)' y no '[]': 09:00-13:00 y 13:00-20:00 es el horario que la empresa usa todos
-- los días. Son contiguos, no solapados. Con '[]' esta restricción rechazaría la realidad.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sueldo_turnos_sin_solape') then
    alter table sueldo_acuerdo_turnos add constraint sueldo_turnos_sin_solape
      exclude using gist (
        acuerdo_id with =,
        dia_semana with =,
        public.timerange(hora_inicio, hora_fin, '[)') with &&
      );
  end if;
end $$;

create index if not exists idx_sueldo_turnos_acuerdo on sueldo_acuerdo_turnos(acuerdo_id, dia_semana);

comment on table sueldo_acuerdo_turnos is
  'Plantilla semanal del acuerdo. Cuelga del acuerdo y no de una tabla global de horarios: así el
   versionado sale gratis — cambia el horario, se abre otro acuerdo, y el periodo viejo conserva
   el suyo. Eso es lo que hace que una liquidación congelada siga siendo cierta.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) asistencias — tres columnas prestadas (spec §4.3, resuelve el bloqueante B-02)
--    No se crea una tabla paralela: se extiende la que ya usan los reportes y el huellero.
--
--    El problema que resuelve: hoy la tabla no puede distinguir "faltó" de "nadie cargó el dato".
--    Las 13 filas que existen tienen hora_entrada y hora_salida en NULL, y el motor lee un ingreso
--    nulo como FALTA (sueldos.ts:569). Si la liquidación leyera la tabla tal cual, cobraría 13
--    faltas inventadas a S/2 días de sueldo cada una.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table asistencias add column if not exists condicion            text    not null default 'sin_dato';
alter table asistencias add column if not exists tardanza_justificada boolean not null default false;
alter table asistencias add column if not exists falta_justificada    boolean not null default false;
alter table asistencias add column if not exists motivo_justificacion text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'asistencias_condicion_chk') then
    alter table asistencias add constraint asistencias_condicion_chk
      check (condicion in ('sin_dato', 'trabajado', 'falta', 'descanso', 'licencia'));
  end if;
end $$;

comment on column asistencias.condicion is
  'sin_dato (default) = NADIE CARGÓ NADA. La liquidación corta con error si un día contratado del
   periodo está así; nunca se asume que no vino. falta = declaración explícita del administrador,
   y sólo eso alimenta RN-09. Las 13 filas que existían al crear la columna quedan en sin_dato,
   que es exactamente lo que son.';
comment on column asistencias.motivo_justificacion is
  'Por qué se justificó la tardanza o la falta. Sin esto, "justificada" es una casilla sin rastro.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) sueldo_movimientos — adelantos, descuentos y bonos (spec §4.4)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists sueldo_movimientos (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references empleados(id) on delete restrict,
  fecha          date not null,
  tipo           text not null,
  -- monto > 0 NO es un detalle: el verificador encontró que un adelanto tipeado en negativo
  -- invertía la línea, de descontar S/100 a SUMAR S/100. El signo lo pone la regla, no el dato.
  monto          numeric(12,2) not null,
  motivo         text not null,
  -- Sello: qué liquidación lo consumió. Con sello, la fila es intocable (trigger de §6).
  liquidacion_id uuid,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references empleados(id) on delete set null,

  constraint sueldo_mov_tipo_chk   check (tipo in ('adelanto', 'reporte', 'bono_extra', 'capacitacion', 'almuerzo_entregado')),
  constraint sueldo_mov_monto_chk  check (monto > 0),
  constraint sueldo_mov_motivo_chk check (length(trim(motivo)) > 0)
);

create index if not exists idx_sueldo_mov_empleado_fecha on sueldo_movimientos(empleado_id, fecha);
create index if not exists idx_sueldo_mov_liquidacion    on sueldo_movimientos(liquidacion_id) where liquidacion_id is not null;

comment on table sueldo_movimientos is
  'Una sanción se corrige mientras el mes esté abierto, y después ya no (decisión de Alexander,
   14-ago-2026). No hay columnas de revocación: con el periodo abierto el administrador edita o
   borra la fila, y una vez cerrada la liquidación el sello liquidacion_id la vuelve intocable.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) sueldo_ventas — la frontera con el sistema del otro programador (spec §4.5)
--    Tabla espejo. Nada en apps/erp-web sabe que existe tuxedo.spk.com.pe: no hay fetch, no hay
--    tipo compartido, no hay timeout que pueda dejar a alguien sin liquidar.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists sueldo_ventas (
  id               uuid primary key default gen_random_uuid(),
  -- 'manual' es un origen más, no un caso degradado: hoy el administrador carga las boletas a
  -- mano, y el día que exista la API se da de alta otro origen sin migrar nada.
  origen           text not null default 'manual',
  clave_externa    text,
  fecha            date not null,
  -- El TOTAL de la boleta, no un producto (RN-13 mira el monto de la boleta contra el mínimo).
  monto            numeric(12,2) not null,
  tipo             text not null default 'venta',
  sede_cod         text,
  -- null = sin asignar. Las comisiones son individuales y los colaboradores rotan entre tiendas,
  -- así que la venta tiene que saber quién la hizo. Cuando el origen mande un vendedor que no se
  -- puede mapear, la fila se guarda igual y aparece en una cola: NADA se descarta en silencio.
  empleado_id      uuid references empleados(id) on delete restrict,
  vendedor_externo text,
  payload          jsonb,
  liquidacion_id   uuid,
  creado_en        timestamptz not null default now(),

  constraint sueldo_ventas_monto_chk check (monto >= 0),
  constraint sueldo_ventas_tipo_chk  check (tipo in ('venta', 'alquiler'))
);

-- Idempotencia de la importación: reimportar el mismo lote no duplica ni infla una comisión.
create unique index if not exists uq_sueldo_ventas_origen_clave
  on sueldo_ventas(origen, clave_externa) where clave_externa is not null;

create index if not exists idx_sueldo_ventas_empleado_fecha on sueldo_ventas(empleado_id, fecha);
create index if not exists idx_sueldo_ventas_sin_asignar    on sueldo_ventas(fecha) where empleado_id is null;
create index if not exists idx_sueldo_ventas_liquidacion    on sueldo_ventas(liquidacion_id) where liquidacion_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) sueldo_liquidaciones — el resultado congelado (spec §4.6)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists sueldo_liquidaciones (
  id                uuid primary key default gen_random_uuid(),
  acuerdo_id        uuid not null references sueldo_acuerdos(id) on delete restrict,
  -- Desnormalizado a propósito: la policy de lectura lo necesita sin join.
  empleado_id       uuid not null references empleados(id) on delete restrict,
  periodo_desde     date not null,
  periodo_hasta     date not null,
  estado            text not null default 'borrador',

  -- Los tres snapshots. Se guardan los tres y no sólo el total porque el total es la suma de 12
  -- líneas YA REDONDEADAS (sueldos.ts:845-852): no es un número al que se llegue de otra forma. Y
  -- el detalle de cada línea contiene cifras irreconstruibles ("10 tardanzas − 3 libres − 4
  -- justificadas", el valor por hora a 4 decimales). Mismo criterio que
  -- evaluaciones_mensuales.pesos_usados.
  entrada           jsonb not null,   -- la EntradaLiquidacion exacta que se le pasó al motor
  parametros_usados jsonb not null,   -- los 14 valores ya resueltos por resolverParametros()
  resultado         jsonb not null,   -- la Liquidacion completa: líneas, semanas, advertencias

  -- Escalares para listar y sumar sin abrir el jsonb.
  total             numeric(12,2) not null,
  subtotal          numeric(12,2),
  ingresos          numeric(12,2),
  descuentos        numeric(12,2),
  ajustes           numeric(12,2),
  -- numeric(14,6) y no (10,2): el propio motor advierte que redondear el valor por hora a 3,64
  -- mueve el total unos S/0,06 (sueldos.ts:19-22). Es la única cifra que no se redondea.
  valor_por_hora    numeric(14,6) not null,
  motor_version     text not null,

  cerrada_en        timestamptz,
  cerrada_por       uuid references empleados(id) on delete set null,
  anulada_en        timestamptz,
  anulada_por       uuid references empleados(id) on delete set null,
  anulada_motivo    text,

  creado_en         timestamptz not null default now(),

  constraint sueldo_liq_estado_chk  check (estado in ('borrador', 'cerrada', 'anulada')),
  constraint sueldo_liq_periodo_chk check (periodo_hasta >= periodo_desde),
  -- Anular sin motivo es perder el rastro de por qué se anuló.
  constraint sueldo_liq_anulacion_chk check (
    estado <> 'anulada' or coalesce(length(trim(anulada_motivo)), 0) > 0
  ),
  constraint sueldo_liq_acuerdo_uniq unique (acuerdo_id)
);

create index if not exists idx_sueldo_liq_empleado on sueldo_liquidaciones(empleado_id, periodo_desde desc);
create index if not exists idx_sueldo_liq_estado   on sueldo_liquidaciones(estado, periodo_desde desc);

-- Las claves foráneas del sello, ahora que la tabla existe.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sueldo_mov_liquidacion_fk') then
    alter table sueldo_movimientos add constraint sueldo_mov_liquidacion_fk
      foreign key (liquidacion_id) references sueldo_liquidaciones(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sueldo_ventas_liquidacion_fk') then
    alter table sueldo_ventas add constraint sueldo_ventas_liquidacion_fk
      foreign key (liquidacion_id) references sueldo_liquidaciones(id) on delete restrict;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7) sueldo_liquidacion_lineas — el desglose consultable (spec §4.7)
--    Duplicación consciente de lo que ya está en `resultado`. El jsonb prueba qué se pagó; estas
--    filas se ordenan, se filtran y se comparan contra el mes anterior sin desarmar un jsonb en
--    SQL. La pregunta que hay que poder responder es "¿por qué este mes cobré S/40 menos?", y se
--    responde con un SELECT sobre lo congelado, sin recalcular jamás.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists sueldo_liquidacion_lineas (
  id             uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references sueldo_liquidaciones(id) on delete cascade,
  orden          int  not null,
  grupo          text not null,
  concepto       text not null,
  detalle        text not null default '',
  regla          text not null default '',
  monto          numeric(12,2) not null,

  constraint sueldo_linea_grupo_chk check (grupo in ('ingreso', 'descuento', 'ajuste', 'final')),
  constraint sueldo_linea_orden_uniq unique (liquidacion_id, orden)
);

create index if not exists idx_sueldo_lineas_liq on sueldo_liquidacion_lineas(liquidacion_id, orden);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 8) El congelado (spec §6) — TRES triggers, no uno
--    Congelar la cabecera y dejar sueltas sus partes no congela nada. Todos son SECURITY DEFINER
--    porque tienen que bloquear también al administrador y al service_role, que son justamente
--    quienes pueden escribir estas tablas.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- 8.1 La cabecera. Único cambio permitido sobre una cerrada: pasarla a 'anulada' con motivo, sin
--     tocar ninguna otra columna. Corregir el pasado no es reescribirlo: se anula y se emite una
--     liquidación nueva.
create or replace function private.sueldo_liq_inmutable() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado = 'cerrada' then
      raise exception 'CONGELADA:una liquidación cerrada no se borra; anulala con motivo y emití una nueva';
    end if;
    return old;
  end if;

  if old.estado <> 'cerrada' then
    return new;
  end if;

  if new.estado = 'anulada'
     and coalesce(length(trim(new.anulada_motivo)), 0) > 0
     and new.acuerdo_id        is not distinct from old.acuerdo_id
     and new.empleado_id       is not distinct from old.empleado_id
     and new.periodo_desde     is not distinct from old.periodo_desde
     and new.periodo_hasta     is not distinct from old.periodo_hasta
     and new.entrada           is not distinct from old.entrada
     and new.parametros_usados is not distinct from old.parametros_usados
     and new.resultado         is not distinct from old.resultado
     and new.total             is not distinct from old.total
     and new.subtotal          is not distinct from old.subtotal
     and new.ingresos          is not distinct from old.ingresos
     and new.descuentos        is not distinct from old.descuentos
     and new.ajustes           is not distinct from old.ajustes
     and new.valor_por_hora    is not distinct from old.valor_por_hora
     and new.motor_version     is not distinct from old.motor_version
     and new.cerrada_en        is not distinct from old.cerrada_en
     and new.cerrada_por       is not distinct from old.cerrada_por
  then
    return new;
  end if;

  raise exception 'CONGELADA:una liquidación cerrada no se modifica; sólo puede anularse con motivo';
end;
$$;

drop trigger if exists trg_sueldo_liq_inmutable on sueldo_liquidaciones;
create trigger trg_sueldo_liq_inmutable before update or delete on sueldo_liquidaciones
  for each row execute function private.sueldo_liq_inmutable();

-- 8.2 El desglose. Sin esto, el total queda intacto y las líneas que lo justifican se reescriben
--     una por una: el recibo diría una cosa y la suma otra.
create or replace function private.sueldo_linea_inmutable() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_liq uuid := coalesce(new.liquidacion_id, old.liquidacion_id);
begin
  if exists (select 1 from sueldo_liquidaciones l where l.id = v_liq and l.estado = 'cerrada') then
    raise exception 'CONGELADA:el desglose de una liquidación cerrada no se modifica';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sueldo_linea_inmutable on sueldo_liquidacion_lineas;
create trigger trg_sueldo_linea_inmutable before update or delete on sueldo_liquidacion_lineas
  for each row execute function private.sueldo_linea_inmutable();

-- 8.3 Movimientos y ventas sellados. Sin esto se cambia el monto de un adelanto ya cobrado y el
--     recibo impreso deja de coincidir con la base. Una función genérica para las dos tablas.
create or replace function private.sueldo_sellado_inmutable() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- Una fila sellada no se toca de ninguna forma: ni se edita el monto, ni se borra, ni se le
  -- quita el sello. Sellar una fila SIN sello sí se permite: eso es justamente lo que hace el
  -- cierre de la liquidación.
  if old.liquidacion_id is not null then
    raise exception 'CONGELADA:esta fila ya fue liquidada y no se puede %; corregí el mes en curso, no el cerrado',
      lower(TG_OP);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sueldo_mov_sellado on sueldo_movimientos;
create trigger trg_sueldo_mov_sellado before update or delete on sueldo_movimientos
  for each row execute function private.sueldo_sellado_inmutable();

drop trigger if exists trg_sueldo_ventas_sellado on sueldo_ventas;
create trigger trg_sueldo_ventas_sellado before update or delete on sueldo_ventas
  for each row execute function private.sueldo_sellado_inmutable();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 9) Aislamiento y RLS (spec §7) — no-negociable 3: nadie ve el sueldo de otro
--
--    Tres reglas que no se negocian, y las tres tienen su cicatriz:
--    a) SIEMPRE con el prefijo `private.`: los helpers se movieron de schema en la 0037, y copiar
--       las policies de 0025/0028 al pie de la letra hace fallar la migración.
--    b) NUNCA private.app_es_almacen(): devuelve true también para el rol 'confeccionista'
--       (0006_pipeline_rls.sql:22-25). Copiar la policy de `pagos` habría propagado el agujero
--       que la 0067 acaba de cerrar.
--    c) Toda tabla con RLS necesita policy de lectura Y de escritura: una tabla con RLS activa y
--       sólo `select` deja las escrituras bloqueadas EN SILENCIO — es lo que le pasaba a
--       empleado_tiendas hasta la 0067.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Dos helpers para las tablas que no tienen empleado_id propio. Son SECURITY DEFINER a propósito:
-- si la policy consultara la tabla padre directo, la consulta quedaría sujeta a la RLS de esa
-- tabla dentro de la evaluación de otra policy. El helper corta esa dependencia.
create or replace function private.sueldo_acuerdo_es_mio(p_acuerdo uuid)
  returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sueldo_acuerdos a
    where a.id = p_acuerdo and a.empleado_id = auth.uid()
  );
$$;

create or replace function private.sueldo_liquidacion_es_mia(p_liquidacion uuid)
  returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sueldo_liquidaciones l
    where l.id = p_liquidacion and l.empleado_id = auth.uid()
  );
$$;

-- Mismo permisado que los helpers de la 0037 (verificado en pg_proc.proacl): fuera de PUBLIC, y
-- concedido nominalmente. Revocar sin conceder rompería las policies para `authenticated`, porque
-- el permiso por defecto de una función recién creada es justamente el de PUBLIC.
revoke execute on function private.sueldo_acuerdo_es_mio(uuid)     from public, anon;
revoke execute on function private.sueldo_liquidacion_es_mia(uuid) from public, anon;
grant  execute on function private.sueldo_acuerdo_es_mio(uuid)     to authenticated, service_role;
grant  execute on function private.sueldo_liquidacion_es_mia(uuid) to authenticated, service_role;

alter table sueldo_acuerdos            enable row level security;
alter table sueldo_acuerdo_turnos      enable row level security;
alter table sueldo_movimientos         enable row level security;
alter table sueldo_ventas              enable row level security;
alter table sueldo_liquidaciones       enable row level security;
alter table sueldo_liquidacion_lineas  enable row level security;

-- sueldo_acuerdos: cada uno ve su propio contrato. Nadie ve el de otro.
drop policy if exists sueldo_acuerdos_select on sueldo_acuerdos;
create policy sueldo_acuerdos_select on sueldo_acuerdos for select
  using (private.app_es_admin() or empleado_id = auth.uid());
drop policy if exists sueldo_acuerdos_admin on sueldo_acuerdos;
create policy sueldo_acuerdos_admin on sueldo_acuerdos for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- sueldo_acuerdo_turnos: sigue al acuerdo.
drop policy if exists sueldo_turnos_select on sueldo_acuerdo_turnos;
create policy sueldo_turnos_select on sueldo_acuerdo_turnos for select
  using (private.app_es_admin() or private.sueldo_acuerdo_es_mio(acuerdo_id));
drop policy if exists sueldo_turnos_admin on sueldo_acuerdo_turnos;
create policy sueldo_turnos_admin on sueldo_acuerdo_turnos for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- sueldo_movimientos: un adelanto o un descuento es dato de pago de una persona.
drop policy if exists sueldo_mov_select on sueldo_movimientos;
create policy sueldo_mov_select on sueldo_movimientos for select
  using (private.app_es_admin() or empleado_id = auth.uid());
drop policy if exists sueldo_mov_admin on sueldo_movimientos;
create policy sueldo_mov_admin on sueldo_movimientos for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- sueldo_ventas: uno ve las suyas, que son las que le arman la comisión. Las de empleado_id null
-- (la cola de sin asignar) sólo las ve el administrador, que es quien tiene que resolverlas.
drop policy if exists sueldo_ventas_select on sueldo_ventas;
create policy sueldo_ventas_select on sueldo_ventas for select
  using (private.app_es_admin() or empleado_id = auth.uid());
drop policy if exists sueldo_ventas_admin on sueldo_ventas;
create policy sueldo_ventas_admin on sueldo_ventas for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- sueldo_liquidaciones: el aislamiento 1 en su forma más literal.
drop policy if exists sueldo_liq_select on sueldo_liquidaciones;
create policy sueldo_liq_select on sueldo_liquidaciones for select
  using (private.app_es_admin() or empleado_id = auth.uid());
drop policy if exists sueldo_liq_admin on sueldo_liquidaciones;
create policy sueldo_liq_admin on sueldo_liquidaciones for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- sueldo_liquidacion_lineas: sigue a la liquidación. Es el desglose que responde "¿por qué cobré
-- S/40 menos?", así que uno tiene que poder verlo — el suyo.
drop policy if exists sueldo_lineas_select on sueldo_liquidacion_lineas;
create policy sueldo_lineas_select on sueldo_liquidacion_lineas for select
  using (private.app_es_admin() or private.sueldo_liquidacion_es_mia(liquidacion_id));
drop policy if exists sueldo_lineas_admin on sueldo_liquidacion_lineas;
create policy sueldo_lineas_admin on sueldo_liquidacion_lineas for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 10) Auditoría — el trigger genérico de la 0058 sobre las tablas nuevas
--     Se suma `asistencias`: con la columna condicion, declarar un día como falta cuesta dos días
--     de sueldo (RN-09). Es una decisión de plata tanto como editar `pagos`, que está auditada
--     desde la 0058.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_audit_sueldo_acuerdos on sueldo_acuerdos;
create trigger trg_audit_sueldo_acuerdos after insert or update or delete on sueldo_acuerdos
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_sueldo_acuerdo_turnos on sueldo_acuerdo_turnos;
create trigger trg_audit_sueldo_acuerdo_turnos after insert or update or delete on sueldo_acuerdo_turnos
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_sueldo_movimientos on sueldo_movimientos;
create trigger trg_audit_sueldo_movimientos after insert or update or delete on sueldo_movimientos
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_sueldo_ventas on sueldo_ventas;
create trigger trg_audit_sueldo_ventas after insert or update or delete on sueldo_ventas
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_sueldo_liquidaciones on sueldo_liquidaciones;
create trigger trg_audit_sueldo_liquidaciones after insert or update or delete on sueldo_liquidaciones
  for each row execute function private.audit_log_trigger();

drop trigger if exists trg_audit_asistencias on asistencias;
create trigger trg_audit_asistencias after insert or update or delete on asistencias
  for each row execute function private.audit_log_trigger();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 11) Los 13 parámetros globales (spec §5)
--     Son 13 y no 14: meta_semanal NO va acá. Es number | null y el null es significativo ("no
--     hay meta pactada, sugerila"); config.valor es text y la pantalla no puede distinguir null
--     de cadena vacía. Vive sólo en sueldo_acuerdos.parametros.
--
--     `on conflict do nothing`: reaplicar la migración no pisa lo que el administrador ya editó.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('sueldo_tolerancia_minutos',       '10'),
  ('sueldo_tardanzas_libres',         '3'),
  ('sueldo_penalidad_tardanza',       '5'),
  ('sueldo_valor_almuerzo',           '8'),
  ('sueldo_horas_minimas_almuerzo',   '12'),
  ('sueldo_valor_capacitacion',       '25'),
  ('sueldo_bono_meta_semanal',        '30'),
  ('sueldo_factor_meta',              '1'),
  ('sueldo_meta_semanal_fija',        'true'),
  ('sueldo_pct_comision',             '0.02'),
  ('sueldo_monto_minimo_comision',    '120'),
  ('sueldo_dias_descuento_por_falta', '2'),
  -- 1500/33 con todos los dígitos que conserva JavaScript: Number('45.45454545454545') === 1500/33.
  -- Cortarlo en 45.4545 deja la meta del periodo en 7.499,99 en vez de 7.500,00, y ese céntimo
  -- decide si el bono de S/30 se paga o no.
  ('sueldo_meta_por_hora',            '45.45454545454545')
on conflict (clave) do nothing;
