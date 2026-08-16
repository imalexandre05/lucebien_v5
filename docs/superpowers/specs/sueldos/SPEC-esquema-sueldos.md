# SPEC — Capa de datos del sistema de sueldos

Cómo se guarda lo que el motor de `packages/core/src/sueldos.ts` calcula: tablas, RPC, RLS y
congelado. Complementa a **[SPEC-sistema-sueldos.md](SPEC-sistema-sueldos.md)**, que define las
reglas; esta define dónde viven los datos.

> ✅ **La migración `0072` está APLICADA Y VERIFICADA contra `scilb` el 14-ago-2026.** Además de la
> revisión estructural —6 tablas, 12 policies (6 de lectura y 6 de escritura), cero policies con
> `app_es_almacen()`, 17 triggers, 13 claves de `config` y las 13 filas viejas de `asistencias` en
> `sin_dato`— se corrió un escenario completo de **18 pasos** dentro de una transacción descartada:
> acuerdo, turnos, adelanto, liquidación, cierre, y después catorce intentos de romper el congelado
> y el aislamiento. Los 18 dieron el resultado esperado y no quedó ni una fila.
>
> **Estado:** aprobada, es la base de la migración `0072`. Sale de mapear el esquema vivo con seis
> lectores en paralelo, tres propuestas independientes de diseño y un adversario por propuesta
> (14-ago-2026). Todo dato de "lo que ya existe" está verificado contra las migraciones y contra la
> base, no contra otro documento.
>
> **Cambios sobre el borrador**, todos verificados contra `scilb` antes de escribir el SQL: sueldos
> pasa de la `0067` a la `0072` (§3); `btree_gist` no está instalada y el tipo `timerange` no existe
> en Postgres, así que la migración los crea (§3); la modalidad `'diario'` se elimina porque el
> contrato mínimo es de un mes (§4.1); el congelado necesita **tres** triggers y no uno (§6);
> `asistencias` entra a la auditoría (§4.3); y las 13 claves de `config` quedan listadas con su
> semilla exacta (§5).

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
| Auditoría | trigger genérico `private.audit_log_trigger` de `0058` | Se engancha **cada una** de las tablas nuevas —las seis, incluido `sueldo_liquidacion_lineas`— más `asistencias`: 2 líneas SQL + 2 constantes en `auditoria-tipos.ts` |
| `hoyPeru()` | `apps/erp-web/lib/fechas.ts:7` | Lo que se le inyecta al core. Nunca `new Date()` |
| `mapaNombres()` / `app_directorio` | `apps/erp-web/lib/directorio` | Los nombres nunca salen de un join a `empleados`: la RLS devuelve una sola fila a un no-admin |
| `getServerClient()` | `apps/erp-web/lib/supabase/server.ts` | Respeta RLS. **No** `lib/supabase.ts`, que es el singleton service_role |

**La `0067` se la llevó el cierre de los agujeros de aislamiento
([SPEC-aislamiento-datos-personas.md](../permisos/SPEC-aislamiento-datos-personas.md), ya aplicada).
Sueldos arranca en la `0072`.**

**Dos piezas de Postgres que hay que crear antes de las tablas**, verificadas contra la base el
14-ago-2026:

| Pieza | Estado en `scilb` | Por qué hace falta |
|---|---|---|
| Extensión `btree_gist` | **No instalada** (sí disponible) | Sin ella, `exclude using gist (empleado_id with =, …)` falla: gist no sabe comparar un `uuid` o un `int` por igualdad |
| Tipo `timerange` | **No existe** | Postgres trae `int4range`, `numrange`, `daterange`, `tsrange` y `tstzrange`, y **ninguno de `time`**. El solape de turnos dentro del día lo necesita, así que la migración crea el tipo: `create type public.timerange as range (subtype = time)` |

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
| `modalidad` | text not null default `'mensual'` | `check (modalidad in ('mensual','semanal'))` — ver la nota |
| `sueldo_pactado` | numeric(12,2) not null | `check (sueldo_pactado >= 0)`. **Input manual**, no se deriva de `empleados.salario_base` |
| `escala` | int null | `check (escala is null or escala >= 1)`. Sólo para la tarifa sugerida de RN-14. **Sin techo**: `sueldos.ts:407-418` dice que la escala es un default editable, y fijar `between 1 and 5` obligaría a una migración para agregar la escala 6 (no-negociable 5) |
| `almuerzo_habilitado` | boolean not null default `false` | El `almuerzoHabilitadoPorAdmin` de `EntradaLiquidacion` (`sueldos.ts:204`). Sin esta columna no hay dónde guardarlo, y quien trabaja medio turno pierde S/8 por día sin que el administrador pueda evitarlo |
| `parametros` | jsonb not null default `'{}'` | Overrides de este colaborador. §5. Con **lista blanca de claves en la base**, ver abajo |
| `estado` | text not null default `'borrador'` | `check (estado in ('borrador','vigente','liquidado'))` |
| `creado_en`, `creado_por` | timestamptz, uuid | Quién lo pactó |

