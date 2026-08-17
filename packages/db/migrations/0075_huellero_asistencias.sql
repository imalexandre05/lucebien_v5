-- 0075_huellero_asistencias.sql — el huellero Hikvision escribe en `asistencias`.
--
-- Implementa docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md §5, §6 y §9.
--
-- ZONA CRÍTICA (no-negociable 1). La liquidación lee `asistencias`
-- (0073_sueldos_rpc.sql:177): en cuanto acá se escriba una hora de entrada, esa hora se paga.
--
-- Idempotente: se puede reaplicar sin fallar.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Dispositivos
--
--    La tabla existe desde el día uno aunque hoy haya UN solo huellero: sumar el segundo tiene
--    que ser una fila, no un refactor.
--
--    La contraseña del equipo NO se guarda acá. Vive sólo en el .env de la PC colectora. Esta
--    tabla declara qué equipos existen; las credenciales para hablarles no son dato de negocio.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists dispositivos_huellero (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  sede_cod              text references sedes(cod),
  ip                    text not null,
  activo                boolean not null default true,
  ultima_sincronizacion timestamptz,
  creado_en             timestamptz not null default now()
);

comment on table dispositivos_huellero is
  'Terminales biométricos que alimentan asistencias. La contraseña del equipo NO va acá: vive en
   el .env del colector que corre en la red del equipo.';
comment on column dispositivos_huellero.ultima_sincronizacion is
  'La escribe huellero_registrar_marcas en CADA ciclo, incluso con lote vacío: un ciclo sin
   marcas sigue siendo prueba de que el colector está vivo. Si se atrasa, el colector se cayó.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Mapeo identificador del equipo → empleado, CON VIGENCIA
--
--    Por qué lleva fechas, y no es teórico: el identificador 00000013 marcó como JAZMIN hasta el
--    28-ene-2026 08:45 y como NICOL desde las 20:46 de ESE MISMO DÍA. El equipo reutiliza los
--    números.
--
--    Sin vigencia pasarían dos cosas, las dos de sueldo:
--      · A NICOL se le adjudicarían los 27 días que trabajó JAZMIN.
--      · El día del cambio, la derivación juntaría la entrada de JAZMIN (08:45) con la salida de
--        NICOL (20:46) en una jornada de 12 horas que no trabajó ninguna de las dos.
--
--    Cada marca se resuelve contra el mapeo vigente EN LA FECHA DE LA MARCA, nunca contra el de
--    hoy. El equipo ayuda sin saberlo: cada evento guarda el nombre que la persona tenía en ese
--    momento, así que el histórico conserva de quién era cada marca.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists huellero_mapeos (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null references dispositivos_huellero(id) on delete cascade,
  employee_no    text not null,
  empleado_id    uuid references empleados(id) on delete restrict,
  ignorado       boolean not null default false,
  vigente_desde  date not null,
  vigente_hasta  date,
  nota           text,
  creado_en      timestamptz not null default now()
);

do $$
begin
  -- O apunta a un empleado, o está marcado como ignorado. Nunca ninguna de las dos.
  if not exists (select 1 from pg_constraint where conname = 'huellero_mapeo_destino_chk') then
    alter table huellero_mapeos add constraint huellero_mapeo_destino_chk
      check (ignorado or empleado_id is not null);
  end if;
  -- Un rango al revés es un error de carga que dejaría marcas sin resolver en silencio.
  if not exists (select 1 from pg_constraint where conname = 'huellero_mapeo_rango_chk') then
    alter table huellero_mapeos add constraint huellero_mapeo_rango_chk
      check (vigente_hasta is null or vigente_hasta >= vigente_desde);
  end if;
end $$;

-- Dos mapeos del mismo identificador no pueden solaparse en el tiempo: si se solapan, una misma
-- marca resolvería a dos empleados distintos y el resultado dependería del orden de lectura.
create extension if not exists btree_gist;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'huellero_mapeo_sin_solape') then
    alter table huellero_mapeos add constraint huellero_mapeo_sin_solape
      exclude using gist (
        dispositivo_id with =,
        employee_no    with =,
        daterange(vigente_desde, vigente_hasta, '[]') with &&
      );
  end if;
end $$;

create index if not exists idx_huellero_mapeos_lookup
  on huellero_mapeos(dispositivo_id, employee_no, vigente_desde);

comment on table huellero_mapeos is
  'Qué empleado es cada identificador del equipo, y DESDE CUÁNDO. El equipo reutiliza los números
   (el 00000013 fue JAZMIN y después NICOL), así que un mapeo sin vigencia paga días de una
   persona a otra.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) Marcas crudas
