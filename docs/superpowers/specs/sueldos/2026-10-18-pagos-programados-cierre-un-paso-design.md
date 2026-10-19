# SPEC — Pagos programados desde el contrato y cierre en un solo paso

> Spec completa · cadena del sueldo · sesión 7 · 18-oct-2026 · sin migración.
> Decisiones del dueño n.º 6 y n.º 7 (18-oct-2026). Se apoya en
> [2026-10-18-sueldo-por-horas-design.md](2026-10-18-sueldo-por-horas-design.md) y en la spec de
> frecuencia flexible (`calendarioDePagos`, `finDePeriodo`).

## 1. Lo que decidió el dueño (18-oct-2026)

> **6. PAGOS PROGRAMADOS DESDE EL CONTRATO.** «La ficha muestra los pagos ya calculados según la
> frecuencia (mensual, quincenal, semanal, cada N días; usa finDePeriodo del core). Ej. mensual del
> 05-ago al 30-oct: 05-ago→04-sep, 05-sep→04-oct, 05-oct→30-oct (el último corto, se paga por sus
> horas). Cada pago con estado «Por cerrar», «Cerrado», «Pagado». El selector de período de arriba
> ofrece esos pagos.»
>
> **7. SIN BORRADORES.** «Cerrar un pago es un solo paso: ver el cálculo → «Confirmar y cerrar».
> Corregir después con «Corregir» (ya existe, conserva abonos 0137). Quita el paso de borrador de la
> interfaz; si la base lo necesita internamente, que sea invisible.»

## 2. Lo que hay hoy (verificado)

- `calendarioDePagos(contrato, cambios)` (core) ya corta los pagos de un contrato con su frecuencia y
  sus cambios. Nadie lo muestra como «los pagos de esta persona».
- Cerrar es dos pasos: «Guardar borrador» y después «Cerrar». El borrador se ve en la ficha («Un
  borrador todavía cambia…») y en `/sueldos/liquidaciones`.
- El cierre (0111/0121) necesita una fila `borrador` para comparar: la base sigue usándola.

## 3. Pagos programados

`pagosProgramados(contrato, cambios, liquidaciones)` (core, puro, sin `new Date()`):

- Los pagos son los de `calendarioDePagos`. Mensual 05-ago→30-oct da 05-ago→04-sep, 05-sep→04-oct y
  05-oct→30-oct (el último corto; por horas paga sus horas, por sueldo fijo se prorratea como hoy).
- Estado de cada pago, mirando sólo las liquidaciones **cerradas** del contrato (las anuladas y los
  borradores no cuentan):
  - **Pagado**: todos sus días están en liquidaciones cerradas y a ninguna le queda saldo.
  - **Cerrado**: todos sus días están en liquidaciones cerradas y a alguna le queda saldo.
  - **Por cerrar**: todo lo demás. Si una parte ya está cerrada (rangos de antes), `parcial: true` y
    la pantalla lo dice («Una parte ya se cerró»).
- Cada pago trae las liquidaciones que lo cubren (id, total, pagado) y, en un contrato por horas, la
  referencia «≈ S/ … si cumple su horario» (`referenciaPorHoras`).
- `pagoQueContiene(pagos, fecha)` devuelve el pago de hoy (lo usa el período por defecto).

## 4. El selector de período de arriba

- Junto a los botones de siempre (mes actual, mes anterior, ciclo), la barra ofrece **«Sus pagos»**:
  un botón por pago del contrato vigente (y del anterior si lo hubo), con la fecha corta
  («05 ago – 04 sep») y un punto de color del estado (verde Pagado, dorado Cerrado, gris Por cerrar).
- Al entrar a la ficha sin período en la dirección, el período por defecto es **el pago que contiene
  hoy**; sin contrato, el mes actual (como hoy).
- El rango sigue siendo libre: se puede escribir cualquier desde/hasta.

## 5. Cerrar en un paso

- En la pestaña Pago, con el período elegido:
  - Si es un pago **Por cerrar** cuyo último día ya pasó (o es hoy): «Ver el cálculo» muestra el
    detalle (las tres filas de horas, bonos, descuentos y total) y un solo botón **«Confirmar y
    cerrar»**. Un pago que todavía no termina dice «Se cierra cuando termine, el 04 sep» (se puede
    cerrar igual eligiendo un rango que termine hoy o antes).
  - Si es **Cerrado** o **Pagado**: total, pagado, saldo, «Registrar pago» y «Corregir».