- `unique (empleado_id, fecha_inicio)`
- **Sin solapes**: `exclude using gist (empleado_id with =, daterange(fecha_inicio, fecha_fin, '[]') with &&)`. Requiere `btree_gist`.

> **Las claves de `parametros` se validan en la base, no sólo en el motor.** `resolverParametros()`
> **lanza** ante cualquier clave que no esté en `ParametrosSueldo` (`sueldos.ts:119-121`). Sin un
> `check`, la base acepta `{"tolerancia_minutos": 15}` —snake_case, que es como está escrito todo
> el SQL de este repo— el acuerdo se guarda bien, y después **toda liquidación de esa persona
> corta con error** hasta que alguien encuentre el jsonb. El `check` exige que al quitarle las 14
> claves conocidas no quede ninguna:
>
> ```sql
> check (parametros - array['toleranciaMinutos','tardanzasLibres','penalidadTardanza',
>   'valorAlmuerzo','horasMinimasAlmuerzo','valorCapacitacion','bonoMetaSemanal','metaSemanal',
>   'factorMeta','metaSemanalFija','pctComision','montoMinimoComision','diasDescuentoPorFalta',
>   'metaPorHora'] = '{}'::jsonb)
> ```
>
> **`'diario'` se cae de la lista.** El borrador la incluía. Alexander confirmó el 14-ago-2026 que
> **el contrato mínimo es de un mes**, aunque a la persona se la contrate sólo los domingos: por eso
> se paga a fin de mes y no por día. Dejarla habilitada en la base abría un valor que el motor
> rechaza —`ModalidadPago` en `sueldos.ts:146` es `'mensual' | 'semanal'` y nada más—, es decir una
> fila insertable por PostgREST que después no se puede liquidar. La base y el motor aceptan
> exactamente lo mismo.
>
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

- **Sin solapes dentro del día:** `exclude using gist (acuerdo_id with =, dia_semana with =, timerange(hora_inicio, hora_fin, '[)') with &&)`, con el tipo `timerange` que crea la propia migración (§3).
- El intervalo va **`'[)'`**: 09:00–13:00 y 13:00–20:00 —el horario real de LuceBien— son contiguos, no solapados. Con `'[]'` la migración rechazaría el horario que la empresa usa todos los días.

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

`condicion` con `check (condicion in ('sin_dato','trabajado','falta'))`.

- **`sin_dato`** es el default y significa *nadie cargó nada*. La liquidación **corta con error**
  si un día contratado del periodo está así. Nunca se asume que no vino.
- **`falta`** es una declaración explícita del administrador. Sólo eso alimenta RN-09.
- Las 13 filas que existen hoy quedan en `sin_dato`, que es exactamente lo que son.

> ✅ **`'descanso'` y `'licencia'` NO hacen falta, y esa es la respuesta definitiva**
> (Alexander, 14-ago-2026, después de aplicar la `0072`).
>
> Una licencia **es una falta que el administrador marca como justificada**. Sus palabras: *"se
> justifican, y se evidencian con pruebas del colaborador, es un acuerdo entre el colaborador y
> administrador; el administrador solo colocaría que ese día fue justificado, y si lo deja, pues no
> fue justificado"*. Se representa con las columnas que ya existen:
>
> | Situación | `condicion` | `falta_justificada` |
> |---|---|---|
> | Licencia acordada, con evidencia | `falta` | `true` — pierde sólo el día que no vino |
> | No vino y no avisó | `falta` | `false` (el default) — pierde ese día más uno de castigo |
> | Día de descanso semanal | *no hay fila* | — no es un día contratado, no tiene turno en la plantilla |
>
> **Que el default sea "no justificada" es exactamente lo que él describe:** justificar es un acto
> del administrador, y no hacer nada deja la falta como injustificada. El motivo del acuerdo va en
> `motivo_justificacion`.
>
> Un tercer valor habría sido peor de dos maneras: el motor no lo sabe leer (`RegistroAsistencia`
> sólo distingue *hay `horaIngreso`* de *no hay*), y habría dos formas distintas de decir lo mismo
> conviviendo en la misma columna.