--
--    Se guarda el evento tal como vino, además de la asistencia derivada. Dos razones:
--      · Auditoría: un error de derivación se corrige reprocesando; sin las marcas, el dato
--        original se perdió para siempre.
--      · Decisiones futuras: si el dueño define algún día que el hueco largo del mediodía no se
--        paga, la regla se puede aplicar hacia atrás porque las marcas intermedias siguen acá.
--        Guardando sólo entrada y salida, esa decisión sería irrecuperable.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists marcas_huellero (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null references dispositivos_huellero(id) on delete cascade,
  employee_no    text not null,
  empleado_id    uuid references empleados(id) on delete set null,
  marcada_en     timestamptz not null,
  evento_serial  bigint not null,
  nombre_equipo  text,
  recibida_en    timestamptz not null default now()
);

-- Idempotencia total: el colector puede reenviar el mismo lote las veces que sea. Es lo que
-- permite que el checkpoint pida siempre 10 minutos de solape sin duplicar nada.
create unique index if not exists uq_marca_dispositivo_serial
  on marcas_huellero(dispositivo_id, evento_serial);

-- Para el checkpoint: "¿cuál fue la última marca de este equipo?"
create index if not exists idx_marcas_checkpoint
  on marcas_huellero(dispositivo_id, marcada_en desc);

-- Para la derivación y para reprocesar al crear un mapeo.
create index if not exists idx_marcas_empleado_fecha
  on marcas_huellero(empleado_id, marcada_en);

-- Para la cola de sin asignar.
create index if not exists idx_marcas_sin_mapeo
  on marcas_huellero(dispositivo_id, employee_no) where empleado_id is null;

comment on column marcas_huellero.nombre_equipo is
  'El nombre que el equipo tenía registrado para ese identificador EN EL MOMENTO de la marca. Es
   lo que permite detectar que un número se reasignó a otra persona.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) Quién puede empujar marcas
--
--    El colector NO usa la service key ni getAdminClient (no-negociable 3): se autentica como un
--    usuario propio de Supabase, y ese uid se registra acá. Si alguien se lleva el .env de la PC
--    del almacén, lo único que consigue es insertar marcas de asistencia: no lee sueldos, no lee
--    notas de evaluación, no lee datos personales.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists huellero_colectores (
  user_id   uuid primary key,
  nombre    text not null,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table huellero_colectores is
  'Los usuarios de Supabase autorizados a empujar marcas. Un colector por PC. No son empleados y
   no tienen ningún otro permiso.';

create or replace function private.app_es_colector_huellero()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.huellero_colectores c
    where c.user_id = auth.uid() and c.activo
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) RLS — las cuatro tablas son sólo-administrador
--
--    Las marcas crudas dicen a qué hora entra y sale cada persona: merecen el mismo trato que un
--    sueldo (no-negociable 3). El colector NO lee estas tablas bajo RLS; escribe por la RPC.
--    La RLS de `asistencias` (0025) no se toca.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table dispositivos_huellero enable row level security;
alter table huellero_mapeos       enable row level security;
alter table marcas_huellero       enable row level security;
alter table huellero_colectores   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['dispositivos_huellero','huellero_mapeos','marcas_huellero','huellero_colectores']
  loop
    execute format('drop policy if exists %I_admin_all on %I', t, t);
    -- Lectura Y escritura en la misma policy: con RLS activa y sólo select, los insert fallan
    -- en silencio.
    execute format(
      'create policy %I_admin_all on %I for all using (private.app_es_admin()) with check (private.app_es_admin())',
      t, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) Derivación: marcas de un día → una fila de asistencia
--
--    UNA fila por día, no una por turno. El primer diseño partía el día por una hora de corte y
--    era un defecto capaz de pagar cero: quien entra 08:00 y sale 14:00 deja una marca de cada
--    lado del corte, los dos turnos quedan sin salida, y la liquidación lee "ingreso sin salida"
--    = 0 horas (sueldos.ts:520-527). Sobre los datos reales de 2026 eso rompía 8 de cada 10 días.
--    El grano correcto es el día, porque el día es el grano que usa la liquidación
--    (0073_sueldos_rpc.sql:164-181 colapsa con min/max por fecha).
--
--    Función aparte y no interna a la ingesta, porque hay que poder invocarla sola: al crear un
--    mapeo se llama una vez por cada fecha con marcas de esa persona.
--
--    LAS TRES SALVAGUARDAS DEL SUELDO:
--      a) Nunca se toca un día con una falta declarada — se mira el DÍA entero, no una fila.
--      b) Nunca se pisa una hora ya cargada ni se cambia `fuente`.
--      c) Nunca se declara 'trabajado' una jornada que no puede ser cierta.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_derivar_asistencia(p_empleado_id uuid, p_fecha date)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_entrada     time;
  v_salida      time;
  v_marcas      int;
  v_nombres     int;
  v_anonimas    int;
  v_fila        asistencias%rowtype;
  v_max_horas   numeric;
  v_min_horas   numeric;
  v_horas       numeric;
  v_nueva_ent   time;
  v_nueva_sal   time;
  v_motivo      text := null;   -- si queda con texto, el día NO se declara trabajado
