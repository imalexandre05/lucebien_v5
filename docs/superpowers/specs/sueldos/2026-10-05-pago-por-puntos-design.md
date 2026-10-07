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

## 8. Enmienda del 06-oct-2026 (auditoría de dinero D-3, D-8, D-9)

> Origen: `docs/auditorias/2026-10-06-sueldos.md` (rama `audit/2026-10-06-sueldos`). **Pendiente de
> confirmación de Alexander** antes de encender el pago por puntos: 8.2 cambia la regla de §3 para
> los pagos que no son mensuales.

### 8.1 Valores pactados por contrato (D-3; reemplaza el párrafo «Valores pactados» de §3)

- `puntosMetaMensual` y `solesPorPunto` se **congelan en cada contrato** como los otros 15 valores
  pactados (#55, 0118): al crear un contrato se copian los vigentes de `/configuracion`; cambiar
  `/configuracion` después **no** mueve contratos ya creados.
- Los contratos que ya existen se congelan con lo que diga `/configuracion` al aplicar la migración.
  Hoy eso es **vacío**: siguen sin cobrar por puntos.
- **Apagado por defecto**: vacío (`null`) en el contrato significa «este contrato no cobra por
  puntos», aunque `/configuracion` se encienda después. Para que un contrato existente cobre por
  puntos, el administrador lo enciende en los valores pactados de ese contrato.
- La liquidación usa los valores **del contrato**: el pago por puntos se activa con los dos valores
  del contrato definidos, no con los de `/configuracion`.

### 8.2 La meta se mide por mes del contrato (D-8, D-9; reemplaza «Puntos del período» y «Meta del período» de §3)

- La meta es **mensual** y se mide sobre **meses del contrato**: del día de inicio al día anterior
  del mismo día del mes siguiente (recortado a fin de mes). Es el mismo criterio de la frecuencia
  mensual, contada desde el día en que empezó el contrato (decisión del dueño del 06-oct).
- Cada mes del contrato se cobra **una sola vez**, en la liquidación cuyo rango incluye el **último
  día** de ese mes, con **todos los puntos del mes**: `max(0, puntos_del_mes − meta) × soles_por_punto`.
- Con pagos semanales o quincenales, los pagos que no cierran un mes no llevan bono por puntos. El
  que lo cierra lo lleva completo.
- Ejemplo de la auditoría (E7): semanas con 0, 0, 2500 y 2500 puntos, meta 5000. El mes suma 5000
  contra 5000 y paga **S/0**, no S/125. Así se cumple «cuando se llegue a cierta cantidad de
  puntos… recién cobrarán».
- Un tramo mensual que coincide con el mes del contrato usa la meta **entera** (D-8). Ejemplo:
  30-ene a 28-feb con 5000 puntos y meta 5000 paga S/0, no S/8,06.
- El último mes, cortado por el fin del contrato, prorratea la meta por días contra el mes completo.
  Es un default anotado en `docs/pendientes-negocio.md`.
- Redondeo (D-12, decisión de la sesión maestra del 06-oct tras el verificador): el excedente se
  redondea a 2 decimales **antes** de multiplicar, `round2(round2(max(0, puntos − meta)) × soles)`,
  para que el monto sea exactamente el producto que la persona lee en su comprobante («870,97 × S/3 =
  S/2612,91»). Se mantiene a70df2d y §3 se lee así.
- Los puntos de cada mes viajan en la entrada guardada (`puntosMeses`), así el cierre de #44 detecta
  si cambiaron.

### 8.3 Tests (antes del código)

7. Contrato con valores congelados: cambiar `/configuracion` no mueve `puntosMetaMensual` ni
   `solesPorPunto` del contrato (prueba SQL E3).
8. Semanas 0, 0, 2500 y 2500 con meta 5000 → S/0 en todo el mes.
9. Tramo mensual del 30-ene al 28-feb con 5000 puntos y meta 5000 → S/0.
10. Redondeo del excedente antes de multiplicar: 2000 puntos, meta 1129,03, S/3 → 870,97 × 3 = S/2612,91.