> **La regla que esto protege:** el motor exige que todo día contratado tenga su fila y que la
> falta se **declare** (`SPEC-sistema-sueldos.md` §6). Generar filas automáticas con la hora en
> null para que el motor no corte convertiría "no cargué la asistencia" en "no vino nunca", y le
> cobraría dos días de sueldo por cada día no cargado. **No se hace.**

**`asistencias` entra a la auditoría.** Hoy el trigger genérico de la `0058` cubre cinco tablas y
`asistencias` no es una de ellas. Con `condicion`, declarar un día como `falta` pasa a costar dos
días de sueldo (RN-09): es una decisión de plata tanto como editar `pagos`, que sí está auditada.
Son dos líneas de SQL y la tabla tiene 13 filas, así que el volumen no es un argumento.

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
| `monto` | numeric(12,2) **null** | `check (monto is null or monto > 0)` — el signo lo pone la regla, no el dato. Obligatorio en los tres tipos de plata, **prohibido** en los dos de conteo |
| `cantidad` | int not null default `1` | `check (cantidad > 0)`. Cuántas unidades registra la fila |
| `motivo` | text not null | `check (length(trim(motivo)) > 0)` — sin motivo no se registra |
| `liquidacion_id` | uuid null | Sello: qué liquidación lo consumió. Con sello, la fila es intocable |
| `creado_en`, `creado_por` | timestamptz, uuid | |

> **Dos tipos de fila con la misma forma y distinta unidad.** `adelanto`, `reporte` y `bono_extra`
> son **plata**: el motor los suma como montos. `capacitacion` y `almuerzo_entregado` son
> **conteos**: el motor recibe `personasCapacitadas` y `almuerzosEntregados` (`sueldos.ts:199-205`)
> y los multiplica él mismo por `valorCapacitacion` y `valorAlmuerzo`. Meter las cinco en una
> columna `monto not null` invita al error obvio —`sum(monto)` en vez de `sum(cantidad)`— y ese
> error es caro: 10 almuerzos cargados a S/8 dan `almuerzosEntregados = 80`, y como
> `almuerzosAPagar = max(0, diasConDerecho − entregados)`, la persona pierde **el reintegro de
> todos los almuerzos** con una advertencia que se lee como cosmética.
>
> Por eso `monto` pasa a ser nullable y aparece `cantidad`, con un `check` que los hace excluyentes:
>
> ```sql
> check (
>   case when tipo in ('capacitacion','almuerzo_entregado')
>        then monto is null           -- el valor sale de config, no de la fila
>        else monto is not null end   -- adelanto/reporte/bono_extra: la fila ES el monto
> )
> ```
>
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
| `acuerdo_id`, `empleado_id` | uuid not null | **Clave foránea compuesta** a `sueldo_acuerdos(id, empleado_id)`. Ver la nota |
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
| `anulada_en`, `anulada_por`, `anulada_motivo` | timestamptz, uuid, text | El único cambio que admite una cerrada (§6). Sin motivo no se anula |

- `unique (acuerdo_id) where estado <> 'anulada'` — un acuerdo, **una liquidación vigente**.
- El periodo tiene que caer dentro del acuerdo, comprobado por trigger.