begin
  if p_empleado_id is null or p_fecha is null then return; end if;

  -- SALVAGUARDA (a). Se mira el DÍA, no una fila.
  --
  -- Antes se tomaba `order by turno limit 1` y sólo se comprobaba esa. Con el turno 'M' en
  -- sin_dato (la fila que deja un reporte) y el turno 'T' declarado 'falta', se rellenaba la 'M'
  -- y quedaba una fila 'trabajado' con horas contradiciendo la falta que declaró una persona.
  -- Hoy `0073` la sigue cobrando como falta por su `bool_or`, así que el pago no cambiaba —pero
  -- la garantía estaba rota, y la pantalla o cualquier export verían lo contrario.
  if exists (
    select 1 from asistencias a
    where a.empleado_id = p_empleado_id and a.fecha = p_fecha and a.condicion = 'falta'
  ) then
    return;
  end if;

  -- Las marcas del día, en hora Perú. El core nunca llama new Date() y acá tampoco se asume la
  -- zona del servidor: los cron de Supabase corren en UTC (no-negociable 4).
  --
  -- `nullif(btrim(...), '')` porque count(distinct) IGNORA los NULL: si una marca llegaba sin
  -- nombre y la otra con nombre, el guard de reasignación contaba 1 y no disparaba.
  select count(*),
         min((m.marcada_en at time zone 'America/Lima')::time),
         max((m.marcada_en at time zone 'America/Lima')::time),
         count(distinct nullif(btrim(m.nombre_equipo), '')),
         count(*) filter (where nullif(btrim(m.nombre_equipo), '') is null)
    into v_marcas, v_entrada, v_salida, v_nombres, v_anonimas
  from marcas_huellero m
  where m.empleado_id = p_empleado_id
    and (m.marcada_en at time zone 'America/Lima')::date = p_fecha;

  -- Sin marcas no se inventa nada: el día no existe para el huellero.
  if v_marcas = 0 then return; end if;

  -- El día en que un identificador cambia de dueño.
  --
  -- La vigencia del mapeo es por FECHA, pero la reasignación puede ocurrir a mitad de día: el
  -- 00000013 marcó como JAZMIN a las 08:45 del 28-ene y como NICOL a las 20:46 de ese mismo día.
  -- Las dos marcas caen en la vigencia de JAZMIN y el colapso le daría una jornada de 12 horas
  -- que no trabajó.
  --
  -- Dispara con dos nombres distintos Y TAMBIÉN con mezcla de marcas con nombre y sin nombre:
  -- una marca anónima puede ser de cualquiera de las dos personas.
  if v_nombres > 1 or (v_nombres >= 1 and v_anonimas > 0) then
    v_motivo := 'revisar: el identificador tiene más de un nombre este día (posible reasignación)';
  end if;

  -- Una sola marca no es una jornada: queda la entrada y la salida en null. La condición se
  -- mantiene en 'sin_dato', que es lo que asistencias_trabajado_chk (0073) exige y además hace
  -- que la liquidación corte nombrando la fecha en vez de cobrarla como 0 horas.
  if v_marcas = 1 then
    v_salida := null;
  end if;

  -- SALVAGUARDA (c): jornadas que no pueden ser ciertas.
  --
  -- El colapso de primera a última marca falla con quien entra y sale muchas veces. En los datos
  -- reales: JORDAN de 00:22 a 23:01 (22,6 h) y FERNANDO con dos marcas en el mismo minuto.
  --
  -- Declararlas 'trabajado' no es neutral, es plata:
  --   · 22,6 h le suman 14,6 horas extra al pago (sueldos.ts:572 y :828).
  --   · Entrada igual a salida hace que sueldos.ts:546-548 lance, y la liquidación del mes
  --     entero de esa persona no se puede cerrar, con un error que ni menciona al huellero.
  --
  -- No se recorta la jornada —eso sería inventar una regla de negocio (no-negociable 5)— pero
  -- tampoco se declara trabajada: se guardan las horas reales en 'sin_dato' con el motivo, y
  -- decide una persona. Los límites son filas de `config`, editables.
  if v_salida is not null then
    select coalesce(nullif(btrim(c.valor), '')::numeric, 14) into v_max_horas
      from config c where c.clave = 'huellero_jornada_max_horas';
    select coalesce(nullif(btrim(c.valor), '')::numeric, 0.5) into v_min_horas
      from config c where c.clave = 'huellero_jornada_min_horas';
    v_max_horas := coalesce(v_max_horas, 14);
    v_min_horas := coalesce(v_min_horas, 0.5);

    v_horas := extract(epoch from (v_salida - v_entrada)) / 3600.0;
    if v_horas > v_max_horas or v_horas < v_min_horas then
      v_motivo := coalesce(v_motivo,
        'revisar: la jornada derivada da ' || round(v_horas, 2) || ' h, fuera del rango esperado');
    end if;
  end if;

  select * into v_fila
  from asistencias a
  where a.empleado_id = p_empleado_id and a.fecha = p_fecha
  order by a.turno
  limit 1;

  if not found then
    insert into asistencias (empleado_id, fecha, turno, hora_entrada, hora_salida,
                             minutos_tardanza, fuente, condicion, obs)
    values (p_empleado_id, p_fecha, 'M', v_entrada, v_salida,
            0,                                  -- el motor no lee esta columna; la tardanza la
                                                -- calcula contra sueldo_acuerdo_turnos
            'huellero',
            case when v_salida is not null and v_motivo is null then 'trabajado' else 'sin_dato' end,
            coalesce(v_motivo, 'auto: huellero'))
    on conflict (empleado_id, fecha, turno) do nothing;
    return;
  end if;

  -- SALVAGUARDA (b): sólo se rellenan las horas que estén en null. Nunca se pisa una hora
  -- cargada, nunca se cambia `fuente`, nunca se borra.
  v_nueva_ent := coalesce(v_fila.hora_entrada, v_entrada);
  v_nueva_sal := coalesce(v_fila.hora_salida,  v_salida);

  -- Rellenar sin comparar dejaba la salida ANTES de la entrada: fila de turno 'T' con
  -- hora_entrada 14:00 cargada a mano y marcas del huellero de la mañana (08:00 y 12:00) daba
  -- 14:00 → 12:00 y la transición a 'trabajado' lo bendecía. `asistencias_trabajado_chk` lo
  -- acepta, y después sueldos.ts:546-548 lanza y el mes no se liquida.
  -- Si el relleno da una jornada al revés, se deja la fila como está.
  if v_nueva_ent is not null and v_nueva_sal is not null and v_nueva_sal <= v_nueva_ent then
    return;
  end if;

  update asistencias a
     set hora_entrada = v_nueva_ent,
         hora_salida  = v_nueva_sal,
         -- La ÚNICA excepción a "no pisar otra fuente", y sin ella el proyecto no sirve: las
         -- filas que crea la 0030 al enviar un reporte nacen sin horas y en 'sin_dato', y la
         -- liquidación filtra por condicion <> 'sin_dato' (0073:180). Rellenarles las horas sin
         -- transicionar la condición dejaría el día invisible y el periodo bloqueado.
         -- Sólo 'sin_dato' → 'trabajado', sólo con las DOS horas cargadas
         -- (asistencias_trabajado_chk lo exige) y sólo si el día no quedó marcado para revisar.
         condicion = case
           when a.condicion = 'sin_dato'
            and v_nueva_ent is not null
            and v_nueva_sal is not null
            and v_motivo is null
           then 'trabajado'
           else a.condicion
         end,
         -- El sello [huellero] es lo que permite revertir después: marca que estas horas las
         -- puso la máquina en una fila que no es suya. Sin él no habría forma de distinguirlas
         -- de las que cargó una persona, y un mapeo corregido dejaría días cobrados de más.
         --
         -- Se CONCATENA, no se pisa: el 'auto: encargado del reporte <id>' que escribe la 0030
         -- es el único vínculo entre esa asistencia y el reporte que la creó.
         obs = nullif(btrim(concat_ws(' · ',
                 nullif(a.obs, ''),
                 case when a.fuente <> 'huellero'
                       and (a.hora_entrada is null or a.hora_salida is null)
                      then '[huellero]' end,
                 v_motivo)), '')
   where a.id = v_fila.id;
