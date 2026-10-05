# Pago por puntos sobre la meta mensual

> Spec completa (cadena del sueldo, no-negociable 1). Ticket imalexandre05/lucebien-tablero#10.
> Decisiones del dueño del 05-oct-2026, citadas textualmente donde importan.

## 1. Lo que decidió el dueño

- «Los extras no se vuelven pagos, lo que sí son los puntos.»
- «Cuando se llegue a cierta cantidad de puntos definida [...] ahí recién cobrarán por puntos.»
- La meta mensual **todavía no se define**: se fijará después de un mes de uso, mirando el promedio
  real. «Puede ya estar construido y ser editable.»
- «Llegar a las metas también paga extras»: se **mantienen** el bono por meta semanal de ventas y la
  comisión, y deben seguir siendo editables (ya lo son: `sueldo_bono_meta_semanal`,
  `sueldo_pct_comision`, `sueldo_factor_meta`, `sueldo_monto_minimo_comision`,
  `sueldo_meta_por_hora` en `/configuracion`, mapa de `0078`).

## 2. Cómo funciona hoy (verificado en el código el 05-oct)

- Los puntos se suman en `private.evaluacion_componentes_datos` (0095:251-256, clave `puntosTotal`):
  pipeline + extras de reportes + actividades + ventas (hoy 0) − incidencias.
- Esos puntos **sólo** fijan la nota del mes (`notaDesdePuntos`, `packages/core/src/evaluaciones.ts:193`).
  `sueldo_entrada` (0098:250-273) no los envía al motor, así que **hoy no pagan nada**.
- Los extras de reportes tienen `monto_total` en soles (0081:124-140) que **sólo se muestra** en
  `/evaluaciones` (`app/evaluaciones/cliente.tsx:475`); no llega a ningún pago. El «bono extra» de
  `/sueldos/movimientos` es otra cosa: lo carga el admin a mano y sí paga; no se toca aquí.

## 3. La regla nueva

Dos parámetros nuevos en `/configuracion` (grupo Sueldos), con el mismo mecanismo que los 15 de
`sueldo_parametros_config`:

| Clave | Qué es | Default |
|---|---|---|
| `sueldo_puntos_meta_mensual` | Puntos del mes a partir de los cuales se paga | **vacío = desactivado** |
| `sueldo_soles_por_punto` | Soles por cada punto que supera la meta | **vacío = desactivado** |

- **Mientras cualquiera de los dos esté vacío, no se paga nada por puntos** y la liquidación no
  muestra la línea. Así se puede desplegar hoy sin inventar números (no-negociable 5): los define el
  dueño cuando tenga el promedio.
- Con ambos definidos, cada liquidación suma una línea de ingreso **«Bono por puntos»**:
  `max(0, puntos_del_período − meta_del_período) × soles_por_punto`, redondeado a 2 decimales.
- **Puntos del período:** el `puntosTotal` de `evaluacion_componentes_datos` para el mismo empleado y
  el mismo rango de la liquidación (se reutiliza la función; no se recalcula de otra forma).
- **Meta del período:** si el tramo es mensual, la meta tal cual. Si el tramo no es de un mes
  (semanal u otro), la meta se **prorratea por días**: `meta × días_del_tramo / días_del_mes_en_que_empieza`.
  Este prorrateo es un **default** (comentado como tal y anotado en `docs/pendientes-negocio.md`):
  el dueño puede preferir otra regla para los semanales.
- La línea muestra el detalle legible: «6.200 puntos − meta 5.000 = 1.200 × S/0,05».
- **Valores pactados (coherente con la decisión de #20):** al crear un contrato se copian los valores
  vigentes de estos dos parámetros dentro del contrato; un cambio posterior en `/configuracion`
  aplica sólo a contratos nuevos. Si #20 aún no está implementado cuando se haga esto, se leen como
  los demás parámetros y se deja anotado que #20 los congelará igual que al resto.
- **Hora Perú:** los puntos del rango se cuentan por día de Perú (depende del PR #45, migración 0110).
- **Cierre seguro:** los puntos del período viajan dentro de la entrada guardada de la liquidación,
  así la comparación «datos actuales» del cierre (PR #44, 0111) también detecta si cambiaron.

## 4. Extras: sin soles en pantalla

Como los extras no se pagan, `/evaluaciones` deja de mostrar «S/» por extras (para no confundir) y
muestra sólo sus **puntos**. La columna `monto_total` queda en la base sin uso (no se borra datos).

## 5. Interfaz (principio de producto: sencillo, intuitivo, atractivo)

- `/configuracion` › Sueldos: tarjeta **«Pago por puntos»** con los dos campos, un texto claro
  («Déjalos vacíos hasta decidir la meta. Mientras estén vacíos no se paga por puntos») y una ayuda
  con el **promedio de puntos por persona de los últimos 30 días** (lectura con la sesión del admin;
  sirve para decidir la meta).
- En la liquidación y el comprobante: la línea «Bono por puntos» con su detalle; si está desactivado,
  no aparece.
- En la ficha del colaborador / Mi desempeño: «Este mes llevas X puntos. Desde Y puntos cobras extra»
  sólo si el pago por puntos está activo.

## 6. Tests (antes del código)

1. Parámetros vacíos → ninguna línea, liquidación idéntica a la de hoy (regresión).
2. Meta 5.000, S/0,05, 6.200 puntos en tramo mensual → S/60,00.
3. Puntos por debajo de la meta → S/0 y la línea no se muestra.
4. Tramo semanal → meta prorrateada por días (fija el default).
5. Incidencias que bajan los puntos por debajo de la meta → S/0, nunca negativo.
6. Cambiar los parámetros después de calcular → el cierre pide recalcular (con #44).

## 7. Fuera de alcance

Definir la meta y el valor (los decide el dueño después de un mes de uso); recalcular meses ya
pagados; ventas en puntos (`pts_por_sol_vendido` sigue en 0).
