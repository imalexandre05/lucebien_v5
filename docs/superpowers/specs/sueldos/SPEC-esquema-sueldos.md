# SPEC — Capa de datos del sistema de sueldos

Cómo se guarda lo que el motor de `packages/core/src/sueldos.ts` calcula: tablas, RPC, RLS y
congelado. Complementa a **[SPEC-sistema-sueldos.md](SPEC-sistema-sueldos.md)**, que define las
reglas; esta define dónde viven los datos.

> **Estado:** borrador para revisión. Sale de mapear el esquema vivo con seis lectores en
> paralelo, tres propuestas independientes de diseño y un adversario por propuesta (14-ago-2026).
> Todo dato de "lo que ya existe" está verificado contra las migraciones y contra la base, no
> contra otro documento.

---

## 1. Qué resuelve y qué no

**Resuelve:** poder liquidar un periodo de verdad y guardar el resultado congelado, de modo que
dentro de un año se pueda reimprimir el recibo exactamente como se pagó.

**No resuelve, son specs aparte:**

- La integración del huellero (`docs/integracion-huellero.md`). Acá sólo se **consume**
  `asistencias`, no se produce.
- El sistema de horarios como módulo con pantalla propia. Acá se modela el horario **contratado
  de un periodo**, que es lo mínimo que el motor necesita.
- El contrato de API con el sistema del otro programador. Acá se modela la tabla espejo que lo
  espera.
- El módulo comercial: caja, pedidos, POS, inventario y clientes están fuera de alcance.

---

## 2. Los tres bloqueantes

Antes del diseño, lo que impide liquidar hoy aunque las tablas existieran.

### B-01 🔴 No existe ninguna tabla de horario contratado

Verificado por grep sobre las 66 migraciones y contra `information_schema`: la palabra "horario"
sólo aparece en comentarios y en las claves `turno_*_cierre` de la `0052`.

Sin horario contratado no hay `horas_contratadas`; sin eso `valor_por_hora = sueldo / 0` y no hay
nada que liquidar. **Es el bloqueante más grande, más que la asistencia misma.** Esta spec lo
absorbe: el horario cuelga del acuerdo del periodo (§4.2).

### B-02 🔴 La asistencia no distingue "faltó" de "nadie cargó el dato"

`asistencias` tiene hoy **13 filas, todas con `fuente = 'reporte'` y todas con `hora_entrada` y
`hora_salida` en NULL**. Cero filas manuales.

El motor lee `horaIngreso` en null como **falta** (`sueldos.ts:569`), y cada falta cuesta las
horas de ese día más el castigo de RN-09. Si la capa de sueldos leyera `asistencias` tal cual y
corriera, **liquidaría 13 faltas inventadas**.

Las dos cosas son NULL hoy y la columna no las puede separar. La solución está en §4.3: una
columna `condicion` explícita.

### B-03 🟡 Los datos de las personas están casi vacíos

`fecha_ingreso` está cargada en **1 de 18** colaboradores, y `salario_base` en 4 de 18. El ciclo
por aniversario, la antigüedad de la escala salarial y cualquier sugerencia de sueldo se caen o
calculan mal en silencio.

No lo resuelve el esquema: lo resuelve alguien cargando los datos. Pero la pantalla tiene que
avisar en vez de mostrar un número inventado.

---

## 3. Lo que ya existe y no se vuelve a crear

Verificado contra las migraciones.

| Qué | Dónde | Cómo se usa acá |
|---|---|---|
| Tabla `asistencias` | `0001_init.sql:212`, RLS en `0025` | Se **extiende** con `alter table ... add column if not exists`. No se crea una tabla paralela |
| Unique `(empleado_id, fecha, turno)` | `0001` | Ya da idempotencia al huellero. No se toca |
| Patrón `SECURITY DEFINER` | `0030_reportes_asistencia.sql` | El precedente escrito para no sumar un séptimo `getAdminClient()` |
| Helpers de RLS | `private.app_es_admin()`, `private.app_es_almacen()`, `private.app_sedes()` — movidos al schema `private` en `0037` | **Siempre con el prefijo `private.`**: sin él la migración falla |
| Tabla `config` + `config-catalogo.ts` | `0058`, `apps/erp-web/lib/config-catalogo.ts` | Los 13 parámetros globales. El catálogo vive en código, no en la base |
| Congelado por snapshot | `evaluaciones_mensuales.pesos_usados` (`0001:206`), `pagos.monto_base`/`ciclo_desde`/`ciclo_hasta` (`0057:243`) | El precedente exacto: se congela guardando el input, no recalculando |
| Auditoría | trigger genérico `private.audit_log_trigger` de `0058` | Se engancha cada tabla nueva: 2 líneas SQL + 2 constantes en `auditoria-tipos.ts` |
| `hoyPeru()` | `apps/erp-web/lib/fechas.ts:7` | Lo que se le inyecta al core. Nunca `new Date()` |
| `mapaNombres()` / `app_directorio` | `apps/erp-web/lib/directorio` | Los nombres nunca salen de un join a `empleados`: la RLS devuelve una sola fila a un no-admin |
| `getServerClient()` | `apps/erp-web/lib/supabase/server.ts` | Respeta RLS. **No** `lib/supabase.ts`, que es el singleton service_role |

