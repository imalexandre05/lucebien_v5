# SPEC — Un contrato de varios meses se liquida en tramos, no de una sola vez

> **Qué es.** Hoy un `sueldo_acuerdo` (un contrato) sólo se puede liquidar **una vez, completo**:
> si dura tres meses, hay que esperar a que termine para emitir un pago. Esta spec deja que el
> administrador liquide un acuerdo largo en varios tramos — típicamente uno por mes o uno por
> semana, según la `modalidad` — cada uno con su propio rango de fechas elegido a mano, tal como ya
> lo hacía en su Excel.
>
> **De dónde sale.** Alexander lo pidió explícito, en dos mensajes del 24-ago-2026: *«un contrato
> no se hace solo por un mes, pero tampoco implica que el admin paga cuando todo el contrato se
> termine»*, *«la idea es siempre verlo mensual o semanal (según modalidad)»*, y *«el admin en su
> excel lo que hacía era poner una fecha a otra manualmente... la idea con el sistema es que
> funcione asi, que cuente por días, tanto las horas, como actividades y eso se vaya sumando
> registrando, cuando el admin delimita una fecha ahi recien se hacen los cálculos»*.
>
> **Zona de rigor: spec completa.** Es la cadena del sueldo (no-negociable 1) — un error acá le
> paga de menos o de más a una persona real. La buena noticia, verificada contra el código antes de
> proponer nada (§1): el motor de cálculo **no necesita cambiar**. Lo que cambia es más acotado de
> lo que parecía.

---

## 1. Lo que pasa hoy, verificado contra el código real — no contra memoria ni contra otro documento

Antes de diseñar se mapeó el código real (no-negociable 7). El resultado es mejor de lo esperado:
**la mayor parte de la infraestructura para liquidar por tramos ya existe**, escrita así desde el
diseño original de la `0072`, y sólo dos piezas puntuales fuerzan hoy «todo el acuerdo de una sola
vez».

| Pieza | ¿Ya está lista para tramos? | Evidencia |
|---|---|---|
| `packages/core/src/sueldos.ts` → `liquidarPeriodo()` | **Sí.** Recibe `fechaInicio`/`fechaFin` como parte de `EntradaLiquidacion` — nunca los derivó de ningún acuerdo; el core ni siquiera conoce esa tabla | `sueldos.ts:252-253` (la interfaz), `sueldos.ts:540` (`diasDelPeriodo(entrada.fechaInicio, entrada.fechaFin)`) |
| `valorPorHora = sueldoPactado / horasContratadas` | **Sí**, ya opera sobre el rango que le llegue, cualquiera sea | `sueldos.ts:561`, `horasContratadas` sale de sumar sólo los días de `dias = diasDelPeriodo(...)` |
| `sueldo_liquidaciones` (schema) | **Sí.** Tiene columnas propias `periodo_desde`/`periodo_hasta`, **separadas** de las del acuerdo, desde el diseño original | `0072_sueldos_esquema.sql:318-319` |
| Trigger `sueldo_liq_coherente` | **Sí.** Ya tolera un sub-rango: sólo rechaza si el período se sale de los bordes del acuerdo (`periodo_desde < fecha_inicio or periodo_hasta > fecha_fin`), no exige que coincida exacto | `0072_sueldos_esquema.sql:440-443` |
| RPC `sueldo_liquidacion_cerrar` | **Sí.** Ya lee `periodo_desde`/`periodo_hasta` de la propia fila de `sueldo_liquidaciones`, no del acuerdo | `0073_sueldos_rpc.sql:334,342-343,347,383,389` |
| Fuentes de datos (`asistencias`, `reporte_actividades`, `pipeline_puntos`) | **Sí.** Granulares por día/evento desde la `0001`, sin ninguna pre-agregación por período en las 92 migraciones | `0001_init.sql:129-221` |
| Índice `uq_sueldo_liq_acuerdo_vigente` | **No.** `unique (acuerdo_id) where estado <> 'anulada'` — bloquea una segunda liquidación viva por acuerdo **sin mirar fechas**, así que hoy da lo mismo si el segundo tramo pisa al primero o no: ninguno de los dos entra | `0072_sueldos_esquema.sql:370-371` |
| RPC `sueldo_entrada(p_acuerdo uuid)` | **No.** Firma sin `p_desde`/`p_hasta`; usa `a.fecha_inicio`/`a.fecha_fin` en cada consulta y en la salida | vigente en `0085_sueldo_entrada_dia_mixto.sql:30,64,99,153,189,197-198` |
| Pantalla `/sueldos/liquidaciones` | **No.** El admin elige un `<Select>` de acuerdo (que muestra sus fechas fijas, no editables) y aprieta «Calcular» — ningún input de fecha propio en todo el flujo | `apps/erp-web/app/sueldos/liquidaciones/cliente.tsx:220-230` |

