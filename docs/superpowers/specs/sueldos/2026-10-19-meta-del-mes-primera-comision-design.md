# SPEC — «¿Cumplió la meta del mes?» y la 1.ª comisión

> Spec completa (cadena del sueldo) · sesión 8A · 19-oct-2026 · migración **0169**.
> Decisión del dueño n.º 2 (19-oct-2026). Se apoya en
> [2026-10-18-ventas-metas-semanales-design.md](2026-10-18-ventas-metas-semanales-design.md) (0166).

## 1. Lo que decidió el dueño

> 1.ª comisión (2% de boletas > S/120): en «Ventas y metas» una casilla mensual «¿Cumplió la meta del
> mes?» que desbloquea la 1.ª comisión del mes. Sin ella marcada, la 1.ª comisión es 0. La 2.ª
> (S/30 por meta semanal) sigue igual.

## 2. Qué se guarda

Una tabla chica, `sueldo_meta_mes (empleado_id, mes, cumplida)`, una fila por persona y mes
(`mes` = primer día del mes). Misma seguridad que las ventas semanales: el administrador escribe, cada
persona lee lo suyo, nadie lee lo de otro. Un mes cuyo último día cae en un pago cerrado no se cambia.

**Mes de un pago** (default inventado, anotado en `pendientes-negocio.md`): el mes calendario del
último día del período que se paga.

## 3. Qué cambia en el cálculo

`sueldo_entrada` entrega `metaMesCumplida` (true/false; sin fila = false). El core:

- `metaMesCumplida` presente → **manda la casilla**: marcada paga `2% × base`; sin marcar, 0.
  Ya no se mira si las ventas llegaron a la meta.
- `metaMesCumplida` ausente (entrada guardada antes de esta migración, o pruebas viejas) → la regla
  anterior (ventas del mes ≥ meta del mes), para que nada ya calculado cambie.
- La 2.ª comisión (bono por meta semanal) no cambia.
- Sin casilla marcada la línea dice: «Sin comisión: falta marcar «¿Cumplió la meta del mes?»».

Un borrador guardado antes de la migración queda «desactualizado» y se recalcula: es lo esperado,
la regla del pago cambió.

## 4. Pantalla

En «Ventas y metas» de la ficha, sobre la lista de semanas, una tarjeta corta con la casilla del mes
del período elegido: «¿Cumplió la meta del mes?» y una frase: «Sin marcarla, no se paga la comisión
del 2%.» Se guarda al marcar. Solo lectura si el pago ya está cerrado.

## 5. Casos que debe cubrir la prueba

1. Casilla marcada → comisión = 2% de la base, aunque las ventas no lleguen a la meta.
2. Casilla sin marcar (`false`) → comisión 0, aunque las ventas superen la meta.
3. Sin la clave → regla anterior.
4. La 2.ª comisión no cambia con la casilla.
5. Base: `sueldo_entrada` entrega `metaMesCumplida` false sin fila y true con ella.
6. Aislamiento: la persona ve su fila, otro no ve nada, solo el administrador escribe.
7. Mes cerrado: no se puede cambiar.