**La última migración es la `0066_lavanderia_envio_rpc.sql`. Sueldos arranca en la `0067`.**

---

## 4. El modelo

Cinco tablas nuevas y tres columnas prestadas. La unidad es **el acuerdo del periodo**: todo
cuelga de él, y eso hace que el congelado salga casi gratis.

### 4.1 `sueldo_acuerdos` — la unidad

Lo pactado con una persona para un periodo concreto. Un acuerdo por persona y periodo.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `empleado_id` | uuid not null | `references empleados(id) on delete restrict` — un acuerdo pagado no se borra con la persona |
| `fecha_inicio`, `fecha_fin` | date not null | `check (fecha_fin >= fecha_inicio)` |
| `modalidad` | text not null default `'mensual'` | `check (modalidad in ('mensual','semanal','diario'))` |
| `sueldo_pactado` | numeric(12,2) not null | `check (sueldo_pactado >= 0)`. **Input manual**, no se deriva de `empleados.salario_base` |
| `escala` | int null | `check (escala between 1 and 5)`. Sólo para la tarifa sugerida de RN-14 |
| `parametros` | jsonb not null default `'{}'` | Overrides de este colaborador. §5 |
| `estado` | text not null default `'borrador'` | `check (estado in ('borrador','vigente','liquidado'))` |
| `creado_en`, `creado_por` | timestamptz, uuid | Quién lo pactó |

- `unique (empleado_id, fecha_inicio)`
- **Sin solapes**: `exclude using gist (empleado_id with =, daterange(fecha_inicio, fecha_fin, '[]') with &&)`. Requiere `btree_gist`.

> **Por qué no se reutiliza `empleados.salario_base`:** son dos cosas distintas. `salario_base` es
> el salario de referencia de la evaluación mensual; `sueldo_pactado` es lo acordado para **un**
> periodo, input manual e irrepetible. Mezclarlos haría que editar la ficha de alguien cambie un
> pago pasado.

### 4.2 `sueldo_acuerdo_turnos` — el horario contratado (resuelve B-01)

La plantilla semanal del acuerdo. Una fila por turno.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `acuerdo_id` | uuid not null | `references sueldo_acuerdos(id) on delete cascade` |
| `dia_semana` | int not null | `check (dia_semana between 1 and 7)` — 1 lunes … 7 domingo |
| `hora_inicio`, `hora_fin` | time not null | `check (hora_fin > hora_inicio)` |
| `lugar` | text null | Informativo: en qué sede se cumple ese turno |

- **Sin solapes dentro del día:** `exclude using gist (acuerdo_id with =, dia_semana with =, timerange(hora_inicio, hora_fin, '[)') with &&)`.

> **Por qué acá y no en una tabla de horarios global.** El horario **es** parte de lo pactado, y
> colgarlo del acuerdo da el versionado gratis: cambia el horario → acuerdo nuevo → el periodo
> viejo conserva el suyo. Eso es lo que hace que una liquidación congelada siga siendo cierta.
> El sistema viejo llegó a la misma conclusión por otro camino (`routes/horarios.js:34`,
> `horario_periodos` versionados).
>
> **Por qué la restricción de solape va en la base y no sólo en el motor.** El motor ya la valida
> y corta con error, pero un `insert` por PostgREST no pasa por el motor. Y el efecto es caro: dos
> turnos que se pisan inflan las horas contratadas y **hunden el valor por hora de todo el
> periodo** — con el horario real de LuceBien basta un tipeo para que el pago del mes caiga a
> menos de la mitad.