**Lo que esto significa:** no hace falta tocar `packages/core` ni el congelado (§8 de la `0072`,
las cuatro guardas). El cambio real es acotado a un índice, una RPC y la pantalla que la llama —
mucho más chico que lo que este mismo documento decía hasta hoy («un cambio en el corazón del
motor»). Esa frase era una suposición sin verificar; se corrige acá.

Dato de riesgo (verificado contra `scilb` el 24-ago-2026, antes de proponer el diseño): **hay un
solo `sueldo_acuerdo` en toda la base** (el de Marylin) **y cero `sueldo_liquidaciones`**. No hay
ningún pago emitido que una migración pueda romper. El único dato real a corregir es el propio
`sueldo_pactado` de Marylin — ver §3, C-5.

---

## 2. El fork real: qué significa `sueldo_pactado` cuando un acuerdo se liquida en tramos

Esto es lo único que de verdad hace falta decidir antes de escribir código. El resto del diseño
(§3) es mecánico una vez que esto está resuelto.

**El problema.** `valorPorHora = sueldoPactado / horasContratadas(rango)`. Hoy el rango es siempre
el acuerdo completo, así que `sueldoPactado` funciona sea cual sea su significado: es un número que
se divide entre las horas de TODO el acuerdo, una sola vez. En cuanto el acuerdo se pueda liquidar
en tramos, `sueldoPactado` tiene que significar una sola cosa de las dos siguientes — y las dos
tienen evidencia real, contradictoria, en este mismo repo:

**Evidencia a favor de «`sueldo_pactado` es la tarifa de CADA tramo» (opción recomendada):**
- El campo del formulario ya dice **«Sueldo pactado del periodo»**, no «del contrato»
  (`apps/erp-web/app/sueldos/acuerdos/cliente.tsx:586`).
- `SPEC-esquema-sueldos.md:158-161` ya lo documentaba así desde el 14-ago: *"`sueldo_pactado` es lo
  acordado para **un** periodo, input manual e irrepetible"*.
- Es literalmente lo que dijo Alexander este mismo 24-ago: *"la idea es siempre verlo mensual o
  semanal (según modalidad)"* — no «ver una aproximación mensual de un total», sino que el pago
  **es** mensual o semanal, como unidad real, no como cálculo derivado.
- Contrapone explícitamente esta idea a **«el admin paga cuando todo el contrato se termine»** —
  que es exactamente lo que pasaría si `sueldo_pactado` seguiera siendo el total del acuerdo
  completo y cada tramo cobrara una fracción de él.

**Evidencia a favor de «`sueldo_pactado` es el TOTAL del acuerdo completo» (la que rige hoy):**
- El acuerdo real de Marylin tiene `sueldo_pactado = 1.800` para un contrato de 3 meses (verificado
  contra `scilb` el 24-ago-2026) — el total, no la cuota mensual de 600.
- La propia pantalla de contratos ya distingue dos cifras a propósito: **«Pago del periodo»**
  (`sueldoPactado` tal cual, `cliente.tsx:656-658`) y **«Pago mensual (aprox.)»**, una cifra
  DERIVADA dividiendo `sueldoPactado / (días del acuerdo / 30)` — con el comentario explícito
  `// sueldo / (dias/30) — aproximado siempre (decisión 23-ago)` (`cliente.tsx:175,244`). Esa
  decisión, de un día antes de esta spec, trató a `sueldoPactado` sin ambigüedad como el total del
  rango completo del acuerdo, con el mensual como una referencia aproximada, nunca como el número
  real que se paga.

**Por qué se recomienda igual la primera lectura.** El campo `pagoMensual` de la decisión del
23-ago es, mirado con lo que Alexander pidió el 24-ago, precisamente el parche que esta spec viene
a reemplazar: como ayer sólo se podía liquidar el acuerdo completo de una sola vez al final, lo
único que se podía ofrecer era una cifra aproximada de referencia mientras tanto — el propio
comentario dice **«aproximado siempre»**, no «el monto real». Con tramos de verdad, esa
aproximación deja de hacer falta: el monto real de cada mes vuelve a ser, otra vez, un número
exacto y no una división. Es coherente con lo que ya decía el documento original de la `0072` y con
el label del formulario, que nunca se llegaron a corregir cuando la `0072` sólo dejaba liquidar de
una vez.

