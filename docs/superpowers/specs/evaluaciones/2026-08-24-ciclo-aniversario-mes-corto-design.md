# SPEC — El ciclo por aniversario se recorta en un mes corto, no se corre al siguiente

> **Qué es.** Un cambio en `calcularCiclo()` (`packages/core/src/evaluaciones.ts`), la función que
> sugiere el período de evaluación de una persona a partir de su fecha de ingreso. Hoy, cuando el
> día de ingreso no existe en el mes siguiente (29, 30 o 31 contra un febrero o un mes de 30 días),
> el cálculo se corre silenciosamente al mes que sigue, en vez de recortarse al último día real.
>
> **De dónde sale.** Alexander corrigió, con tres ejemplos concretos y una aclaración después
> (24-ago-2026), la regla exacta con la que ya trabajaba en su Excel antes de este sistema —
> confirmó además que **la misma regla aplica a las evaluaciones**, que es donde esta función ya se
> usa.
>
> **Zona de rigor:** spec completa. Es fecha que alimenta la evaluación mensual (no-negociable 1),
> aunque el cambio es acotado: vive entero en `packages/core`, sin migración — `calcularCiclo` no
> toca la base, sólo se llama desde el cliente para sugerir un rango de fechas.

---

## 1. La regla, con los ejemplos exactos que dio Alexander

> «si entra el 5 un colaborador se le paga el 4 del próximo mes» — el caso normal, día D → D-1 del
> mes siguiente.
>
> «si entra el 29, 30 o 31 de enero, se le paga el 28 de febrero» — los tres, sin excepción, al
> mismo día: el último real de febrero.
>
> «si entra el 31 de octubre se le paga el 30 [de noviembre]» — el mes siguiente tiene 30 días, se
> recorta a 30, no rueda a diciembre.
>
> «en todos los demás días entre 1 y 28 funciona como el primer caso, se paga un día antes del
> próximo»

## 2. Lo que pasa hoy, verificado con la aritmética real de `Date.UTC`

```
entra 15-jun → hasta 14-jul   ✓ correcto
entra 29-ene → hasta 28-feb   ✓ correcto (por casualidad: el desborde de un solo día se
                                 autocorrige al restar el día)
entra 30-ene → hasta 01-mar   ✗ INCORRECTO — Alexander pide 28-feb
entra 31-ene → hasta 02-mar   ✗ INCORRECTO — Alexander pide 28-feb
entra 31-mar → hasta 30-abr   ✓ correcto (mismo desborde de un solo día, mismo acierto casual)
```

El código actual (`packages/core/src/evaluaciones.ts:151-176`) arma la fecha con
`Date.UTC(y, m, dInicio)` sin comprobar que `dInicio` exista en ese mes. Cuando no existe,
`Date.UTC` no avisa: normaliza corriéndose al mes siguiente. El truco de «calcular el próximo
aniversario y restarle un día» sólo da la respuesta correcta cuando el desborde es de **exactamente
un día** (día 29 contra un febrero de 28, o día 31 contra un mes de 30) — con dos días de desborde
(día 30 o 31 contra febrero) el resultado ya es otro mes.

**Verificado: no afecta a nadie hoy.** Ningún empleado real tiene `fecha_ingreso` en día 29, 30 o
31 (los cuatro que hay son 23, 22, 1 y 1). El defecto es real pero está dormido.

## 3. El diseño

Se reemplaza el desborde silencioso por un recorte explícito, con una sola fórmula que cubre los
cuatro ejemplos de Alexander sin ramas especiales:

```
últimoDíaDelMes(y, m0)         // el día 0 del mes siguiente es el último día real de m0
diaEfectivo(y, m0, díaDeseado) = min(díaDeseado, últimoDíaDelMes(y, m0))
```

- **`desde`** del ciclo: `diaEfectivo` del día de ingreso, en el mes donde arranca el ciclo. Si el
  mes no llega a ese día, el ciclo arranca el último día real de ese mes.
- **`hasta`** del ciclo: `min(díaDeseado − 1, últimoDíaDelMes(mes siguiente))`. Es la misma idea que
  «el día antes del próximo aniversario», pero cuando el mes siguiente no llega a `díaDeseado − 1`,
  el ciclo termina en su último día real en vez de invadir el mes de después.

Verificación de la fórmula contra los cuatro ejemplos (ya confirmada con Node antes de escribir
esto):

| Ingresa | Mes siguiente | `díaDeseado − 1` | Último día real | `hasta` (el menor de los dos) |
|---|---|---|---|---|
| 15 | julio (31 días) | 14 | 31 | **14** |
| 29 | febrero (28 días) | 28 | 28 | **28** |
| 30 | febrero (28 días) | 29 | 28 | **28** |
| 31 | febrero (28 días) | 30 | 28 | **28** |
| 31 | noviembre (30 días) | 30 | 30 | **30** |

Los cinco coinciden exactamente con lo que Alexander describió.

## 4. Lo que esta spec NO hace

- **No** rediseña cómo se encadenan varios ciclos seguidos a lo largo de los años para una persona
  cuyo aniversario cae varias veces en un mes corto. Los ejemplos de Alexander describen el primer
  cruce (de ingreso al primer pago); el comportamiento de la función ya recalcula el ciclo desde
  cero cada vez que se le pide "el ciclo que contiene esta fecha" —no encadena ciclos guardados—
  así que no hereda arrastre de un ciclo a otro. Cómo se ve un segundo o tercer cruce de un mes
  corto seguido queda sin verificar contra un ejemplo real, y no hay nadie hoy a quien le importe
  todavía. Se anota, no se resuelve acá.
- **No** toca `sueldo_entrada`, los acuerdos de sueldo ni cómo se liquida un período: `calcularCiclo`
  sólo se usa para **evaluaciones**. Alexander aclaró además que, en la práctica, el administrador
  casi siempre **elige el período a mano** (como ya hacía en su Excel, con un calendario de fecha a
  fecha) y este cálculo es sólo la sugerencia con la que arranca el selector — eso es justamente lo
  que ya hace `barra-periodo.tsx`/`cliente.tsx` (el aniversario pre-llena el campo, el administrador
  lo puede cambiar).

## 5. Cómo se comprueba

En `packages/core/src/evaluaciones.test.ts`, que ya tiene una sección de `calcularCiclo` — se
amplía, no se reemplaza:

| Caso | `hasta` esperado |
|---|---|
| Ingresa el 15, ciclo dentro de un mes de 31 días | día 14 del mes siguiente (ya cubierto, no debe romperse) |
| Ingresa el 29 de enero | 28 de febrero |
| Ingresa el 30 de enero | 28 de febrero |
| Ingresa el 31 de enero | 28 de febrero |
| Ingresa el 29 de enero, año bisiesto | 29 de febrero (el mes sí tiene ese día) |
| Ingresa el 31 de un mes de 31 días, mes siguiente tiene 30 | día 30 del mes siguiente |
| Ingresa el 31 de diciembre | 30 de enero (cruce de año, `y` avanza) |
| Todos los casos que ya pasaban antes de este cambio | siguen exactamente igual |
