# SPEC — Sueldo por horas reales y una sola idea de horas

> Spec completa · cadena del sueldo · sesión 7 · 18-oct-2026 · migración **0164**.
> Decisiones del dueño n.º 1 y n.º 2 (18-oct-2026), citadas abajo.
> Enmienda con fecha §3, §7.6 y §9.2 de
> [2026-10-06-frecuencia-pago-flexible-design.md](2026-10-06-frecuencia-pago-flexible-design.md) (ver §10 de esa spec).

## 1. Lo que decidió el dueño (18-oct-2026)

> **1. SUELDO POR HORAS.** «Se paga horas REALES trabajadas según el huellero × tarifa por hora
> (escala 1–5, PR #69). Se elimina el «sueldo pactado» como cuota fija: el contrato tiene tarifa por
> hora + horario, y muestra «≈ S/600 al mes» solo como referencia (horas del horario del mes ×
> tarifa). Si cumple todas sus horas sin tardanzas ≈ S/600. Liquidar del 06 al 17 paga solo las horas
> de esos días. Extras (horas más allá del horario, incluido trabajar un día que no le tocaba) también
> se pagan; bonos por ventas/metas aparte. […] Contratos y liquidaciones cerradas existentes NO
> cambian (regresión).»
>
> **2. UNA SOLA IDEA DE HORAS.** «El admin no entiende «Horas fuera de contrato» vs «Diferencia de
> horas». Muéstralo como «Horas trabajadas» (dentro de su horario), «Horas extra» (todo lo trabajado
> fuera de su horario, incluido un día no programado) y, si aplica, «Horas que faltaron», con detalle
> al hacer clic. El factor de hora extra sigue editable.»

## 2. Lo que hay hoy (verificado contra `packages/core/src/sueldos.ts` y la 0121/0144)

- El contrato guarda `sueldo_pactado` (la cuota de **cada** pago, 0093) y el motor deriva
  `valorPorHora = cuota ÷ horas contratadas del tramo`. Las líneas son «Sueldo» (la cuota),
  «Diferencia de horas» (trabajadas − contratadas, × valorPorHora) y «Horas fuera de contrato» (días
  sin horario, × valorPorHora × factor).
- Por eso el valor de la hora **cambia con el mes**: un mes con más días hábiles paga menos la hora.
  Y un pago corto se prorratea por días, no por horas (§3.3 de la spec de frecuencia).
- La escala (1–5) sólo **sugiere** un sueldo (`sueldoSugerido = tarifa × horas`); la tarifa no se
  guarda en el contrato.

## 3. La regla nueva

### 3.1 El contrato por horas

Un contrato por horas tiene: **tarifa por hora** (`tarifa_hora`), **horario** (los turnos de siempre)
y **frecuencia de pago** (la de la spec de frecuencia, sin cambios). Ya no tiene cuota: su
`sueldo_pactado` queda en 0 y no se usa.

- La tarifa se elige con la **escala** (1–5): al elegir la escala se completa la tarifa de esa escala
  en `/configuracion` (`escala_N_tarifa_hora`). El administrador la puede cambiar antes de guardar.
  Queda **guardada en el contrato** (como los valores pactados, spec 2026-10-05): cambiar la escala en
  `/configuracion` no mueve un contrato ya hecho.
- Un cambio de tarifa a mitad del contrato (p. ej. sube de escala en el 5.º mes) se registra igual
  que un cambio de frecuencia (`sueldo_acuerdo_cambios`, con `tarifa_hora`), **desde el próximo pago
  que todavía no se pagó**. Lo ya pagado no se toca.

### 3.2 Cuánto se paga

Para cada día del rango que se liquida:

| Nombre en pantalla | Cálculo del día | Se paga |
|---|---|---|
| **Horas trabajadas** | `min(horas trabajadas del día, horas de su horario ese día)` | × tarifa del día |
| **Horas extra** | `max(0, horas trabajadas − horas de su horario)`; en un día **sin horario**, todas las horas | × tarifa del día × factor de hora extra |
| **Horas que faltaron** | `max(0, horas de su horario − horas trabajadas)` | **no se pagan** (sólo se informan) |

- «Horas trabajadas del día» se cuentan igual que hoy (RN-05, C-01): suma de los tramos, las pausas
  no se pagan, un tramo con un solo lado vale 0.
- **Interpretación (default a confirmar, anotado en `pendientes-negocio.md`):** «dentro de su horario»
  se mide por la **cantidad de horas del día**, no por la hora del reloj. Quien llega 30 min tarde y
  se queda 30 min más cumple sus horas: no gana horas extra por eso (sí paga la tardanza). Quien hace
  más horas que su horario ese día, gana la diferencia como extra.
- El **factor de hora extra** es el `factorHoraFueraContrato` de siempre (default 1, editable en
  `/configuracion` y por contrato). Ahora aplica a **todas** las horas extra, también las de un día
  con horario.
- **Tarifa del día:** la del contrato, o la del último cambio con `desde <= día` que tenga tarifa.
- **Un rango cualquiera paga sus horas.** Liquidar del 06 al 17 paga las horas del 06 al 17. No hay
  cuota que prorratear ni sumar (ver la enmienda §10 de la spec de frecuencia).

Lo demás **no cambia**: tardanzas (RN-08), falta injustificada (RN-09: además del día no pagado,
`diasDescuentoPorFalta − 1` días de castigo × horas del horario de ese día × tarifa del día),
almuerzos, comisión (1.ª), bono por metas (2.ª), pasajes, capacitación, bono por puntos, adelantos,
reportes y bonos extra.

### 3.3 La referencia «≈ S/600 al mes»

`referencia = horas de su horario en el período × tarifa`. Es lo que cobraría si cumple todas sus
horas sin tardanzas, sin extras ni bonos.

- En el contrato: el primer mes del contrato (del inicio al día anterior del mes siguiente, recortado
  al fin). Texto: «≈ S/600 al mes si cumple su horario».
- En cada pago y en la liquidación: las horas de su horario en ese pago × tarifa. Texto: «Si cumple su
  horario: ≈ S/600».
- **Nunca se paga la referencia.** Es sólo para orientarse.

### 3.4 Los contratos de antes (regresión)

- Un contrato **sin tarifa** (`tarifa_hora` nula: todos los que existen al aplicar la 0164) se sigue
  liquidando **exactamente igual que hoy**: cuota, prorrateo, «Sueldo», «Diferencia de horas» y
  «Horas fuera de contrato». En pantalla se rotula «Sueldo fijo (contrato anterior)».
- Las liquidaciones cerradas no se recalculan nunca (como siempre): su snapshot manda.
- El administrador puede pasar un contrato de sueldo fijo a por horas poniéndole tarifa: rige para los
  pagos que todavía no se cerraron (lo cerrado no cambia).

## 4. Datos (migración 0164)

- `sueldo_acuerdos.tarifa_hora numeric(10,4) null`, `check (tarifa_hora is null or tarifa_hora > 0)`.
  Nula = sueldo fijo (contrato anterior).
- `sueldo_acuerdo_cambios.tarifa_hora numeric(10,4) null`, mismo check. Nula = sigue la tarifa anterior.
- `sueldo_entrada_pago` agrega `tarifaHora` a `contratoPago` y a cada cambio **sólo cuando no es
  nula**. Así un borrador de un contrato de sueldo fijo sigue siendo idéntico y no pide recalcular, y
  el cierre (0121) compara la tarifa sin cambiar su código: la tarifa viaja en lo que ya compara.
- Sin parámetros de negocio nuevos (el factor y las escalas ya existen).

## 5. Motor (`packages/core/src/sueldos.ts`)

- `ContratoPago` y `CambioFrecuencia` aceptan `tarifaHora?: number | null`.
- `EntradaLiquidacion` acepta `contratoPago` y `cambiosFrecuencia` (ya viajan en la entrada desde la
  0121). Con `contratoPago.tarifaHora` presente, `liquidarPeriodo` liquida **por horas**; sin ella,
  igual que hoy.
- Funciones nuevas: `tarifaDelDia(contrato, cambios, fecha)` y
  `referenciaPorHoras(horario, desde, hasta, tarifa)`.
- Líneas por horas (en este orden, reemplazando «Sueldo», «Horas fuera de contrato» y «Diferencia de
  horas»):
  - ingreso **«Horas trabajadas»** — «N h dentro de su horario × S/t».
  - ingreso **«Horas extra»** — «N h fuera de su horario × S/t» (y «× f» si el factor no es 1).
  - ajuste **«Horas que faltaron»**, monto 0 — «N h de su horario que no trabajó: no se pagan». Sólo
    si N > 0.
- La salida suma `modo: 'horas' | 'fijo'`, `base.tarifaHora`, `base.referencia`,
  `asistencia.horasDentro`, `asistencia.horasExtra`, `asistencia.horasFaltaron` y `dias[]` (por día:
  horario, trabajadas, dentro, extra, faltaron, tarifa) para el detalle al hacer clic. Todos
  opcionales en el tipo para leer snapshots viejos.
- `base.valorPorHora` = tarifa del primer día (la columna `valor_por_hora` sigue siendo obligatoria).
- Un rango sin ningún día con horario se puede liquidar por horas (paga sus extras); por sueldo fijo
  sigue cortando como hoy.
- `resumenLiquidacion`: «Horas trabajadas» suma al sueldo; «Horas extra» a horas extras.
- `MOTOR_VERSION` sube a `2026-10-18`.

## 6. Pantallas

- **Contrato (crear/editar):** «Escala» (1–5) → «Tarifa por hora» (se completa sola, editable) →
  debajo, en grande y en dorado: «≈ S/600 al mes si cumple su horario». No se pide sueldo pactado en
  un contrato nuevo. Un contrato viejo muestra «Sueldo fijo (contrato anterior): S/650 por pago» y el
  botón «Pasar a pago por horas».
- **Liquidación (vista previa, detalle, comprobante):** tres filas — Horas trabajadas, Horas extra,
  Horas que faltaron (si hay) — con horas y monto; al hacer clic, el detalle día por día.
- **«Mi pago»** del colaborador: las mismas tres filas, mismas palabras.
- Palabras simples, sin «RN-…» a la vista, sin «diferencia» ni «fuera de contrato».

## 7. Tests (antes del código)

1. Horario 30 h/semana, tarifa S/5, cumple todo: horas trabajadas × 5, sin extra ni faltaron; total =
   referencia.
2. Liquidar del 06 al 17: paga sólo las horas de esos días (sin prorrateo ni cuota).
3. Día con 2 h más que su horario: 2 h extra × tarifa × factor (factor 1,5 → 1,5 veces).
4. Día sin horario trabajado 4 h: 4 h extra.
5. Día con 1 h menos: 1 h «faltaron», no se paga, sin descuento extra.
6. Falta injustificada: el día no se paga + 1 día de castigo a tarifa (`diasDescuentoPorFalta` 2).
7. Cambio de tarifa a mitad del rango: cada día con su tarifa.
8. Tardanza, almuerzo, comisión y bono semanal: iguales que hoy con los mismos datos.
9. Contrato sin tarifa: liquidación idéntica a la de hoy (regresión, golden test intacto).
10. `resumenLiquidacion` con las líneas nuevas.
11. SQL 0164: la tarifa se guarda; `sueldo_entrada_pago` la emite sólo si no es nula; un contrato sin
    tarifa da el mismo jsonb que antes; tarifa ≤ 0 se rechaza; el cierre de un borrador por horas
    pasa y responde `DESACTUALIZADA` si la tarifa cambió después del cálculo.

## 8. Defaults inventados (en `docs/pendientes-negocio.md`)

- «Dentro de su horario» = por cantidad de horas del día, no por hora del reloj (§3.2).
- Referencia del contrato = su primer mes (§3.3).
- Tarifa con 4 decimales.

## 9. Fuera de alcance de esta spec

Pagos programados y cierre en un paso (decisiones 6 y 7), ficha única y asistencia visual (5 y 4) y
ventas rápidas (8) tienen su propia spec y PR.