**Lo que se propone, en concreto:**
`sueldo_acuerdos.sueldo_pactado` pasa a significar **«lo que se paga en CADA liquidación de este
acuerdo»** (la cuota mensual si `modalidad = 'mensual'`, la semanal si `'semanal'`), aplicado **tal
cual, sin escalar**, sea cual sea la duración exacta del tramo que el administrador elija liquidar
esa vez — exactamente la misma fórmula de hoy (`sueldoPactado / horasContratadas(rango)`), sin
ningún cambio en `packages/core`. Un acuerdo de tres meses mensual con `sueldo_pactado = 600` se
liquida hasta tres veces, y cada una calcula contra las horas de SU propio tramo, no contra un
total prorrateado.

**No se considera la alternativa de prorratear un total** (`montoDelTramo = sueldoPactado ×
díasDelTramo / díasDelAcuerdo`) — además de contradecir lo que pidió Alexander, exigiría tocar
`packages/core/src/sueldos.ts` (zona sagrada) con una fórmula nueva, y arrastra su propio problema
sin resolver: prorratear por días de calendario no es correcto cuando dos tramos tienen distinta
cantidad de horas contratadas (un mes con más fines de semana no vale lo mismo que uno con menos).

### ✅ CONFIRMADO el 24-ago-2026

Alexander, textual: *«mi idea era que en los contratos se pone cuanto se le paga semanal o
mensual... la idea es que mensualmente se pague 600, eso es todo»*. Es la opción A: `sueldo_pactado`
es la cuota de CADA liquidación, no el total del contrato. El 1.800 cargado en el acuerdo real de
Marylin fue una traducción mía de su respuesta anterior («S/1.800 — o sea S/600 al mes») al ÚNICO
campo que existía en ese momento (uno solo, pensado para el contrato completo) — no fue una
decisión suya de cobrar por el total. El resto de esta spec (§3 en adelante) queda confirmado tal
como está escrito, sin necesidad de rediseñar nada.

---

## 3. El diseño (asumiendo que Alexander confirma §2 como «cuota por tramo»)

### C-1 — El índice que bloquea una segunda liquidación se cambia por uno que sólo bloquea el solape

Se reemplaza el índice único parcial por una restricción de exclusión, mismo patrón que
`sueldo_acuerdos_sin_solape` (que ya usa `btree_gist`, ya habilitada):

```sql
drop index if exists uq_sueldo_liq_acuerdo_vigente;

alter table sueldo_liquidaciones add constraint sueldo_liq_periodo_sin_solape
  exclude using gist (
    acuerdo_id with =,
    daterange(periodo_desde, periodo_hasta, '[]') with &&
  ) where (estado <> 'anulada');
```

Efecto: un acuerdo puede tener varias liquidaciones vivas, siempre que sus períodos no se pisen.
Dos liquidaciones de julio y agosto conviven; dos que ambas toquen el 15 de julio, no — el choque
lo resuelve la base, no la pantalla, mismo criterio que ya usa `sueldo_acuerdos_sin_solape` para
los acuerdos entre sí.

**El mensaje de error se traduce, no se muestra crudo** (mismo patrón que se acaba de aplicar esta
sesión para `sueldo_acuerdos_sin_solape`, commit `00ba01d`). El check inline de
`crearBorrador()` (`sueldos-repo.ts:636`) hoy busca `uq_sueldo_liq_acuerdo_vigente|duplicate key` en
el mensaje: pasa a buscar `sueldo_liq_periodo_sin_solape`, con un mensaje propio —
*"El período que elegiste se superpone con otra liquidación de este mismo acuerdo. Elegí un rango
que no se pise, o anulá la existente."* — distinto del mensaje que ya existe para
`sueldo_acuerdos_sin_solape` en `errorSueldo()` (`sueldos-repo.ts:92-97`), que sigue intacto y sigue
siendo el correcto para cuando lo que se pisa son dos ACUERDOS, no dos liquidaciones del mismo
acuerdo. Ojo al implementar: los dos errores comparten código Postgres `23P01`
(`exclusion_violation`) — el orden de los `if` importa, y el check por nombre de restricción tiene
que ganarle al `if (error?.code === '23P01')` genérico para que no se muestre el mensaje
equivocado.

### C-2 — `sueldo_entrada` acepta el rango como parámetro, igual que `evaluacion_componentes`

Nueva firma: `public.sueldo_entrada(p_acuerdo uuid, p_desde date, p_hasta date)` — **parámetros
obligatorios, sin default**. No hace falta tolerar «sin rango = el acuerdo completo»: verificado que
hoy no hay ningún otro llamador de esta RPC además de `sueldos-repo.ts`, así que no hay nada que
mantener retrocompatible. Es la misma forma que ya usa `evaluacion_componentes(p_empleado, p_desde,
p_hasta)` — mismo patrón, para las dos cadenas de datos que alimentan un pago.