end;
$fn$;

comment on function huellero_derivar_asistencia(uuid, date) is
  'Marcas de un empleado en un día → una fila de asistencia. UNA por día, no una por turno.
   No toca un día con falta declarada, no pisa horas cargadas, y no declara trabajada una
   jornada imposible: la deja en sin_dato con el motivo para que la mire una persona.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7) Ingesta: la única puerta de escritura del colector
--
--    security definer porque el colector no es admin y no puede escribir estas tablas bajo RLS.
--    Guard explícito adentro, aunque sea definer: el precedente contrario está vivo en este repo
--    (evaluacion_componentes era definer, concedida a authenticated y sin portero, hasta la 0067).
--
--    Cada marca de p_marcas: {"employee_no":"00000019","marcada_en":"2026-08-15T08:00:26-05:00",
--                             "evento_serial":43002,"nombre_equipo":"YESSICA"}
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_registrar_marcas(p_dispositivo_id uuid, p_marcas jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  m            jsonb;
  v_emp        uuid;
  v_ts         timestamptz;
  v_fecha      date;
  v_crudo      text;
  v_insertadas int := 0;
  v_dup        int := 0;
  v_sin_mapeo  int := 0;
  v_rechazadas int := 0;
  v_n          int;
  v_afectados  jsonb := '{}'::jsonb;   -- claves "empleado|fecha" a derivar una sola vez
  k            text;
begin
  if not (private.app_es_colector_huellero() or private.app_es_admin()) then
    raise exception 'PERMISO:sólo un colector registrado o el administrador puede registrar marcas';
  end if;

  if not exists (select 1 from dispositivos_huellero d where d.id = p_dispositivo_id and d.activo) then
    raise exception 'DATO:el dispositivo no existe o está inactivo';
  end if;

  if p_marcas is not null and jsonb_typeof(p_marcas) = 'array' then
    for m in select * from jsonb_array_elements(p_marcas) loop
      -- Una marca rota NO puede tumbar el lote entero.
      --
      -- Antes los casts estaban fuera de todo manejo de excepción: un `"time": ""` o un
      -- serialNo no numérico abortaba la función completa, incluido el update de
      -- ultima_sincronizacion. El colector volvía a pedir la misma ventana, se volvía a
      -- envenenar, y la pantalla decía "el colector se cayó" mientras en realidad corría en
      -- círculos contra un evento roto. Cada marca se procesa en su propio bloque.
      begin
        v_crudo := m->>'marcada_en';

        if v_crudo is null or (m->>'evento_serial') is null or (m->>'employee_no') is null then
          v_rechazadas := v_rechazadas + 1;
          continue;
        end if;

        -- Sin offset explícito, `::timestamptz` interpreta la cadena en la zona de la SESIÓN
        -- (UTC en Supabase), no en hora Perú: una entrada de las 08:00 se guardaría como 03:00,
        -- y una marca de las 00:22 caería en el día anterior partiendo la jornada en dos fechas.
        -- El colector manda siempre con -05:00; si algo llega sin offset, se rechaza en vez de
        -- adivinar (no-negociable 4).
        if v_crudo !~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' then
          v_rechazadas := v_rechazadas + 1;
          continue;
        end if;

        v_ts    := v_crudo::timestamptz;
        v_fecha := (v_ts at time zone 'America/Lima')::date;

        -- El mapeo VIGENTE EN LA FECHA DE LA MARCA, no el de hoy. Sin esto, reasignar un
        -- identificador le adjudicaría a la persona nueva los días de la anterior.
        select mp.empleado_id into v_emp
        from huellero_mapeos mp
        where mp.dispositivo_id = p_dispositivo_id
          and mp.employee_no    = (m->>'employee_no')
          and not mp.ignorado
          and mp.vigente_desde <= v_fecha
          and (mp.vigente_hasta is null or mp.vigente_hasta >= v_fecha)
        limit 1;

        -- Sin mapeo NO se descarta: se guarda con empleado_id null y aparece en la cola de la
        -- pantalla. Al crear el mapeo se reprocesa y las marcas viejas entran solas.
        insert into marcas_huellero (dispositivo_id, employee_no, empleado_id, marcada_en,
                                     evento_serial, nombre_equipo)
        values (p_dispositivo_id, (m->>'employee_no'), v_emp, v_ts,
                (m->>'evento_serial')::bigint, (m->>'nombre_equipo'))
        on conflict (dispositivo_id, evento_serial) do nothing;

        get diagnostics v_n = row_count;   -- row_count es un entero, no un booleano
        if v_n > 0 then
          v_insertadas := v_insertadas + 1;
          if v_emp is null then
            v_sin_mapeo := v_sin_mapeo + 1;
          else
            -- Se anota el par para derivar UNA vez al final: un lote trae muchas marcas del
            -- mismo día y derivar por cada una haría el mismo trabajo N veces. El `||` sobre
            -- jsonb deduplica por clave.
            v_afectados := v_afectados || jsonb_build_object(v_emp::text || '|' || v_fecha::text, true);
          end if;
        else
          v_dup := v_dup + 1;
        end if;

      exception when others then
        v_rechazadas := v_rechazadas + 1;
        continue;
      end;
    end loop;
  end if;

  -- Cada derivación en su propio bloque. El manejo de excepción de arriba cubría sólo el
  -- parseo y el insert: una excepción acá abortaba la transacción entera, se perdían las marcas
  -- ya insertadas y `ultima_sincronizacion` no llegaba a escribirse. El colector volvía a pedir
  -- la misma ventana y se envenenaba igual, con la pantalla culpando al equipo.
  --
  -- Hay un camino real: la derivación lee `huellero_jornada_max_horas` de `config` y lo castea a
  -- numeric. Si alguien escribe "12,5" desde /configuracion, revienta.
  for k in select jsonb_object_keys(v_afectados) loop
    begin
      perform huellero_derivar_asistencia(
        split_part(k, '|', 1)::uuid,
        split_part(k, '|', 2)::date);
    exception when others then
      v_rechazadas := v_rechazadas + 1;
    end;
  end loop;

  -- Se marca vivo aunque el lote venga vacío: un ciclo sin marcas sigue siendo señal de que el
  -- colector está corriendo. Es lo que hace visible una caída en la pantalla.
  update dispositivos_huellero set ultima_sincronizacion = now() where id = p_dispositivo_id;

  return jsonb_build_object(
    'insertadas', v_insertadas,
    'duplicadas', v_dup,
    'sin_mapeo',  v_sin_mapeo,
    'rechazadas', v_rechazadas);
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7 bis) Checkpoint: desde cuándo tiene que pedir el colector
--
--    El colector NO guarda archivo de progreso: le pregunta a la base cuál fue la última marca
--    de su dispositivo y pide desde ahí menos 10 minutos de solape. Si la PC del almacén se
--    reinstala desde cero, no se pierde ni se duplica nada — el índice único
--    (dispositivo_id, evento_serial) absorbe el solape.
--
--    Hace falta una RPC porque `marcas_huellero` es sólo-administrador bajo RLS: las marcas
--    dicen a qué hora entra y sale cada persona. Esto devuelve UN timestamp y nada más.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_checkpoint(p_dispositivo_id uuid)
  returns timestamptz
  language plpgsql
  stable
  security definer
  set search_path = public