> **`empleado_id` desnormalizado tiene que ser el del acuerdo, y la base lo garantiza.** Esa
> columna es la que decide la RLS (`empleado_id = auth.uid()`), así que un uuid equivocado no es un
> dato feo: **es el aislamiento 1 roto**. Con `acuerdo_id` de Ana y `empleado_id` de Beto, Beto lee
> el sueldo pactado, la asistencia y las ventas de Ana, y Ana no ve la suya. Se cierra con una
> `unique (id, empleado_id)` en `sueldo_acuerdos` y una FK compuesta desde la liquidación: la base
> hace imposible la combinación, sin depender de que la RPC no se equivoque.
>
> **El `unique` va parcial, y esa palabra vale un mes de sueldo.** Con un `unique (acuerdo_id)`
> total, anular y reemitir —que es el único camino que la spec §6 admite para corregir el pasado—
> **es imposible**: otra liquidación sobre el mismo acuerdo choca con el unique, un acuerdo nuevo
> para el mismo periodo choca con la restricción de solape, y borrar la anulada está bloqueado por
> el `on delete restrict` de los movimientos que ya consumió. Callejón sin salida con el sueldo del
> mes sin emitir.
>
> **El periodo dentro del acuerdo no es cosmético.** `horasContratadas` sale del periodo, y
> `valorPorHora = sueldo / horasContratadas` es el divisor de **todo** el dinero del mes. Un tipeo
> en `periodo_hasta` no lo detecta ningún `check` —es una comparación entre dos tablas— así que va
> por trigger.
>
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

| Clave en `config` | Parámetro del motor | Semilla |
|---|---|---|
| `sueldo_tolerancia_minutos` | `toleranciaMinutos` | `10` |
| `sueldo_tardanzas_libres` | `tardanzasLibres` | `3` |
| `sueldo_penalidad_tardanza` | `penalidadTardanza` | `5` |
| `sueldo_valor_almuerzo` | `valorAlmuerzo` | `8` |
| `sueldo_horas_minimas_almuerzo` | `horasMinimasAlmuerzo` | `12` |
| `sueldo_valor_capacitacion` | `valorCapacitacion` | `25` |
| `sueldo_bono_meta_semanal` | `bonoMetaSemanal` | `30` |
| `sueldo_factor_meta` | `factorMeta` | `1` |
| `sueldo_meta_semanal_fija` | `metaSemanalFija` | `true` |
| `sueldo_pct_comision` | `pctComision` | `0.02` |
| `sueldo_monto_minimo_comision` | `montoMinimoComision` | `120` |
| `sueldo_dias_descuento_por_falta` | `diasDescuentoPorFalta` | `2` |
| `sueldo_meta_por_hora` | `metaPorHora` | `45.45454545454545` |

> **`45.45454545454545` no es un número arbitrario ni un redondeo.** Es `1500/33` con todos los
> dígitos que JavaScript conserva: `Number('45.45454545454545') === 1500/33` da `true`. Cortarlo en
> `45.4545` —como lo muestra la spec de reglas— deja la meta del periodo en 7.499,99 en vez de
> 7.500,00, y ese céntimo decide si el bono de S/30 se paga o no.
>
> **La tolerancia también va por contrato.** El valor global es el default de la empresa; Alexander
> pidió el 14-ago-2026 que dependa del acuerdo de cada persona, así que se puede pisar desde
> `sueldo_acuerdos.parametros`, igual que cualquier otro de los 14.

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

**Vacío y basura no son lo mismo.** Una fila de `config` con el valor en blanco **cae al default**
(es la trampa 1 de arriba). Una fila con algo que no es un número —`"diez"`, `"10 min"`— **corta con
error**, no cae al default: un parámetro de sueldo ilegible es un problema real, y el motor ya
eligió fallar ruidosamente antes que liquidar con datos que no entiende.

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
precedente es el snapshot, y el snapshot sólo protege si nadie reescribe la fila. Hacen falta
**tres triggers `before update or delete`**, porque congelar la cabecera y dejar sueltas sus
partes no congela nada:

| Trigger sobre | Qué rechaza |
|---|---|
| `sueldo_liquidaciones` | Todo cambio o borrado con `estado in ('cerrada','anulada')`. **Única excepción**: pasar de `'cerrada'` a `'anulada'` con motivo y autor, sin tocar ninguna otra columna |
| `sueldo_liquidacion_lineas` | Todo **alta**, cambio o borrado que toque una liquidación que ya no es `'borrador'` — mirando el estado de **origen y destino** |
| `sueldo_movimientos`, `sueldo_ventas` | Todo cambio o borrado de una fila sellada contra una liquidación vigente, y todo sellado contra una liquidación que ya no es `'borrador'`. **Única excepción**: si la liquidación que la selló fue anulada, el sello se puede soltar — nada más de la fila cambia |