Cambios dentro de la función (`0085_sueldo_entrada_dia_mixto.sql` es la versión vigente a
reemplazar con `create or replace function`):

- Al principio, después de cargar `a`: validar `p_hasta >= p_desde` y que el rango caiga dentro del
  acuerdo (`p_desde >= a.fecha_inicio and p_hasta <= a.fecha_fin`), cortando con `DATO:` y un
  mensaje legible — el trigger de la `0072` ya lo comprobaría al insertar, pero fallar acá, antes de
  armar todo el `jsonb`, da un mensaje mejor y más rápido, mismo criterio que ya usa esta función
  para sus otros cortes.
- Todas las referencias a `a.fecha_inicio`/`a.fecha_fin` que hoy delimitan qué se lee (líneas 64, 99
  del `generate_series` de los controles de día sin declarar y día mixto; 153 del `between` de
  asistencias; 189 del `between` de `sueldo_ventas`; 197-198 de la salida `fechaInicio`/`fechaFin`;
  y los tres `private.sueldo_movimientos_*` de 208-212) pasan a usar `p_desde`/`p_hasta`.
- Lo que NO cambia: todo lo que consulta `sueldo_acuerdo_turnos` por día de la semana (el horario
  contratado no depende de qué tramo se esté liquidando), y `a.modalidad`/`a.sueldo_pactado` en la
  salida (`a.sueldo_pactado` sigue siendo la cuota, se manda tal cual — es el motor, no la RPC,
  quien la divide entre las horas del tramo).

### C-3 — El repo pasa el rango

`entradaDeAcuerdo(acuerdoId, desde, hasta)`, `calcularPreview(acuerdoId, desde, hasta)`,
`crearBorrador(acuerdoId, desde, hasta)` (`apps/erp-web/lib/sueldos-repo.ts:574,587,604`) reciben
`desde`/`hasta` y se los pasan a `.rpc('sueldo_entrada', { p_acuerdo, p_desde, p_hasta })`.
`crearBorrador` sigue sin cambios en la parte que arma el `insert`: ya lee `periodo_desde`/
`periodo_hasta` de `entrada.fechaInicio`/`entrada.fechaFin`, que ahora vienen del RPC con el tramo
correcto.

### C-4 — La pantalla deja elegir el rango, con una sugerencia

`/sueldos/liquidaciones/cliente.tsx` agrega dos `<input type="date">` (Desde/Hasta) junto al
selector de acuerdo, editables sin más restricción que la que ya impone C-2/el trigger.

**Sugerencia de default**, calculada en el servidor al elegir un acuerdo (no forzada, el admin la
puede pisar):
- Si el acuerdo ya tiene liquidaciones no-anuladas, sugerir desde el día siguiente al
  `periodo_hasta` más reciente (`max(periodo_hasta) + 1 día`).
- Si no tiene ninguna, sugerir desde `fecha_inicio` del acuerdo.
- El «hasta» sugerido sale de `calcularCiclo(desdeSugerido, hoyPeru())` (`packages/core/src/
  evaluaciones.ts`, ya existe, ya tiene el recorte de mes corto de esta misma sesión) — recortado
  además a `fecha_fin` del acuerdo si el ciclo se pasara del final del contrato. Mismo patrón que
  ya usa la evaluación para sugerir un período: acá es sugerencia, ahí también.

`accionCalcular`/`accionCrearBorrador` (`app/sueldos/liquidaciones/actions.ts:49,60`) reciben
`desde`/`hasta` además de `acuerdoId`.

### C-5 — Corregir el contrato de Marylin (dato, no código)

Con `sueldo_pactado` significando ahora «la cuota mensual», el acuerdo real de Marylin
(`720e74f8-83e2-441f-ab89-16559776cbbd`, `sueldo_pactado = 1.800`) queda mal: hay que corregirlo a
`600` antes de su primera liquidación real. Es un `update` de una fila, no una migración de datos —
se hace a mano desde la pantalla de contratos (ya existe la edición) una vez que C-1 a C-4 estén
aplicados, no antes: si se corrige primero, cualquier intento de liquidar el acuerdo completo de una
sola vez con el código viejo (todavía en producción) pagaría **la sexta parte** de lo que
corresponde por los tres meses.

### C-6 — Ajustar la copia de la pantalla de contratos