### 4.3 `asistencias` — tres columnas nuevas (resuelve B-02)

No se crea una tabla paralela. Se extiende la que existe:

```sql
alter table asistencias add column if not exists condicion text not null default 'sin_dato';
alter table asistencias add column if not exists tardanza_justificada boolean not null default false;
alter table asistencias add column if not exists falta_justificada    boolean not null default false;
alter table asistencias add column if not exists motivo_justificacion text;
```

`condicion` con `check (condicion in ('sin_dato','trabajado','falta','descanso','licencia'))`.

- **`sin_dato`** es el default y significa *nadie cargó nada*. La liquidación **corta con error**
  si un día contratado del periodo está así. Nunca se asume que no vino.
- **`falta`** es una declaración explícita del administrador. Sólo eso alimenta RN-09.
- Las 13 filas que existen hoy quedan en `sin_dato`, que es exactamente lo que son.

> **La regla que esto protege:** el motor exige que todo día contratado tenga su fila y que la
> falta se **declare** (`SPEC-sistema-sueldos.md` §6). Generar filas automáticas con la hora en
> null para que el motor no corte convertiría "no cargué la asistencia" en "no vino nunca", y le
> cobraría dos días de sueldo por cada día no cargado. **No se hace.**

**El colapso de turnos.** `asistencias` tiene grano `(empleado, fecha, turno)` y el motor quiere
un solo par ingreso/salida por fecha. El colapso se hace **en la lectura**, no cambiando la clave
que ya usan los reportes y el huellero: `min(hora_entrada)`, `max(hora_salida)` por día.

> Con el horario real de LuceBien (09:00–13:00 + 13:00–20:00, contiguo) el colapso es exacto. Con
> un turno partido con hueco al medio, pagaría horas que nadie trabajó. Queda anotado en
> `docs/pendientes-negocio.md`: **hoy no hay ningún turno partido, y si aparece hay que decidir
> antes de liquidarlo.**

### 4.4 `sueldo_movimientos` — adelantos, descuentos y bonos

Una sola tabla para los tres tipos de `SPEC-sistema-sueldos.md` §3.6, que tienen la misma forma.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `empleado_id` | uuid not null | |
| `fecha` | date not null | |
| `tipo` | text not null | `check (tipo in ('adelanto','reporte','bono_extra','capacitacion','almuerzo_entregado'))` |
| `monto` | numeric(12,2) not null | `check (monto > 0)` — el signo lo pone la regla, no el dato |
| `motivo` | text not null | `check (length(trim(motivo)) > 0)` — sin motivo no se registra |
| `liquidacion_id` | uuid null | Sello: qué liquidación lo consumió. Con sello, la fila es intocable |
| `creado_en`, `creado_por` | timestamptz, uuid | |