**Cuatro reglas que el verificador tuvo que descubrir rompiéndolas** (14-ago-2026). Cada una es un
camino real por el que un pago emitido cambiaba de valor:

1. **`'anulada'` también es terminal.** Si el trigger sólo mira `'cerrada'`, alcanzan dos `UPDATE`:
   se anula (permitido, es la excepción), y desde `'anulada'` la fila queda editable **entera** —
   incluido volver a `'cerrada'` con otro total. El congelado se rompe completo, y de paso la
   anulada se puede borrar y no queda rastro de que el pago existió.

2. **El desglose se protege por origen y por destino, y también en el `insert`.** Mirar sólo
   `new.liquidacion_id` deja *sacar* las líneas de una liquidación cerrada moviéndolas a un
   borrador; y sin cubrir el `insert`, se le agregan líneas nuevas. Entre las dos, el desglose de
   una cerrada se reescribe de punta a punta sin tocar la cabecera.

3. **Sellar contra una liquidación ya cerrada es peor que editarla.** El trigger que mira sólo
   `old.liquidacion_id` deja hacer `update sueldo_movimientos set liquidacion_id = <una cerrada>`.
   Esa fila queda congelada para siempre apuntando a un snapshot que **nunca la incluyó**: no está
   descontada en el mes cerrado y, como toda consulta de pendientes filtra `liquidacion_id is
   null`, tampoco entra en el siguiente. **El adelanto no se descuenta nunca.**

   > **Consecuencia para la `0073`:** `sueldo_liquidacion_cerrar()` tiene que **sellar primero y
   > cerrar después**, en esa orden, dentro de la misma transacción. Al revés, el trigger la
   > bloquea a ella misma. Y `sueldo_liquidacion_anular()` tiene que **anular primero y soltar los
   > sellos después**, por el mismo motivo al revés.

   > **Por qué anular suelta los sellos.** Si no lo hiciera, el adelanto que consumió la
   > liquidación anulada quedaría marcado para siempre y **la reemisión no lo descontaría**: la
   > persona cobraría de más exactamente el monto del adelanto. Soltar el sello es lo único que se
   > le permite a una fila sellada, y sólo cuando su liquidación está `'anulada'`.

4. **`truncate` no dispara ningún trigger `for each row` ni respeta RLS.** No es alcanzable desde
   PostgREST, pero sí desde cualquier conexión SQL. Va un `before truncate ... for each statement`
   en las cuatro tablas.

> Es una pieza nueva para el repo y por eso se justifica acá y no se cuela en el código: sin ella,
> un `PATCH` plano por PostgREST reescribe un pago ya emitido. Confiar el congelado a un
> `estado = 'cerrada'` leído en la UI no es congelar.
>
> **Los triggers no bloquean al administrador por ser `security definer`** — un trigger `before`
> dispara para cualquier rol, con `security definer` o sin él, y eso es lo que hace que el
> congelado alcance también al admin y al `service_role`. `security definer` está por otra razón,
> mucho más chica: que `sueldo_linea_inmutable` pueda leer la cabecera sin quedar sujeto a la RLS
> de `sueldo_liquidaciones`.

**Corregir el pasado.** Si aparece un error en un periodo cerrado, no se toca: se anula
(`estado = 'anulada'`, con motivo y autor) y se emite una liquidación nueva sobre el mismo acuerdo
—que el `unique` parcial de §4.6 permite— con los movimientos y ventas de la anulada ya liberados.
El rastro queda: la anulada no se borra nunca.

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
| `sueldo_liquidacion_cerrar(p_liquidacion uuid)` | Valida el estado, escribe las líneas desde el `resultado` guardado, sella los movimientos y ventas consumidos, pasa a `cerrada`. Todo en una transacción |
| `sueldo_liquidacion_anular(p_liquidacion uuid, p_motivo text)` | Único camino para dejar sin efecto una cerrada. Escribe motivo y autor, y **libera el sello** de los movimientos y ventas que había consumido, para que la reemisión los vuelva a tomar |

### 8.1 Tres decisiones que el diseño de las RPC obliga a tomar