`pagoMensual` (`app/sueldos/acuerdos/cliente.tsx:175,244`, la aproximación `sueldo/(días/30)`, con
el comentario propio `«aproximado siempre»`) deja de tener sentido tal como está: si `sueldoPactado`
ya es la cuota mensual, «Pago mensual (aprox.)» pasa a ser el mismo número que «Pago del periodo»,
sin ninguna aproximación. No es una regla de negocio, es texto que quedaría confuso — se ajusta la
etiqueta (algo como «Esto es lo que se paga en cada liquidación», sin el «(aprox.)») al implementar,
sin necesidad de volver a esta spec por la redacción exacta.

---

## 4. Lo que esta spec NO hace

- **No** toca `packages/core/src/sueldos.ts`. Confirmado en §1: el motor ya es agnóstico al rango.
  Si Alexander responde §2 con la opción de prorratear un total, esto deja de ser cierto y hace
  falta una spec nueva para esa fórmula.
- **No** construye una pantalla combinada que liquide sueldo y evaluación de un mismo rango elegido
  una sola vez, aunque Alexander mencionó que en su Excel contaba «tanto las horas... como también
  su desempeño» del mismo calendario. `evaluacion_componentes` ya acepta `p_desde`/`p_hasta` desde
  antes de esta spec y no necesita ningún cambio — unificar las dos pantallas en una sola es una
  mejora de UX a futuro, no parte de esta spec.
- **No** cambia el congelado (§8 de la `0072`, las cuatro guardas) ni `sueldo_liquidacion_cerrar`:
  ya operan por fila y por el período de la propia liquidación, no del acuerdo.
- **No** define qué pasa si el administrador quiere liquidar el acuerdo completo de una sola vez
  (por ejemplo, un contrato corto de menos de un mes): sigue siendo posible — es sólo un tramo que
  resulta ser igual de largo que el acuerdo entero — pero con `sueldo_pactado` como cuota mensual,
  eso pagaría sólo un mes de un contrato de tres. No es un caso que esta spec deba resolver: el
  admin, con el rango a la vista, decide cuánto tramo liquidar cada vez.
- **No** valida que la suma de las liquidaciones de un acuerdo termine cubriendo exactamente
  `fecha_inicio`..`fecha_fin` sin huecos ni sobras — el mismo criterio que ya rige hoy para los días
  contratados sin asistencia declarada (corta nombrando lo que falta) no se extiende acá; se puede
  hacer en una fase futura si hace falta, no es parte del pedido de esta spec.

## 5. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Acuerdo mensual de 3 meses, `sueldo_pactado = 600` tras C-5, liquidar sólo julio | El total ronda un mes de sueldo, no tres |
| 2 | Mismo acuerdo: liquidar julio, cerrar, después liquidar agosto | Las dos conviven; la segunda no choca con la primera |
| 3 | Mismo acuerdo: intentar liquidar 15-jul a 15-ago cuando julio ya está cerrado | Rechaza con el mensaje traducido de C-1, no con el texto crudo de Postgres |
| 4 | `sueldo_entrada` llamado con `p_desde`/`p_hasta` iguales a `fecha_inicio`/`fecha_fin` del acuerdo | Idéntico al resultado de hoy (llamando sin esos parámetros), ningún regresión |
| 5 | `p_desde`/`p_hasta` que se sale de los bordes del acuerdo | Corta con `DATO:` claro, sin llegar al trigger |
| 6 | Anular la liquidación de julio y volver a liquidarlo | Funciona, mismo patrón que ya existe hoy para un acuerdo entero |
| 7 | Agosto sin asistencia declarada todavía, liquidar sólo julio | No exige declarar agosto — el control de «día sin declarar» de la `0085` sólo mira el rango pedido |
| 8 | Día partido en tramos dentro del rango elegido (mañana en un tramo del rango, tarde en el tramo siguiente que NO se está liquidando) | Fuera de alcance: un acuerdo se liquida por fechas completas, no por medio día — anotar como caso a vigilar si aparece en la práctica, no bloquea esta spec |

## 6. Orden sugerido de implementación

1. ~~Confirmar §2 con Alexander.~~ ✅ Hecho el 24-ago-2026.
2. `packages/db/pruebas/00XX_....prueba.sql` primero (Zone Guard: la prueba fija el contrato antes
   que el código lo cumpla), con los casos de §5.
3. Migración: C-1 (índice → exclude) + C-2 (`sueldo_entrada` con rango), una sola migración —
   `bash tools/reservar-migracion.sh liquidacion-por-tramos` para el número.
4. `sueldos-repo.ts` (C-3), después `actions.ts` + `cliente.tsx` (C-4) de
   `/sueldos/liquidaciones`.
5. `bash tools/verificar-local.sh` completo.
6. Aplicar la migración y correr la prueba contra `scilb` real antes de dar por cerrado (mismo
   patrón que `0091`/`0092` esta sesión — un `implementador` no puede hacer este paso solo, ver
   `docs/aprendizajes.md`, sección «Coordinación entre agentes»).
