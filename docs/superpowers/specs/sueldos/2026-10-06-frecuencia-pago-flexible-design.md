# Frecuencia de pago flexible (mensual, quincenal, semanal o la que decida el admin)

> Spec completa (cadena del sueldo). Tickets imalexandre05/lucebien-tablero#8 y #33.
> Decisiones del dueño (05 y 06-oct-2026), citadas donde importan.

## 1. Lo que pidió el dueño

- «Un contrato es un período de tiempo trabajando; los pagos son otra cosa y se hacen mensual,
  semanal o según se defina con el trabajador.»
- «Los períodos de pago no solo serán mensuales: pueden ser quincenales o según el período que
  decida el admin con ese contrato. Y debe ser flexible a cambios.»
- Estética: «lo más simple posible», como la maqueta aprobada
  (https://claude.ai/artifact/2rW9qheRd3BjY5yiQqgzp4).

## 2. Estado actual (verificado)

- Un contrato largo ya se paga por tramos (0093). `sueldo_pactado` es la cuota de **cada** pago.
- `modalidad` sólo admite `mensual` o `semanal` (check en `sueldo_acuerdos`, 0072:90);
  `finDePeriodo` (`packages/core/src/sueldos.ts:428`) sólo conoce esas dos.
- La frecuencia no se puede cambiar a mitad del contrato sin crear otro contrato.
- Borde #33: un contrato «del 7 al 7» deja un último tramo de 1 día que cobra el sueldo entero.

## 3. La regla

### 3.1 Frecuencias

El contrato tiene una **frecuencia de pago**, una de:

| Frecuencia | Cómo se cortan los pagos |
|---|---|
| Mensual | del día de inicio al día anterior del mes siguiente (ya existe) |
| Quincenal | dos por mes, anclados al día de inicio: del día *d* al *d+14*, y del *d+15* al día anterior a *d* del mes siguiente |
| Semanal | cada 7 días desde el inicio (ya existe) |
| Cada N días | cada N días desde el inicio; N entero entre 1 y 62, lo elige el admin |

La definición de «quincenal» anclada al día de inicio es un **default** (comentado y anotado en
`docs/pendientes-negocio.md`): si el dueño prefiere quincenas fijas 1–15 / 16–fin de mes, se agrega
como otra opción sin tocar las demás.

### 3.2 Flexible a cambios

- El admin puede **cambiar la frecuencia y la cuota** de un contrato vigente en cualquier momento.
- El cambio aplica **desde el próximo pago que todavía no se pagó**: lo ya pagado (liquidaciones
  cerradas) no se toca nunca.
- Si hay un pago calculado pero sin confirmar (borrador) que se cruza con el cambio, el sistema lo
  avisa y pide recalcularlo.
- Al cambiar la frecuencia, el sistema **sugiere** una cuota proporcional (p. ej. S/650 mensual →
  S/325 quincenal) pero **el admin la confirma o la cambia**; nunca se aplica sola (no-negociable 5).
- Se guarda el historial de cambios (fecha, frecuencia y cuota anteriores y nuevas, quién lo hizo),
  visible en la ficha del contrato: «Desde el 10-nov: quincenal S/325 (antes mensual S/650)».

### 3.3 Último pago y bordes (#33)

- El último pago termina en la fecha de fin del contrato. Si queda un pago **más corto** que la
  frecuencia, su cuota se **prorratea por días** y la pantalla lo dice («Último pago: 5 días ·
  S/108,33»). El admin puede ajustarla antes de confirmar. Prorrateo = default anotado.
- Al crear un contrato, la pantalla sugiere como fecha de fin el día anterior al aniversario (p. ej.
  inicio 10-ago → fin 9-feb), para no generar un pago de 1 día.

## 4. Datos

- `sueldo_acuerdos.modalidad` pasa a admitir `mensual | quincenal | semanal | dias` y se agrega
  `sueldo_acuerdos.cada_dias int null` (obligatorio sólo si `modalidad = 'dias'`).
- Tabla nueva `sueldo_acuerdo_cambios` (acuerdo_id, desde, modalidad, cada_dias, sueldo_pactado,
  creado_por, creado_en): cada fila define la frecuencia y la cuota **desde** esa fecha. La frecuencia
  vigente para una fecha es la última fila con `desde <= fecha`; sin filas, la del contrato.
- RLS: igual que `sueldo_acuerdos` (sólo admin/dueño escriben; aislamiento de sueldo, regla 3).
- Migración idempotente y retrocompatible: los contratos existentes siguen exactamente igual.

## 5. Cálculo

- `finDePeriodo` (core) se generaliza a las cuatro frecuencias y recibe la frecuencia **vigente** en
  la fecha de inicio del tramo; `sugerirRango` y la línea de tiempo de pagos usan lo mismo.
- La liquidación usa la cuota vigente del tramo. El motor (`liquidarPeriodo`) no cambia de fórmula:
  sólo recibe la cuota y el rango correctos.
- Fechas en hora Perú; el core nunca llama `new Date()` (regla 4).

## 6. Interfaz (simple, como la maqueta)

- Al crear o editar el contrato: un selector «Cómo se paga» con 4 botones (Mensual · Quincenal ·
  Semanal · Cada __ días) y, debajo, la vista previa del calendario: «6 pagos de S/650: 10-sep, 10-oct…».
- En la ficha del contrato (línea de tiempo de la maqueta): un enlace «Cambiar cómo se paga» abre un
  panel corto: nueva frecuencia, cuota sugerida editable, «desde el próximo pago (10-nov)», y la vista
  previa de los pagos que cambian. Confirmar.
- Las tarjetas de cada pago muestran su frecuencia sólo si cambió («Quincenal desde 10-nov»).

## 7. Tests (antes del código)

1. Quincenal anclado: inicio 10-ago → 10–24 ago, 25-ago–9-sep, 10–24 sep…
2. Cada 10 días y semanal: cortes correctos, incluido el cruce de año.
3. Último pago corto: prorrateo correcto; contrato «del 10 al 9» no genera pago de 1 día.
4. Cambio de mensual a quincenal el 10-nov con agosto–octubre pagados: lo pagado no cambia; desde el
   10-nov tramos quincenales con la cuota confirmada.
5. Cambio con un borrador cruzado → aviso y recalcular.
6. Contratos existentes sin cambios → liquidaciones idénticas a hoy (regresión).

## 8. Fuera de alcance

El rediseño visual completo de pagos (#44) usa esta regla; se implementa en su propio PR encima de
éste. Pago por puntos (#10) y valores pactados (#20) son PRs aparte.