as $fn$
declare
  v_ultima timestamptz;
begin
  if not (private.app_es_colector_huellero() or private.app_es_admin()) then
    raise exception 'PERMISO:sólo un colector registrado o el administrador puede leer el checkpoint';
  end if;

  select max(m.marcada_en) into v_ultima
  from marcas_huellero m
  where m.dispositivo_id = p_dispositivo_id;

  return v_ultima;
end;
$fn$;

comment on function huellero_checkpoint(uuid) is
  'Última marca registrada de un dispositivo. El colector la usa como punto de partida en vez de
   guardar estado local. Devuelve un timestamp y nada más: no expone datos de personas.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 8) Re-resolver un identificador contra TODOS sus mapeos
--
--    Ésta es la operación de fondo, y la que arregla el error de diseño de la versión anterior.
--
--    LO QUE HACÍA MAL. Reprocesar liberaba las marcas que caían fuera del rango del mapeo que se
--    estaba tocando, sin mirar si otro mapeo del mismo identificador las cubría. Con el flujo que
--    la propia §5 documenta —cerrar el mapeo de JAZMIN al 28-ene y crear el de NICOL desde el
--    29— reprocesar el de NICOL liberaba TODAS las marcas de enero, y como después se limpiaban
--    los días sin marcas, **borraba las 28 asistencias de JAZMIN**. Su mes dejaba de poder
--    liquidarse y sus marcas volvían a la cola de "sin asignar" pese a tener mapeo válido.
--
--    Liberar por diferencia con UN rango es incorrecto por construcción. Lo correcto es
--    re-resolver cada marca contra la tabla entera de mapeos, que es lo que hace esto: cada
--    marca termina apuntando a quien le corresponde POR SU FECHA, sin importar desde qué mapeo
--    se disparó el reproceso.
--
--    Recalcula las asistencias de todas las fechas tocadas, antes y después del movimiento.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_reresolver_identificador(
  p_dispositivo_id uuid,
  p_employee_no text
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_movidas int := 0;
  v_fechas  jsonb := '{}'::jsonb;   -- "empleado|fecha" a recalcular, deduplicado
  r         record;
  k         text;
begin
  -- 1) Las fechas que HOY tienen dueño: hay que recalcularlas pase lo que pase, porque la marca
  --    puede estar por cambiar de persona o quedarse sin ninguna.
  for r in
    select distinct mk.empleado_id as emp, (mk.marcada_en at time zone 'America/Lima')::date as fecha
    from marcas_huellero mk
    where mk.dispositivo_id = p_dispositivo_id
      and mk.employee_no    = p_employee_no
      and mk.empleado_id is not null
  loop
    v_fechas := v_fechas || jsonb_build_object(r.emp::text || '|' || r.fecha::text, true);
  end loop;

  -- 2) Re-resolver TODAS las marcas del identificador contra la tabla de mapeos. Una marca sin
  --    mapeo vigente en su fecha —o cubierta por uno ignorado— queda en null y vuelve a la cola.
  update marcas_huellero mk
     set empleado_id = (
       select mp.empleado_id
       from huellero_mapeos mp
       where mp.dispositivo_id = mk.dispositivo_id
         and mp.employee_no    = mk.employee_no
         and not mp.ignorado
         and (mk.marcada_en at time zone 'America/Lima')::date >= mp.vigente_desde
         and ((mk.marcada_en at time zone 'America/Lima')::date <= mp.vigente_hasta
              or mp.vigente_hasta is null)
       limit 1
     )
   where mk.dispositivo_id = p_dispositivo_id
     and mk.employee_no    = p_employee_no
     and mk.empleado_id is distinct from (
       select mp.empleado_id
       from huellero_mapeos mp
       where mp.dispositivo_id = mk.dispositivo_id
         and mp.employee_no    = mk.employee_no
         and not mp.ignorado
         and (mk.marcada_en at time zone 'America/Lima')::date >= mp.vigente_desde
         and ((mk.marcada_en at time zone 'America/Lima')::date <= mp.vigente_hasta
              or mp.vigente_hasta is null)
       limit 1
     );
  get diagnostics v_movidas = row_count;

  -- 3) Las fechas que quedaron con dueño después del movimiento.
  for r in
    select distinct mk.empleado_id as emp, (mk.marcada_en at time zone 'America/Lima')::date as fecha
    from marcas_huellero mk
    where mk.dispositivo_id = p_dispositivo_id
      and mk.employee_no    = p_employee_no
      and mk.empleado_id is not null
  loop
    v_fechas := v_fechas || jsonb_build_object(r.emp::text || '|' || r.fecha::text, true);
  end loop;

  -- 4) Recalcular. Primero limpiar y después derivar: `limpiar` revierte lo que el huellero
  --    había escrito en un día que se quedó sin marcas, y `derivar` sólo escribe si hay.
  for k in select jsonb_object_keys(v_fechas) loop
    perform huellero_limpiar_dia_sin_marcas(
      split_part(k, '|', 1)::uuid,
      split_part(k, '|', 2)::date);
    perform huellero_derivar_asistencia(
      split_part(k, '|', 1)::uuid,
      split_part(k, '|', 2)::date);
  end loop;

  return jsonb_build_object(
    'marcas_movidas',    v_movidas,
    'dias_recalculados', (select count(*) from jsonb_object_keys(v_fechas)));