7. ~~Recién ahí, C-5: corregir el acuerdo real de Marylin desde la pantalla. No antes.~~ ✅ Hecho
   el 24-ago-2026, después de aplicar y probar la migración: `sueldo_pactado` de
   `720e74f8-83e2-441f-ab89-16559776cbbd` pasó de 1.800 a 600.
8. C-6, la copia de `/sueldos/acuerdos`, se puede hacer junto con el paso 4.
9. ~~Listo.~~ **No.** El paso 6 lo hizo un `verificador` adversarial en vez de la sesión principal
   directamente — ver §7 más abajo, seis fallos reales encontrados antes de tocar `scilb`. Falta
   corregirlos, con su propio orden, antes de que el paso 6 de arriba se pueda hacer de verdad.

## 7. Addendum — 24-ago-2026: seis fallos reales que encontró la revisión adversarial

C-1 a C-4 y C-6 se implementaron y pasaron `verificar-local.sh` en verde — pero verde ahí sólo
significa "no rompió lo que ya existía", no "hace lo que promete" (es justamente la lección de
`docs/aprendizajes.md`, sección "Base de datos y migraciones": *"verificar una migración mirando
que las tablas existan... eso comprueba que corrió, no que funcione"*). Un `verificador` adversarial
encontró seis fallos reales antes de aplicar nada contra `scilb`. Cinco los causó ESTA SPEC, no
quien implementó — quedan corregidos acá, con Zone Guard: primero el texto, después el código.

### F-1 / F-1b — `sugerirRango()` no puede usar `calcularCiclo()` (C-4 estaba mal especificado)

**Lo que decía la spec (§3, C-4):** *"El «hasta» sugerido sale de `calcularCiclo(desdeSugerido,
hoyPeru())`... Mismo patrón que ya usa la evaluación para sugerir un período."* **Es falso.**
`calcularCiclo(fechaIngreso, hoyStr)` sólo usa el DÍA del primer parámetro; el año y el mes del
ciclo salen de `hoyStr` — la función contesta *"¿qué ciclo contiene HOY?"*, no *"dame un período que
arranque en esta fecha"*. Verificado corriendo la función real:

```
desde=2026-05-01 (acuerdo ya vencido el 2026-07-31) hoy=2026-08-24
  -> calcularCiclo da hasta=2026-08-31, MUY lejos de fechaFin del acuerdo
```

Recortado a `fechaFin` del acuerdo (2026-07-31, como ya hace `sugerirRango`), el resultado es
**todo el acuerdo de 3 meses sugerido como un solo tramo** — exactamente lo que esta spec existe
para evitar. Con `sueldo_pactado` como cuota (F-1 se combina con la decisión del §2: confirmada), la
persona cobraría un tercio de lo que corresponde si el administrador acepta la sugerencia tal cual.

**F-1b, el mismo síntoma por otra causa:** `sugerirRango()` nunca lee `acuerdo.modalidad`. Un
acuerdo `semanal` recibe una sugerencia de UN MES, no de una semana.

**La corrección — un helper nuevo en `packages/core/src/sueldos.ts` (no en `evaluaciones.ts`,
que no sirve para esto):**

```ts
/**
 * El último día de UN PERÍODO que arranca en `desde`, según `modalidad`, recortado a `limite` si
 * el período se pasaría de ahí. 'semanal' son 7 días (desde..desde+6). 'mensual' es "un mes menos
 * un día", con el mismo recorte de mes corto que ya usa `calcularCiclo()` de evaluaciones.ts, pero
 * ANCLADO EN `desde` — calcularCiclo resuelve "¿qué ciclo contiene hoy?", una pregunta distinta,
 * anclada siempre en la fecha de hoy, y por eso no sirve para esto.
 */