- «Confirmar y cerrar» hace todo en el servidor, en una sola acción:
  1. borra los borradores de ese contrato que se pisan con el rango (son internos; si alguno era de
     una corrección con cuota fijada, se reusa esa cuota);
  2. crea el borrador con el cálculo de ese momento;
  3. lo cierra (la base compara y sella como siempre);
  4. si el cierre falla, borra el borrador recién creado y muestra el motivo con qué hacer (p. ej.
     «Falta resolver la asistencia del 07 oct: resuélvelo en Asistencia y vuelve a confirmar»).
- **Corregir**: «Corregir» muestra el cálculo nuevo y pide el motivo → «Confirmar corrección» anula
  para corregir (0137, conserva abonos), crea y cierra en una sola acción. Si el cierre falla, el
  pago queda «Por cerrar» (la anulada se ve en el historial) y «Confirmar y cerrar» lo termina: la
  base vuelve a enlazar la corrección sola (0137) y los abonos se conservan.
- La palabra «borrador» no aparece en ninguna pantalla. En `/sueldos/liquidaciones` («Liquidaciones
  de todos») el flujo es el mismo: «Ver el cálculo» → «Confirmar y cerrar».

## 6. Qué no cambia

- La base: el cierre (0111/0121), los sellos, los abonos (0080/0137) y la RLS. Sin migración.
- Liquidaciones cerradas: intactas.

## 7. Tests (antes del código)

1. Mensual 05-ago→30-oct: tres pagos con esas fechas; el último corto.
2. Estados: sin liquidaciones → Por cerrar; cerrada con saldo → Cerrado; cerrada pagada → Pagado;
   anulada o borrador → Por cerrar; dos cerradas que cubren el pago → Cerrado/Pagado; una cerrada que
   cubre la mitad → Por cerrar parcial.
3. Quincenal, semanal y cada N días: los mismos cortes que `calendarioDePagos`.
4. `pagoQueContiene`: el pago de hoy; null fuera del contrato.
5. Repo `confirmarYCerrar`: borra el borrador previo, crea y cierra; si el cierre falla borra el
   recién creado y propaga el error; reusa la cuota fijada de un borrador de corrección.
6. Repo `corregirYCerrar`: anula para corregir, crea con la cuota pagada y cierra; si el cierre falla,
   borra el nuevo y avisa que el pago quedó por cerrar.

## 8. Defaults inventados

- Período por defecto = el pago que contiene hoy.
- «Pagado» = saldo 0 en todas las liquidaciones que lo cubren.

## 9. Ajustes del verificador (18-oct-2026)

Reemplazan lo que §3 y §5 decían en contrario.

1. **Sólo se cierra hasta ayer.** El servidor rechaza `hasta >= hoy` (hora Perú): «Hoy todavía no
   termina: cierra hasta ayer o espera a mañana». Así ninguna marca del día queda fuera de un pago ya
   cerrado. En la ficha, un pago cuyo último día es hoy o después dice «Se cierra cuando termine».
2. **Antes de borrar nada se calcula.** «Confirmar y cerrar» arma primero la entrada del rango; si eso
   falla (un día sin resolver, un rango imposible) no se borra ningún borrador y se muestra el motivo.
3. **Qué borrador se reemplaza.** Sólo el borrador interno con **exactamente el mismo rango**. Si otro
   borrador se pisa con el rango, no se toca: responde «Hay un cálculo pendiente del … al … que se pisa
   con este pago: ciérralo o bórralo en Liquidaciones de todos». La cuota fijada de una corrección sólo
   se reusa si el rango es el mismo.
4. **Una corrección nunca pierde su cuota.** Si el cierre falla, el borrador recién creado se borra,
   **salvo** que sea de una corrección (cuota fijada): ése queda «Por cerrar» con su cuota, y el
   próximo «Confirmar y cerrar» la reusa. `corregirYCerrar` hace lo mismo: si el cierre falla, el
   reemplazo queda «Por cerrar».
5. **Pago parcial.** `pagosProgramados` devuelve también `pendientes`: los sub-rangos del pago que no
   están en ninguna liquidación cerrada. La ficha ofrece «Ver el cálculo» y «Confirmar y cerrar» por
   cada uno, y las liquidaciones cerradas de un pago parcial también muestran «Corregir».