**`cerrar()` recibe un solo parámetro y deriva todo lo demás.** El borrador ya tiene `entrada`,
`parametros_usados` y `resultado` —son `not null`, los escribió la Server Action después de correr
`liquidarPeriodo()` en el servidor—, así que las líneas salen de `resultado->'lineas'` y no hace
falta volver a mandarlas. Un parámetro menos es una forma menos de que el navegador influya en un
pago.

**El cierre comprueba que nada se movió entre el cálculo y el cierre.** `MovimientoAdmin` no lleva
`id` (`sueldos.ts:180-184`), así que el sellado no puede ir por lista de ids: va por rango
—empleado y periodo, con `liquidacion_id` nulo—, exactamente el mismo criterio con el que
`sueldo_entrada()` los juntó. El riesgo es la carrera: si alguien carga un adelanto entre el
preview y el cierre, esa fila quedaría sellada **sin estar en el snapshot que se pagó**. Por eso
`cerrar()` recuenta y resuma contra la `entrada` guardada y **corta** si no coinciden. El
administrador vuelve a calcular y cierra de nuevo.

> **Deuda conocida: la comprobación cubre movimientos y ventas, no asistencias.** Hoy no importa,
> porque las horas las carga la misma persona que calcula y cierra. Cuando el colector del
> huellero empuje marcas cada pocos minutos, una que llegue entre el cálculo y el cierre va a
> cambiar la realidad sin cambiar el snapshot, y la liquidación se congela con las horas viejas
> sin que nadie se entere. Es la misma clase de error que esta comprobación existe para impedir.
> Se arregla extendiendo la comparación a `entrada->'asistencia'` y
> `entrada->'horasFueraDeContrato'` en la próxima migración de sueldos. Apareció al revisar la
> spec del huellero (15-ago-2026).

**Un dato faltante corta con un mensaje que dice qué falta.** `sueldo_entrada()` **no emite** las
filas con `condicion = 'sin_dato'`: emitirlas con la hora en null las convertiría en faltas
inventadas de dos días cada una. Pero tampoco las omite en silencio — antes de devolver nada,
comprueba que todo día contratado del periodo tenga su fila declarada y, si falta alguno, corta
nombrando las fechas. El motor también lo detectaría, pero con un mensaje genérico.

Y del mismo criterio sale un `check` que faltaba: `condicion = 'trabajado'` **exige** hora de
entrada y de salida. Un día "trabajado" sin horas es un día que el motor lee como falta.

**El orden dentro de `sueldo_liquidacion_cerrar()` no es libre:** escribir el snapshot y las
líneas, **sellar** los movimientos y ventas, y **recién al final** pasar el estado a `'cerrada'`.
Invertir los dos últimos pasos hace que el trigger del sello bloquee a la propia RPC. Y liberar el
sello en `anular()` exige que la anulación pase el estado **antes** de tocar las filas selladas,
por el mismo motivo al revés.

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

1. ✅ **`0072`** — `btree_gist`, el tipo `timerange`, las cinco tablas, las columnas de
   `asistencias`, RLS, los triggers de auditoría y los tres triggers de inmutabilidad. Sembrar las
   13 claves de `config`. **Aplicada y verificada el 14-ago-2026.**
2. ✅ **`0073`** — las tres RPC de §8, cada una con su guard, más el `check` de `'trabajado'`.
   **Aplicada y verificada el 14-ago-2026** con dos escenarios completos y una prueba de RLS como
   colaborador (ve cero filas de todo, la RPC lo rechaza, no puede escribirse un bono).
3. ✅ **`config-catalogo.ts`** — las 13 entradas y la sección `'Sueldos'`. Hecho.
4. ✅ **`sueldos-repo.ts`** con `getServerClient()`. **No** `getAdminClient()`: serían siete
   archivos y el no-negociable 3 lo prohíbe. **Hecho el 15-ago-2026.** Tres decisiones que
   quedaron fijadas ahí y conviene no revisar en cada pantalla:
   - **`crearBorrador(acuerdoId)` recibe un id y nada más.** Pide la entrada a la RPC y vuelve a
     correr `liquidarPeriodo()` en el servidor. Si aceptara la liquidación ya calculada, bastaría
     con manipular el formulario para escribir cualquier total en un pago.
   - **Ninguna consulta filtra por empleado para aislar.** El aislamiento lo aplican las policies
     de la 0072; los `.eq('empleado_id', …)` que hay son filtros de pantalla. Confundir las dos
     cosas es cómo se termina publicando el sueldo de todos.
   - **Los overrides se validan con `resolverParametros()` antes de escribir.** La base también
     los rechaza, pero una clave en snake_case guardada con éxito rompería toda liquidación futura
     de esa persona, y el mensaje de constraint no explica nada.