export function finDePeriodo(desde: string, modalidad: 'mensual' | 'semanal', limite?: string): string
```

Reusa las funciones de fecha que ya tiene este archivo (`msDeFecha`, `fmtFecha`, `validarFecha`);
necesita agregar un `ultimoDiaDelMes(y, m0)` local, mismo cálculo exacto que ya existe en
`evaluaciones.ts` (duplicado a propósito, mismo criterio que ya usa `diaSiguiente()` en
`liquidaciones/cliente.tsx` para no importar entre capas que no corresponde).

`sugerirRango()` pasa a usar `finDePeriodo(desde, acuerdo.modalidad, acuerdo.fechaFin)` en vez de
`calcularCiclo(desde, hoyPeru())` — deja de necesitar `hoyPeru()` para esto (aunque puede seguir
haciendo falta para otra cosa si el helper lo requiere en el futuro).

**Va con test.** `packages/core/src/sueldos.test.ts`, casos mínimos: semanal (7 días exactos),
mensual con mes corto de por medio (igual que el caso bisiesto/mes-corto que ya se probó para
`calcularCiclo`), y el recorte a `limite` cuando el período se pasaría del final del acuerdo.

### F-2 — `sueldo_liquidacion_cerrar` marca el ACUERDO COMPLETO como liquidado al cerrar CUALQUIER tramo

**Lo que decía la spec (§4, "Lo que esta spec NO hace"):** *"No cambia... ni
`sueldo_liquidacion_cerrar`: ya operan por fila y por el período de la propia liquidación, no del
acuerdo."* **Es incompleto.** Cierto para el congelado y para el sellado de movimientos/ventas —
falso para esta línea puntual, verificada en `packages/db/migrations/0073_sueldos_rpc.sql:397`:

```sql
update sueldo_acuerdos set estado = 'liquidado' where id = l.acuerdo_id;
```

Sin condición de ningún tipo. Cerrar julio de un acuerdo de tres meses marca el acuerdo ENTERO como
`'liquidado'`. Consecuencia verificada en cadena: `sueldo_acuerdos.estado <> 'liquidado'` es el
filtro que usa `/sueldos/asistencia` para decidir qué contratos muestra
(`app/sueldos/asistencia/page.tsx:46`) — el contrato desaparece de "Declarar asistencia" y agosto
queda sin forma de cargarse. Sin asistencia declarada, liquidar agosto corta con `DATO:` sin que
ninguna pantalla lo pueda resolver. El acuerdo queda inoperable después del primer tramo — exacto lo
opuesto de lo que pide esta spec.

**Corrección**, `create or replace function` sobre `sueldo_liquidacion_cerrar` (mismo archivo,
mismo cuerpo salvo esta línea):

```sql
update sueldo_acuerdos
   set estado = 'liquidado'
 where id = l.acuerdo_id
   and l.periodo_hasta >= (select fecha_fin from sueldo_acuerdos where id = l.acuerdo_id);