> **`monto > 0` no es un detalle.** El verificador encontró que un adelanto tipeado en negativo
> invertía la línea: de descontar S/100 pasaba a sumar S/100. El motor ya lo rechaza; la base
> también.
>
> **Una sanción se corrige mientras el mes esté abierto, y después ya no** (decisión de
> Alexander, 14-ago-2026: *"todo lo que se hace en el mes y se cierra se olvida, ya no se
> vuelve"*). No hacen falta columnas de revocación ni una máquina de deshacer: mientras el
> periodo está abierto el administrador edita o borra el movimiento como cualquier otro, y una vez
> que la liquidación se cierra el sello `liquidacion_id` lo vuelve intocable. Si la prenda aparece
> el mes siguiente, eso es un bono extra de ese mes, no una marcha atrás del anterior.

> **El adelanto exige una semana trabajada como garantía** (decisión del dueño). La RPC que lo
> registra **bloquea** y devuelve el motivo; no es una advertencia que se pueda ignorar.

### 4.5 `sueldo_ventas` — la frontera con el otro sistema

Espejo. **Nada en `apps/erp-web` sabe que existe `tuxedo.spk.com.pe`**: no hay fetch, no hay tipo
compartido, no hay timeout que pueda dejar a alguien sin liquidar.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `origen` | text not null default `'manual'` | `'manual'`, `'pos'`, o el que venga. **Manual es un origen más** |
| `clave_externa` | text null | El id de la boleta en el sistema de origen |
| `fecha` | date not null | |
| `monto` | numeric(12,2) not null | `check (monto >= 0)`. **Es el total de la boleta**, no un producto |
| `tipo` | text not null default `'venta'` | `check (tipo in ('venta','alquiler'))` |
| `sede_cod` | text null | |
| `empleado_id` | uuid null | Quién la hizo. **Null = sin asignar**, visible en una cola |
| `vendedor_externo` | text null | Cómo se llamaba el vendedor en el origen, para poder mapearlo |
| `payload` | jsonb null | El registro crudo tal como llegó |
| `liquidacion_id` | uuid null | Se sella al cerrar |

- `unique (origen, clave_externa)` donde `clave_externa is not null` — **idempotencia**: reimportar
  no duplica.

> **Por qué `empleado_id` puede ser null.** Las comisiones son individuales y los colaboradores
> rotan entre tiendas, así que la venta tiene que saber quién la hizo. Cuando el origen mande un
> vendedor que no se puede mapear, la fila se guarda igual con `empleado_id` null y aparece en una
> cola de "sin asignar". **Nada se descarta en silencio** — el mismo criterio que la decisión 3
> del huellero.
>
> **El contrato de API no bloquea la migración `0067`.** Hoy el administrador carga las boletas a
> mano con `origen = 'manual'`; el día que exista la API se da de alta otro origen y se escribe un
> colector. No se migra nada.

### 4.6 `sueldo_liquidaciones` — el resultado congelado

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `acuerdo_id` | uuid not null | `references sueldo_acuerdos(id)` |
| `empleado_id` | uuid not null | Desnormalizado a propósito: la RLS lo necesita sin join |
| `periodo_desde`, `periodo_hasta` | date not null | |
| `estado` | text not null default `'borrador'` | `check (estado in ('borrador','cerrada','anulada'))` |
| `entrada` | jsonb not null | La `EntradaLiquidacion` exacta que se le pasó al motor |
| `parametros_usados` | jsonb not null | Los 14 valores ya resueltos por `resolverParametros()` |
| `resultado` | jsonb not null | La `Liquidacion` completa: las 12 líneas con su `detalle`, las semanas, las advertencias |
| `total` | numeric(12,2) not null | Escalar para listar y sumar sin abrir el jsonb |
| `subtotal`, `ingresos`, `descuentos`, `ajustes` | numeric(12,2) | Idem |
| `valor_por_hora` | **numeric(14,6)** not null | Ver la nota de abajo |
| `motor_version` | text not null | Para saber qué código produjo este número |
| `cerrada_en`, `cerrada_por` | timestamptz, uuid | |

- `unique (acuerdo_id)` — un acuerdo, una liquidación.

> **`valor_por_hora` va en `numeric(14,6)`, no en `(10,2)`.** El propio motor advierte que
> redondearlo a 3,64 mueve el total unos S/0,06 (`sueldos.ts:19-22`). Es la única cifra del
> sistema que no se redondea.

### 4.7 `sueldo_liquidacion_lineas` — el desglose consultable

Una fila por línea del desglose, escritas **al cerrar**, derivadas del `resultado`.

| Columna | Tipo |
|---|---|
| `liquidacion_id` | uuid not null, cascade |
| `orden` | int not null |
| `grupo` | text not null — `ingreso`/`descuento`/`ajuste`/`final` |
| `concepto`, `detalle`, `regla` | text not null |
| `monto` | numeric(12,2) not null |

> **Por qué duplicar lo que ya está en `resultado`.** Es duplicación consciente. El jsonb prueba
> qué se pagó; estas filas se ordenan, se filtran y se comparan contra el mes anterior sin
> desarmar un jsonb en SQL. La pregunta que hay que poder responder es *"¿por qué este mes cobré
> S/40 menos?"*, y se responde con un `SELECT` sobre lo congelado, sin recalcular jamás.
>
> Se escriben **una sola vez, al cerrar**, en la misma transacción. Un borrador no las tiene.

---

## 5. Los parámetros: tres niveles

La precedencia **ya está implementada y testeada** en `resolverParametros()`
(`sueldos.ts:116-142`). La capa de datos no reimplementa el merge: produce dos
`Partial<ParametrosSueldo>` y los fusiona.

```
PARAMETROS_SUELDO_DEFAULT (core)  ←  config (global)  ←  sueldo_acuerdos.parametros (por persona)
```

**Nivel global — 13 claves `sueldo_*` en `CONFIG_CATALOGO`**, sección nueva `'Sueldos'`. No hay UI
nueva que escribir: `/configuracion` ya renderiza número y booleano.

**Son 13 y no 14.** `meta_semanal` **no va a `config`**: es `number | null` y el null es
significativo (*"no hay meta pactada, sugerila"*). `config.valor` es `text` y la pantalla no puede
distinguir null de cadena vacía. Vive sólo en el acuerdo.

**Nivel por colaborador — `sueldo_acuerdos.parametros jsonb`.** Cuelga del acuerdo y no de la
persona, y eso es deliberado: un override sin periodo se retroaplica, y bajarle la comisión a
alguien hoy cambiaría un pago de hace tres meses.

> **Por qué no en `config` con clave compuesta.** `config` es global y su RLS da `select` a
> cualquier autenticado (`0007`). Guardar overrides por persona ahí —con cualquier truco tipo
> `sueldo_penalidad_tardanza__<uuid>`— expone los datos de pago de una persona a las otras 17.
> Rompe el aislamiento 1 y el 3.

**Tres trampas al leer `config`, todas verificadas:**

1. `Number('')` es `0` y es finito. Una fila con valor vacío **no** cae al default con el helper
   `num()` que usa evaluaciones hoy. En sueldos eso es dinero: `montoMinimoComision = 0` comisiona
   todas las boletas, y `toleranciaMinutos = 0` convierte cada minuto en tardanza.
2. `metaPorHora` debe guardarse con precisión completa (`1500/33`), no redondeado a `45.4545`. Con
   el redondeado la meta del periodo da 7.499,99 en vez de 7.500,00, y eso decide si el bono se
   paga o no.
3. El control booleano de la UI trata como `true` todo lo que no sea exactamente `'false'`. El
   lector de `metaSemanalFija` hace `v !== 'false'` explícito, nunca `Boolean(v)` —
   `Boolean('false')` es `true`.

**Lista blanca obligatoria.** `resolverParametros()` lanza ante una clave desconocida
(`sueldos.ts:119-121`): volcarle la tabla `config` entera tumba la liquidación con la primera
`pts_*`. Se leen exactamente las 13 claves y ninguna más.

---

## 6. El congelado

**Criterio (decisión del dueño):** una liquidación cerrada no se recalcula nunca. La verdad de un
pago emitido es un snapshot, no una consulta a las tablas vivas.

**Qué se guarda al cerrar**, todo en la misma transacción: `entrada`, `parametros_usados`,
`resultado`, las líneas de §4.7, los escalares, y el sellado de `liquidacion_id` en los
movimientos y las ventas consumidas.

**Por qué los tres jsonb y no sólo el total.** El total es la suma de 12 líneas **ya redondeadas**
(`sueldos.ts:845-852`): no es un número al que se llegue de otra forma. Y el `detalle` de cada
línea contiene cifras irreconstruibles — *"10 tardanzas − 3 libres − 4 justificadas"*, el valor
por hora a 4 decimales. Guardar sólo el total obligaría a recalcular para reimprimir, y recalcular
después de una corrección da otro número. Es exactamente lo que ya resolvió
`evaluaciones_mensuales.pesos_usados`.

**Cómo se hace cumplir.** No existe en este repo ningún flag `cerrado` que congele de verdad: el
precedente es el snapshot, y el snapshot sólo protege si nadie reescribe la fila. Hace falta un
**trigger `before update or delete`** que rechace tocar una liquidación en estado `cerrada`.

> Es una pieza nueva para el repo y por eso se justifica acá y no se cuela en el código: sin ella,
> un `PATCH` plano por PostgREST reescribe un pago ya emitido. Confiar el congelado a un
> `estado = 'cerrada'` leído en la UI no es congelar.

**Corregir el pasado.** Si aparece un error en un periodo cerrado, no se toca: se anula
(`estado = 'anulada'`, con motivo y autor) y se emite una liquidación nueva. El rastro queda.

---

## 7. Aislamiento y RLS

El no-negociable 3 dice: **nadie ve el sueldo de otro**. Las cinco tablas nuevas van con RLS
activa desde la migración, con `select` y `insert`/`update`/`delete` **por separado**.

```sql
-- Lectura: el administrador, o uno mismo. NADA MÁS.
create policy sueldo_liq_select on sueldo_liquidaciones for select
  using (private.app_es_admin() or empleado_id = auth.uid());

-- Escritura: sólo el administrador.
create policy sueldo_liq_admin on sueldo_liquidaciones for all
  using      (private.app_es_admin())
  with check (private.app_es_admin());
```

**Tres reglas que no se negocian:**

1. **Con el prefijo `private.`.** Los helpers se movieron de schema en la `0037`. Las policies de
   `0025`/`0026`/`0028` los muestran sin prefijo sólo porque son anteriores: copiarlas al pie de
   la letra hace fallar la migración con *"function does not exist"*.

2. **Sin `private.app_es_almacen()` en ninguna policy de sueldos.** Ese helper devuelve `true`
   para el rol `confeccionista` además de `encargado_almacen` (`0006_pipeline_rls.sql:22-25`,
   verificado). Copiar la policy de `pagos` propagaría un agujero que ya está en producción — ver
   §10.

3. **Toda tabla con RLS necesita policy de lectura Y de escritura.** Una tabla con RLS activa y
   sólo `select` deja las escrituras bloqueadas en silencio: es lo que le pasa hoy a
   `empleado_tiendas`, cuyo `insert` falla con 42501 y cuyo `delete` borra 0 filas sin avisar.

**El encargado de sede.** Hoy no puede leer nada de esto, y está bien: un encargado ve su sede,
no los sueldos de su sede. Si más adelante hace falta, va por una RPC con guard explícito, nunca
ampliando la policy.

---

## 8. Las RPC

Todas **`security invoker`** con `set search_path = public`: la RLS del actor decide el alcance.
`security definer` sólo para helpers de `private` y para cron con grant exclusivo a `service_role`.

| RPC | Qué hace |
|---|---|
| `sueldo_entrada(p_acuerdo uuid)` | Devuelve el `jsonb` con la `EntradaLiquidacion` armada: acuerdo, turnos, asistencia colapsada por día, ventas, movimientos y parámetros resueltos |
| `sueldo_liquidacion_cerrar(p_liquidacion uuid, p_resultado jsonb)` | Valida el estado, escribe el snapshot y las líneas, sella los movimientos y ventas consumidos, pasa a `cerrada`. Todo en una transacción |
| `sueldo_liquidacion_anular(p_liquidacion uuid, p_motivo text)` | Único camino para dejar sin efecto una cerrada |

**Cada una abre con un guard interno**, aunque sean invoker:

```sql
if not private.app_es_admin() then
  raise exception 'PERMISO:solo el administrador puede liquidar';
end if;
```

> **Por qué el guard aunque sea invoker.** El precedente contrario está vivo:
> `evaluacion_componentes` es `security definer`, concedida a `authenticated`, y **sin ningún
> chequeo interno** — hoy cualquier usuario logueado le pide los componentes de evaluación de
> cualquier uuid. Ver §10.

**El total nunca lo manda el navegador.** El cliente llama a `liquidarPeriodo()` para el preview
en vivo, pero la Server Action **vuelve a llamarlo en el servidor** con la entrada de la RPC antes
de insertar. El patrón es el de `/evaluaciones`, que ya hace exactamente esto.

**Errores con prefijo:** `'CODIGO:mensaje'`, que el repo de TypeScript ya parsea. Y `revoke
execute ... from public, anon` después de cada `create function` — sin eso, cualquier anónimo la
llama por `/rest/v1/rpc`.

---

## 9. Orden de implementación

Cada paso deja el sistema en un estado usable. Ninguno depende de la API del otro sistema.

1. **`0067`** — las cinco tablas, las columnas de `asistencias`, RLS, los triggers de auditoría y
   el trigger de inmutabilidad. Sembrar las 13 claves de `config`.
2. **`config-catalogo.ts`** — las 13 entradas y la sección `'Sueldos'`.
3. **`sueldos-repo.ts`** con `getServerClient()`. **No** `getAdminClient()`: serían siete archivos
   y el no-negociable 3 lo prohíbe.
4. **Pantalla del acuerdo**: pactar sueldo, horario y overrides. Sin esto no hay nada que liquidar
   (B-01).
5. **Pantalla de asistencia**: declarar la condición de cada día. Sin esto, B-02.
6. **Pantalla de liquidación**: preview en vivo con el core, cerrar, reimprimir.
7. **Carga manual de ventas y movimientos.**
8. **Recién después**, el colector de ventas cuando exista el contrato de API.

---

## 9.bis Lo que el sistema de sueldos abarca además del cálculo

Alexander lo precisó el 14-ago-2026. No cambia el modelo de datos de arriba, pero sí el alcance:

**Módulo de contratos.** Es **parte del sistema de sueldos**, no un módulo aparte. Ahí se asigna
usuario, rol, horas de trabajo y datos personales, y con eso se estima el sueldo y se fijan las
condiciones. `sueldo_acuerdos` es su tabla: un contrato **es** un acuerdo de periodo.

Ahí vive también **el inicio de periodo** de cada persona — incluido el de un periodo nuevo cuando
alguien vuelve a contratarse. Las fechas históricas se cargan desde el huellero hasta el inicio de
año; de ahí en adelante las pone el administrador.

**Suspender, nunca eliminar.** Cuando alguien deja de trabajar se **suspende**: sus métricas y su
historial de rendimiento quedan intactos para cuando vuelva a contratarse. Una tabla de sueldos no
borra a nadie — de ahí el `on delete restrict` de `sueldo_acuerdos.empleado_id`.

**Defensa contra el marcaje astuto.** Pedido explícito de Alexander: el administrador necesita
detectar a quien marca la huella a las 9 de la mañana y a las 8 de la noche habiendo hecho sólo
medio turno. El motor ya paga por horas reales, así que un día así **cobra el día entero sin
haberlo trabajado**.

El esquema deja el material para detectarlo —`marcas_huellero` guarda cada marca cruda, no sólo la
primera y la última— pero **la regla no está definida**: hace falta decidir si el sistema exige
marcar la salida del primer turno, si compara contra el horario contratado y avisa cuando las
horas trabajadas superan a las contratadas por más de X, o ambas. Va con el diseño del huellero.

---

## 10. Lo que este trabajo encontró en producción

No son defectos de este diseño. Estaban antes y **violan el no-negociable 3**. Se dejan escritos
acá porque el esquema de sueldos tiene que no repetirlos, y porque hay que arreglarlos aparte.

### P-01 🔴 Un confeccionista lee el sueldo, la asistencia y los votos de todo el equipo

`private.app_es_almacen()` devuelve `true` para `rol in ('encargado_almacen','confeccionista')`
(`0006_pipeline_rls.sql:22-25`). Ese helper está en la policy de lectura de:

- `asistencias` (`0025_asistencias.sql:14`)
- `pagos` (`0028_pagos_rls.sql:6`)
- `evaluaciones_valores` (`0057_valores360_competencias_pagos.sql:48`)

Rompe tres de los cuatro aislamientos: nadie ve el sueldo de otro, nadie ve la nota de otro, y
nadie sabe quién lo puntuó en Valores 360° salvo el administrador.

### P-02 🔴 Cualquier usuario logueado pide los componentes de evaluación de cualquiera

`evaluacion_componentes(uuid, date, date)` es `security definer`, está concedida a `authenticated`
y **no tiene ningún chequeo interno** (`0032`, `0044`, `0053`). Un usuario cualquiera la llama con
el uuid de otro y recibe sus tardanzas, incidencias, puntos y valores.

### P-03 🟡 `empleado_tiendas` tiene RLS activa y sólo policy de `select`

Sus escrituras fallan con 42501 y sus borrados quitan 0 filas, en silencio.

---

## 11. Pendientes de decisión

| Qué | Por qué importa |
|---|---|
| **Los dos caminos de la tardanza** | El motor la deriva del horario contratado + tolerancia e ignora `asistencias.minutos_tardanza`; la evaluación mensual suma `minutos_tardanza` y lo vuelve puntos. El día que se carguen horas reales, la nota /20 de todo el mundo cambia sola y en silencio. Hay que decidir quién escribe ese campo **antes** de encender el huellero |
| **Turno partido con hueco** | El colapso `min`/`max` pagaría el hueco. Hoy no existe ningún turno partido; si aparece, hay que decidir antes de liquidarlo |
| **Horario que cambia a mitad de periodo** | El modelo obliga a cerrar el acuerdo y abrir otro. Es coherente con el congelado, pero parte el periodo en dos liquidaciones |
| **Turno partido con hueco** | Pendiente de preguntar al administrador si existe o va a existir alguno |
| **Datos de personas vacíos** | `fecha_ingreso` en 1 de 18. La pantalla tiene que avisar, no inventar |

---

_Sale de seis lectores sobre el esquema vivo, tres diseños independientes y un adversario por
diseño. Todo verificado contra las migraciones y contra la base. 14 de agosto de 2026._