5. ✅ **Pantalla del acuerdo** (`/sueldos/acuerdos`): pactar sueldo, periodo, modalidad, escala,
   horario semanal y overrides. Resuelve **B-01**. **Hecha el 15-ago-2026.** Lo que quedó decidido
   ahí:
   - **La vista previa usa las funciones del core, no una cuenta propia.** Las horas del periodo
     salen de `resumirHorario()` + `diasDelPeriodo()`, las mismas que va a usar la liquidación. Una
     cuenta paralela se separaría de la real sin que nadie lo note, y lo notaría el colaborador.
   - **El hueco entre turnos del mismo día avisa, no bloquea.** Ver el porqué en
     `docs/pendientes-negocio.md`. Rechazarlo sería inventar una regla de negocio.
   - **Sólo admin/dueño, tres puertas:** la pantalla, la Server Action y las policies. La RLS deja
     que cada persona lea su propio contrato, pero qué mostrarle es una decisión sin tomar, así que
     la pantalla no la adivina.
   - **Módulo de permisos propio, `'sueldos'`**, no dentro de `'pagos'`: quien puede ver un
     contrato no es necesariamente quien registra un pago.
6. ✅ **Pantalla de asistencia** (`/sueldos/asistencia`): declarar la condición de cada día del
   periodo de un contrato. Resuelve **B-02**. **Hecha el 15-ago-2026.** Lo que quedó decidido:
   - **Trabaja sobre el periodo de un contrato, no sobre registros sueltos.** `/asistencias` sigue
     existiendo para consultar; ésta muestra los días que faltan declarar, que es lo único que
     impide liquidar.
   - **`declararDia()` no usa `upsert`.** Un `upsert` pisa `fuente` en una fila que ya existía
     —creada por el envío de un reporte, o mañana por el huellero— y borra de dónde salió el dato.
     Busca primero y actualiza sólo las columnas de la declaración.
   - **Se declara con `turno = 'C'`** («Día completo», vocabulario que ya existe en `TURNO_LABEL`).
     Que haya además filas `'M'` o `'T'` del mismo día no rompe nada: el motor agrupa por fecha.
   - **El botón de declarar varios días es una afirmación del administrador, no una inferencia.**
     Pide confirmación diciendo cuántos días toca y avisa que las faltas se corrigen después. La
     auditoría de la 0072 deja el rastro.
7. ✅ **Pantalla de liquidación** (`/sueldos/liquidaciones`): calcular, guardar borrador, cerrar,
   anular y reimprimir. **Hecha el 16-ago-2026.** Lo que quedó decidido:
   - **El preview es una Server Action, no una función del cliente.** El navegador pide «calculá el
     contrato X» y recibe el resultado; nunca manda un total. Si el cliente calculara y después
     mandara lo calculado, manipular el formulario alcanzaría para escribir cualquier pago.
   - **El detalle congelado se lee del snapshot y no se recalcula.** Recalcular al abrir mostraría
     un número distinto del que se pagó en cuanto alguien edite un parámetro de `/configuracion`.
   - **`DATO` y `DESACTUALIZADA` tienen su propia explicación en pantalla.** Son los dos errores
     que un administrador va a ver de verdad, y el mensaje crudo no dice qué hacer.
8. **Carga manual de ventas y movimientos.** ← **acá va lo siguiente**
9. **Recién después**, el colector de ventas cuando exista el contrato de API.

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