```

Sólo pasa a `'liquidado'` cuando el tramo que se cierra llega hasta el final real del acuerdo — el
mismo criterio, aplicado ahora que "cerrar una liquidación" y "terminar de pagar el acuerdo" dejan
de ser la misma cosa. Es C-7 de esta spec: va en la MISMA migración `0093` (agrega una función más,
no una migración nueva — sigue siendo el mismo tema).

**No hace falta tocar `sueldo_liquidacion_anular`** (revierte a `'vigente'` en cualquier
anulación, sin condición): es la dirección segura — reabrir de más nunca bloquea un pago, sólo lo
deja editable antes de lo estrictamente necesario. Se queda así.

**Va con test.** Caso nuevo en `0093_liquidacion_por_tramos.prueba.sql`: cerrar julio (tramo 1 de
3) y comprobar que el acuerdo sigue `'vigente'`; cerrar el tramo que llega hasta `fecha_fin` y
comprobar que pasa a `'liquidado'`.

### F-3 — la migración rompe la única prueba de punta a punta de la cadena del sueldo

`tools/pruebas/cadena-sueldo.test.ts:197` llama `rpc('sueldo_entrada', { p_acuerdo: acuerdoId })`
— la firma vieja. Después de esta migración esa llamada devuelve `PGRST202` (función no
encontrada). Es el único test que corre la cadena completa contra una base real (packages/core
+ RPC), y no corre en `tools/verificar-local.sh` ni en CI — se rompería en silencio.

**Corrección, una línea:** el escenario de ese archivo ya es un acuerdo de una sola semana con
constantes `DESDE`/`HASTA` que coinciden exacto con `fecha_inicio`/`fecha_fin` del acuerdo que
arma — el tramo natural a pedir es el acuerdo completo:

```ts
entrada = await rpc('sueldo_entrada', { p_acuerdo: acuerdoId, p_desde: DESDE, p_hasta: HASTA });
```

Los `.prueba.sql` de `0073`/`0078`/`0085` que también llaman `sueldo_entrada(ac)` con un solo
argumento **no se tocan**: son artefactos históricos de sus propias migraciones, ya corridos una
vez cuando esas migraciones se aplicaron, y este repo no los vuelve a correr — no son parte de
ninguna regresión continua.

### F-4 — `/sueldos/acuerdos` sigue sugiriendo (y mostrando) cifras del contrato completo

C-6 corrigió `pagoMensual`, pero dos cifras más de `analizar()`
(`apps/erp-web/app/sueldos/acuerdos/cliente.tsx`) siguen calculadas contra las horas de TODO el
acuerdo, no contra una unidad de la modalidad:

- `valorHora: pactado / horas` — con `pactado` ahora como cuota, esto muestra un valor por hora
  varias veces menor que el real de cada liquidación.
- `sugerido: sueldoSugerido(escala, horas)` (`packages/core/src/sueldos.ts:501-508`, `tarifaHora ×
  horas`) — sugiere varias veces la cuota real. Si el administrador copia esa sugerencia al campo
  "Sueldo pactado del periodo", paga de más cada mes, no de menos: es la imagen en espejo de F-1.

**Corrección:** las dos cuentas pasan a usar las horas de **una unidad de la modalidad** desde
`fechaInicio` (mismo `finDePeriodo()` de F-1, con `resumirHorario()` acotado a esos días), no las
del contrato completo. `dias`, `horasMensuales`, `almuerzoPeriodo`/`almuerzoMensual` no cambian: son
informativos sobre el contrato completo y siguen siendo correctos como tales.

**Mejora menor, opcional, mismo archivo:** "Pago del periodo" (línea ~656) hoy sólo repite
`sueldoPactado` formateado — con `sueldoPactado` como cuota, va a mostrar el MISMO número que "Pago
por liquidación" (C-6), lo cual es redundante sin ser incorrecto. Si hay tiempo, repropósito a
"Total estimado del contrato" = `pactado × cantidad de unidades de modalidad en el rango completo`,
etiquetado como estimado. Si no hay tiempo, se deja para después — no es un fallo, es una
oportunidad de claridad.

### F-5 — se puede guardar un tramo que nunca se vio en el "Calcular"

En `liquidaciones/cliente.tsx`, cambiar las fechas de Desde/Hasta **no** limpia el `preview`, y
"Guardar borrador" no comprueba que el rango actual sea el mismo que se calculó. Se puede calcular
julio, mirar los números, después estirar "Hasta" hasta agosto sin volver a apretar "Calcular", y
guardar un borrador de un período que nadie vio en pantalla.

**Corrección:** los dos `onChange` de fecha llaman `setPreview(null)` (igual que ya hace
`elegirAcuerdo`), y el botón "Guardar borrador" se deshabilita salvo que `preview` exista Y
`preview.entrada.fechaInicio === rango.desde && preview.entrada.fechaFin === rango.hasta`.

### F-6 — la prueba de `0093` no ejerce 4 de las 6 conversiones de rango que hace la migración

El montaje de `0093_liquidacion_por_tramos.prueba.sql` no tiene ninguna fila en `sueldo_movimientos`
ni en `sueldo_ventas`, y agosto/septiembre quedan totalmente vacíos (sin ninguna fila, ni siquiera
`'sin_dato'`). Eso significa que si alguna de las cinco llamadas a
`private.sueldo_movimientos_lista`/`_conteo`, o el `between` de `sueldo_ventas`, o el `between` del
control de "día a medio declarar" (`v_mixtos`) se hubiera dejado sin convertir a `p_desde`/`p_hasta`
por error, **los 8 casos existentes seguirían dando `[ok]` igual** — la prueba no puede atrapar
exactamente el tipo de error que esta migración más necesita que se atrape.

**Corrección, sumar al montaje:** una fila de `sueldo_movimientos` (tipo `adelanto`) fechada en
agosto; una fila de `sueldo_ventas` fechada en agosto; un día de agosto con una fila `'trabajado'`
Y una `'sin_dato'` a la vez (dispara `v_mixtos` si el rango pedido lo alcanza). Nuevo caso: liquidar
sólo julio (`sueldo_entrada(ac, '2099-07-01','2099-07-31')`) devuelve `adelantos: []` y `ventas: []`
(el de agosto no se cuela) y NO corta por "tramos sin cerrar" (el día mixto de agosto queda fuera
del rango pedido). Sumar también los dos casos de F-2 (arriba).

---

**Orden de implementación de este addendum:** F-3 primero (una línea, desbloquea poder seguir
verificando con la prueba de punta a punta corriendo). Después F-1/F-1b y F-4 juntos (comparten el
helper `finDePeriodo()`). Después F-2 (además de la migración, es una decisión técnica —no de
negocio— que no necesita volver a preguntarle a Alexander: es la lectura fiel de qué significaba
`'liquidado'` desde antes de esta spec, aplicada ahora que un acuerdo puede tener más de una
liquidación). Después F-6 (para que la prueba de verdad cubra F-2 y las conversiones de rango).
F-5 es independiente, se puede hacer en cualquier momento. La corrección opcional de F-4 al final,
si hay tiempo.