end;
$fn$;

comment on function huellero_reresolver_identificador(uuid, text) is
  'Vuelve a resolver todas las marcas de un identificador contra la tabla de mapeos y recalcula
   las asistencias afectadas. Es la operación correcta después de crear, cerrar, ignorar o borrar
   un mapeo: no depende del rango de uno solo.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 8 bis) Reprocesar un mapeo — la puerta que usa la pantalla
--
--    Delega en la re-resolución completa. Se conserva porque la pantalla tiene el id del mapeo a
--    mano y no el par (dispositivo, identificador), y porque el guard de administrador va acá.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_reprocesar_mapeo(p_mapeo_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_map huellero_mapeos%rowtype;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede reprocesar un mapeo';
  end if;

  select * into v_map from huellero_mapeos where id = p_mapeo_id;
  if not found then raise exception 'DATO:el mapeo no existe'; end if;

  return huellero_reresolver_identificador(v_map.dispositivo_id, v_map.employee_no);
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 8 ter) Re-resolver por identificador, para después de BORRAR un mapeo
--
--    Cuando se borra un mapeo ya no hay id al que apuntar, así que la pantalla necesita poder
--    pedir la re-resolución por el par (dispositivo, identificador). Sin esto, borrar un mapeo
--    dejaba las marcas asignadas a la persona anterior y sus asistencias liquidándose, mientras
--    el identificador figuraba como libre: los mismos días terminaban cobrados dos veces.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_reprocesar_identificador(
  p_dispositivo_id uuid,
  p_employee_no text
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $fn$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede reprocesar un identificador';
  end if;
  return huellero_reresolver_identificador(p_dispositivo_id, p_employee_no);
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 8 quater) Revertir lo que el huellero escribió en un día que se quedó sin marcas
--
--    LO QUE FALTABA. La versión anterior sólo borraba filas con `fuente='huellero'`. Pero la
--    derivación también escribe en filas AJENAS: rellena las horas de una fila que dejó un
--    reporte (0030) y la pasa de 'sin_dato' a 'trabajado'. Esas escrituras no se revertían nunca,
--    así que un mapeo mal puesto y después corregido dejaba a la primera persona con días
--    'trabajado' llenos con las horas de la segunda. Doble pago por la puerta de 'reporte'.
--
--    Para poder revertir hace falta saber qué horas puso el huellero. Se marca en `obs` con el
--    sello de abajo, que la derivación agrega al rellenar una fila ajena. Es la única forma de
--    distinguirlas sin agregar una columna a `asistencias`.
--
--    Nunca se toca una fila 'falta', y nunca se borra una fila que puso una persona: sólo se le
--    quitan las horas que había puesto la máquina.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function huellero_limpiar_dia_sin_marcas(p_empleado_id uuid, p_fecha date)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $fn$
begin
  if p_empleado_id is null or p_fecha is null then return; end if;

  if exists (
    select 1 from marcas_huellero m
    where m.empleado_id = p_empleado_id
      and (m.marcada_en at time zone 'America/Lima')::date = p_fecha
  ) then
    return;   -- todavía tiene marcas: no hay nada que revertir
  end if;

  -- La fila la creó el huellero: se va entera.
  delete from asistencias a
  where a.empleado_id = p_empleado_id
    and a.fecha = p_fecha
    and a.fuente = 'huellero'
    and a.condicion <> 'falta';

  -- La fila es de otra fuente pero el huellero le puso las horas: se le quitan y vuelve a
  -- 'sin_dato', que es como estaba antes de que la máquina la tocara.
  update asistencias a
     set hora_entrada = null,
         hora_salida  = null,
         condicion    = 'sin_dato',
         -- Se quita el sello Y el separador que lo precede, si no queda un ' ·' colgando.
         obs          = nullif(btrim(regexp_replace(coalesce(a.obs, ''),
                          '\s*·\s*\[huellero\]|\[huellero\]\s*·\s*|\[huellero\]', '', 'g'),
                          ' ·'), '')
   where a.empleado_id = p_empleado_id
     and a.fecha = p_fecha
     and a.fuente <> 'huellero'
     and a.condicion <> 'falta'
     and coalesce(a.obs, '') like '%[huellero]%';