> ✅ **Los tres se corrigieron con la migración `0067`, aplicada y verificada contra `scilb` el
> 14-ago-2026** — ver [SPEC-aislamiento-datos-personas.md](../permisos/SPEC-aislamiento-datos-personas.md).
> Quedan escritos acá como el motivo por el que las policies de sueldos son como son: **ninguna
> usa `private.app_es_almacen()`**, y toda RPC lleva guard aunque sea `security invoker`.

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
| **Datos de personas vacíos** | `fecha_ingreso` en 1 de 18. La pantalla tiene que avisar, no inventar |
| **Trabajo fuera del horario pactado (RN-17)** | El motor lo recibe aparte, en `horasFueraDeContrato` (`sueldos.ts:194`). El esquema no lo marca: se deriva de que el día no tenga turno en la plantilla. La `0073` ya lo implementa así; falta que el administrador confirme que ese criterio alcanza |
| **El hueco largo del mediodía** 🆕 | Distinto del almuerzo, y aparece con el huellero. `min`/`max` le paga a quien se va dos horas por un trámite y vuelve. Hoy es invisible porque nadie lo carga. Las marcas crudas quedan guardadas, así que la decisión se puede aplicar hacia atrás — ver [la respuesta al huellero](../2026-08-15-huellero-respuesta-sueldos.md) |
| **Los tres números de la tardanza** 🆕 | `sueldo_tolerancia_minutos`, `sueldo_tardanzas_libres` y `sueldo_penalidad_tardanza` se eligieron para un mundo donde la tardanza se cargaba a ojo. Con marcación real se aplican al minuto. Revisarlos con el dueño **antes** de la primera liquidación con datos del huellero, no después de que alguien se entere por su recibo |
| **Quién puede declarar una asistencia** | La escritura de `asistencias` ya es **sólo del administrador** (`asist_admin_write`, verificado en `pg_policies`: `private.app_es_admin()` en `using` y en `with check`), así que con `condicion` no se abre nada nuevo. Lo que queda por decidir es de negocio: si el encargado debe poder declarar la asistencia de su sede. Si la respuesta es sí, va por RPC con guard, nunca ampliando la policy |

---

## 12. La ronda de verificación adversarial

El subagente verificador revisó la primera versión de la `0072` **antes de aplicarla**. Encontró
**diez defectos con consecuencia concreta**, seis de ellos en el congelado. Se dejan escritos porque
el patrón se repite y porque explican por qué el SQL final es más largo de lo que parecía necesario.

| Qué rompía | Cómo |
|---|---|
| **El congelado, entero** | `'anulada'` no era terminal: anular y volver a cerrar con otro total, en dos `UPDATE` |
| **El aislamiento 1** | `empleado_id` desnormalizado sin FK compuesta: un uuid equivocado le muestra el sueldo de una persona a otra |
| **El desglose** | El trigger miraba sólo el destino y no cubría el `insert`: las líneas de una cerrada se reescribían enteras |
| **El adelanto que nunca se descuenta** | Sellar contra una liquidación ya cerrada dejaba la fila fuera del mes cerrado *y* del siguiente |
| **La reemisión** | `unique (acuerdo_id)` total volvía imposible el único camino que la spec admite para corregir el pasado |
| **El rastro** | Una anulada se podía borrar, y sus líneas se iban en cascada |
| **Toda liquidación de una persona** | `parametros` sin lista blanca: una clave en snake_case y el motor corta para siempre |
| **S/8 por día** | `almuerzoHabilitadoPorAdmin` no tenía dónde guardarse |
| **El reintegro de almuerzos** | `capacitacion` y `almuerzo_entregado` son conteos, no montos, y compartían la columna `monto` |
| **Dos días de sueldo** | `'licencia'` y `'descanso'` no los sabe representar el motor |

Y tres cosas que el verificador **descartó** después de mirarlas, que también vale anotar: la
resolución del opclass de `btree_gist` no depende del `search_path`; el `insert into config` no
pisa nada porque `config.clave` es PK; y la duda sobre `NEW` en un trigger `before delete` no
aplica — la base corre **PostgreSQL 17.6**, verificado con `select version()`.

Lo que sí quedó mal escrito de mi parte era un comentario: decía que los triggers bloquean al
administrador *porque* son `security definer`. Es falso como mecanismo —un trigger `before` dispara
para cualquier rol— y corregirlo importa, porque el próximo que lo lea puede creer que el congelado
depende de esa palabra.

---

_Sale de seis lectores sobre el esquema vivo, tres diseños independientes, un adversario por diseño
y una ronda adversarial sobre el SQL ya escrito. Todo verificado contra las migraciones y contra la
base. 14 de agosto de 2026._
