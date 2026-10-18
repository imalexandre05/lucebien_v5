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

## 9. Enmienda del 06-oct-2026 (auditoría de dinero D-1, D-2, D-4, D-10)

> Origen: `docs/auditorias/2026-10-06-sueldos.md` (rama `audit/2026-10-06-sueldos`) y la decisión
> del dueño del 06-oct: «mensual y quincenal se cuentan desde el día en que empezó el contrato (como
> está); el admin define el período de cada contrato y puede cambiarlo». **Pendiente de
> confirmación de Alexander** antes de mergear: cambia cuánto se paga en los casos 9.1 y 9.2.

### 9.1 El aniversario no es un pago corto (D-2)

- Con frecuencia mensual, un tramo que termina el **día anterior a un aniversario** del día de
  inicio de la frecuencia (el día de inicio recortado al último día del mes, como siempre) es un
  pago **completo**: cobra la cuota entera, aunque el calendario encadenado lo vea más corto.
- Por qué: el calendario mensual se corre en los meses cortos (31-ene → 28-feb, 1-mar → 31-mar…), y
  un contrato de 6 meses exactos (31-ene al 30-jul) terminaba con un tramo «del 1 al 30 de julio»
  prorrateado a 1500 × 30/31 = S/1451,61. Con esta regla: 6 × 1500 = **S/9000**.
- Los cortes del calendario **no cambian** (los tramos ya pagados siguen siendo los mismos); sólo
  cambia la decisión de si el último tramo es corto.
- Un último tramo que no llega al aniversario se sigue prorrateando por días (§3.3).

### 9.2 Un rango que cubre varios pagos cobra la suma de sus cuotas (D-4)

- Si el rango que se liquida empieza donde empieza un pago del calendario y termina donde termina
  otro, cobra la **suma de las cuotas** de los pagos que cubre (`sueldo_pactado` es la cuota de
  **cada** pago, 0093). Ejemplo: borrador mensual del 10-sep al 09-oct (S/1300); se cambia a
  quincenal S/700 desde el 10-sep; «Recalcular borrador» del mismo rango cobra 700 + 700 =
  **S/1400**, no 700.
- Si el rango **no** coincide con los bordes del calendario y además cruza un cambio de frecuencia,
  se **rechaza** nombrando los pagos del calendario, para que se liquide cada uno por separado.
- Si no coincide con los bordes pero no cruza ningún cambio, se mantiene lo de §7.6: la cuota
  vigente entera, sin prorrateo.

### 9.3 El cierre compara lo que decide la cuota (D-1, D-10)

- La cuota de un tramo se calcula en **un solo lugar**: el core (`cuotaDeLiquidacion`), con los
  datos del contrato (inicio, fin, frecuencia, N, cuota) y sus cambios de frecuencia.
- Esos datos viajan en la entrada guardada en el borrador (`contratoPago`, `cambiosFrecuencia`),
  leídos de la base con la misma función que usa el cierre. El cierre (0111) los vuelve a leer
  **dentro de su transacción, con el contrato bloqueado**, y si no son idénticos responde
  `DESACTUALIZADA`. La cuota derivada (`sueldoPactado` de la entrada) no se compara contra el
  `sueldo_pactado` del contrato: se compara lo que la determina.
- Un cambio de frecuencia y un cierre del mismo contrato se **serializan** (los dos bloquean la fila
  del contrato): o el cambio llega antes y el cierre pide recalcular, o el cierre llega antes y el
  cambio se rechaza por caer en lo ya pagado. Borrar un cambio que cae en lo ya pagado también se
  rechaza.
- Corregir una liquidación cerrada conserva la cuota con la que se pagó (`cuotaFijada` en la
  entrada): el cierre del reemplazo no la recalcula con la regla de hoy.
- Un borrador calculado antes de esta enmienda (sin `contratoPago`) pide recalcular una vez.

### 9.4 Sigue pendiente

- La pantalla para ajustar a mano la cuota del último pago corto (§3.3) **no existe todavía**
  (auditoría D-11).

### 9.5 Tests (antes del código)

7. Mensual del 31-ene al 30-jul, S/1500: 6 pagos completos, total S/9000 (y el del 30-ene al 29-abr
   de S/600 cobra 600 en el último tramo).
8. Mensual S/1300 → quincenal S/700 desde el 10-sep: el rango 10-sep–09-oct cobra S/1400; un rango
   desalineado que cruza el cambio se rechaza.
9. Prueba SQL de la 0121: E1 (último tramo prorrateado) y E2 (tramo posterior a un cambio) se
   cierran; un cambio de frecuencia confirmado después del cálculo hace que el cierre responda
   `DESACTUALIZADA`; una corrección con cuota fijada se cierra.

## 10. Enmienda del 18-oct-2026 — sueldo por horas (decisión del dueño n.º 1)

> «Se paga horas REALES trabajadas según el huellero × tarifa por hora (escala 1–5). Se elimina el
> «sueldo pactado» como cuota fija […] Liquidar del 06 al 17 paga solo las horas de esos días.»
> Detalle completo en [2026-10-18-sueldo-por-horas-design.md](2026-10-18-sueldo-por-horas-design.md).

Rige para los contratos **con tarifa por hora** (`tarifa_hora`, migración 0164). Los contratos de
sueldo fijo de antes (sin tarifa) siguen con §3, §7.6 y §9.2 tal como estaban.

- **§3 (la regla).** Las frecuencias (§3.1) y los cambios (§3.2) siguen cortando los pagos igual.
  Lo que cambia es qué se paga en cada uno: ya no hay cuota; cada pago paga las horas de sus días ×
  la tarifa de cada día. El cambio de §3.2 puede llevar, además de la frecuencia, una **tarifa nueva**
  desde el próximo pago no pagado (sin «cuota sugerida»). **§3.3 no aplica**: un último pago corto no
  se prorratea por días; paga sus horas.
- **§7.6 (citada en §9.2: un rango que no coincide con el calendario cobra la cuota vigente entera).**
  No aplica: un rango cualquiera paga sus horas.
- **§9.2 (un rango que cubre varios pagos cobra la suma de sus cuotas).** No aplica: el rango paga las
  horas de todos sus días, crucen o no un cambio de frecuencia; no se rechaza ningún rango por cruzar
  un cambio. §9.1 (aniversario) tampoco aplica, porque no hay prorrateo.
- §9.3 (el cierre compara lo que decide el pago) sigue valiendo: la tarifa viaja en `contratoPago` y
  `cambiosFrecuencia`, que el cierre ya compara.