end;
$fn$;

comment on function huellero_limpiar_dia_sin_marcas(uuid, date) is
  'Revierte lo que el huellero escribió en un día que se quedó sin marcas: borra su propia fila y
   le quita las horas a las filas ajenas que había rellenado. Nunca toca una falta ni borra una
   fila que puso una persona.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 9) Permisos de ejecución
--
--    `revoke from public, anon` NO ALCANZA. Verificado contra la base: las default privileges de
--    Supabase conceden `execute` DIRECTO a `anon`, `authenticated` y `service_role` sobre toda
--    función nueva de `public` (pg_default_acl para postgres y supabase_admin). Quitar el
--    privilegio de PUBLIC no toca un grant directo a `authenticated`.
--
--    Sin el revoke explícito, `huellero_derivar_asistencia` —que es security definer y no tiene
--    guard porque se llega a ella desde funciones que sí lo tienen— quedaba llamable por
--    cualquier empleado logueado vía /rest/v1/rpc, escribiendo asistencias de terceros por
--    encima de la RLS de la 0025. Es el mismo agujero que la 0067 cerró (P-02).
--
--    Precedente del repo: 0021:83, 0042:97 y 0067:115 revocan `from public, anon, authenticated`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
revoke execute on function huellero_registrar_marcas(uuid, jsonb)          from public, anon;
revoke execute on function huellero_checkpoint(uuid)                       from public, anon;
revoke execute on function huellero_reprocesar_mapeo(uuid)                 from public, anon;

