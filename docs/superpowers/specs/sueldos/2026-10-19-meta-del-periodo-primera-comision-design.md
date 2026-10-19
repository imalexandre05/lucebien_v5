# SPEC — Meta del período y 1.ª comisión

> Spec completa (cadena del sueldo) · sesión 8A · 19-oct-2026 · migración **0169** (aún no está en producción).
> Decisión del dueño n.º 2, **corregida el 19-oct-2026**: la 1.ª comisión NO es mensual; va según el
> período de pago de la persona. Reemplaza la casilla «¿Cumplió la meta del mes?». Se apoya en
> [2026-10-18-ventas-metas-semanales-design.md](2026-10-18-ventas-metas-semanales-design.md) (0166).

## 1. Lo que decidió el dueño

> La 1.ª comisión va según el **período de pago** (quincenal → quincenal, semanal → semanal, mensual →
> mensual). **Meta del período = metaPorHora (o la de la temporada vigente) × horas trabajadas del
> período**, como estimado automático que el administrador puede modificar. Si las ventas del período
> (suma de la carga semanal de «Ventas y metas», o el monto que ponga el administrador) **llegan a la
> meta del período**, se desbloquea la 1.ª comisión (2% de boletas > S/120) de ese período. La pantalla
> muestra «Meta del período: S/X (estimada · editar)» con su estado Cumplida / No cumplida. La 2.ª
> comisión (S/30 por meta semanal) sigue igual.

## 2. Qué hay hoy (verificado en el código)

- La 1.ª comisión ya se desbloquea por período: `ventasTotal >= metaPeriodo` (RN-13, empate cumple).
- Pero `metaPeriodo` es la suma de las metas semanales, calculadas sobre las horas **contratadas**.
- No existe forma de que el administrador cambie esa meta.

## 3. Qué cambia

**Meta del período** (`ventas.metaPeriodo`), en este orden:
1. **La que puso el administrador** para ese período (`metaPeriodoManual`), si existe.
2. Si no, **semana por semana**: si el contrato (o la temporada de esa semana) fija una **meta semanal
   pactada**, esa semana vale su meta pactada (RN-10: lo pactado manda); si no, vale lo estimado de **esa
   semana**: la suma, día por día, de `horas trabajadas del día × metaPorHora × factorMeta`, con el
   `metaPorHora` de la **temporada vigente ese día** (si no hay, el de la configuración). Así una temporada
   que cubre solo parte del período se **prorratea por los días** de cada temporada. La meta del período es
   la suma de las semanas. `factorMeta` vale 1 salvo que se cambie (default, anotado en `pendientes-negocio.md`).

**Horas trabajadas** = las de la asistencia (incluidas las extra de un día con horario) **más** las horas
fuera de contrato del período: las ventas de esos días también suman, así que sus horas cuentan para la meta.
La meta se **redondea a céntimos antes de compararla**, para que lo que dice la pantalla sea lo que paga el motor.

**Sin horas trabajadas** en el período (cero horas, contando las fuera de contrato) **la 1.ª comisión no
aplica**: no se marca Cumplida ni se paga (`ventas.primeraComisionAplica = false`; la pantalla dice «No aplica»).

**Cumplida** si las ventas del período llegan a la meta (`>=`). Las ventas son las boletas sueltas más los
montos vendidos de las cargas semanales. Sin monto en alguna carga semanal no se puede comparar y se
mantiene la regla de la 0166 (se da por cumplida). Cumplida → 1.ª comisión = 2% × base; No cumplida → 0.

La 2.ª comisión (bono por meta semanal) **no cambia**: sigue usando las metas semanales.

## 4. Qué se guarda

Una tabla chica `sueldo_meta_periodo (empleado_id, desde, hasta, meta)`, una fila por persona y período.
Mismo aislamiento que las ventas semanales: el administrador escribe; cada persona lee lo suyo; nadie
lee lo de otro. Un período que cae en un pago cerrado no se cambia. `sueldo_entrada` entrega
`metaPeriodoManual` **solo cuando hay fila**. Además entrega siempre `reglaMetaPeriodo: 2`: un borrador
guardado antes de esta regla no la trae, y el cierre (0111) lo marca «desactualizado» y obliga a recalcularlo
(si no, se cerraría con la meta vieja).

## 5. Pantalla («Ventas y metas» de la ficha)

Tarjeta sobre la lista de semanas: «Meta del período: S/X» con la etiqueta «estimada» (o «puesta por ti»),
«Ventas del período: S/Y» y el estado **Cumplida / No cumplida**. «Editar» abre un campo para poner otra
meta; «Volver a la estimada» la quita. Solo lectura si el pago ya está cerrado. **La meta solo se puede poner cuando el rango elegido arriba coincide
con un pago de la persona**: la base la busca por el período exacto de la liquidación, y una meta guardada con
otro rango se ignoraría en silencio. Si no coincide, la tarjeta pide elegir un pago. El estado Cumplida / No
cumplida lo da el motor, no la pantalla.

## 6. Casos que debe cubrir la prueba

1. Sin meta puesta ni pactada: meta = metaPorHora × horas trabajadas; ventas ≥ meta → 2% de la base; ventas < meta → 0.
2. Menos horas trabajadas (una falta) → menor meta.
3. Meta puesta por el administrador manda sobre la estimada (más alta o más baja).
4. Meta semanal pactada en el contrato manda sobre la estimada.
5. La 2.ª comisión no cambia con la meta puesta.
6. Base: `sueldo_entrada` entrega `metaPeriodoManual` solo con fila.
7. Sin horas trabajadas la 1.ª comisión no aplica (no Cumplida, 0). Una temporada que cubre parte del período prorratea la meta por días; una meta pactada de una semana vale solo para esa semana.
8. Las horas fuera de contrato suman a la meta estimada; la meta se redondea a céntimos antes de comparar.
9. Aislamiento (la persona lee la suya, otro nada, nadie no-admin escribe), período cerrado y meta ≥ 0.