-- Las dos internas: se llega a ellas desde las de arriba, que tienen portero. Nadie las llama
-- por HTTP.
revoke execute on function huellero_derivar_asistencia(uuid, date)          from public, anon, authenticated;
revoke execute on function huellero_limpiar_dia_sin_marcas(uuid, date)      from public, anon, authenticated;
revoke execute on function huellero_reresolver_identificador(uuid, text)    from public, anon, authenticated;

-- Ésta SÍ la llama la pantalla (al borrar un mapeo ya no hay id al que apuntar), y lleva su
-- propio guard de administrador adentro.
revoke execute on function huellero_reprocesar_identificador(uuid, text)    from public, anon;
grant  execute on function huellero_reprocesar_identificador(uuid, text)    to authenticated;

grant execute on function huellero_registrar_marcas(uuid, jsonb)  to authenticated;
grant execute on function huellero_checkpoint(uuid)               to authenticated;
grant execute on function huellero_reprocesar_mapeo(uuid)         to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 10) Los dos parámetros de negocio que agrega este proyecto
--
--     Los LEE `huellero_derivar_asistencia`: una jornada fuera de este rango no se declara
--     'trabajado', se guarda en 'sin_dato' con el motivo en `obs` para que la mire una persona.
--     No recortan nada — recortar sería inventar una regla (no-negociable 5).
--
--     DEFAULTS PROVISIONALES: nadie confirmó estos números. Anotados en
--     docs/pendientes-negocio.md, sección del huellero.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor)
values ('huellero_jornada_max_horas', '14')
on conflict (clave) do nothing;

insert into config (clave, valor)
values ('huellero_jornada_min_horas', '0.5')
on conflict (clave) do nothing;
