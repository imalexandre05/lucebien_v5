# SPEC — La nota mensual deja de tener dos formas de estar mal sin avisar

> **Qué es.** Dos cambios en `calcularNotaMensual()`, la función que convierte los siete componentes
> del mes en la nota sobre 20 de una persona. Hoy tiene dos maneras de devolver un número creíble y
> equivocado, y ninguna de las dos deja rastro.
>
> **Zona de rigor:** spec completa. Es la cadena del sueldo (no-negociable 1): esa nota es lo que el
> administrador mira para decidir un pago. Exige prueba en `packages/core` antes de mergear.
>
> **De dónde sale.** Del lote L12 de la auditoría del 23-ago. Su agente arregló el síntoma —el
> lector de pesos convertía una cadena vacía en 0— y **se negó, con razón, a tocar la causa** porque
> vive en `packages/core` y no era su lote. Lo dejó anotado. Esto es esa causa.

---

## 1. Las dos formas de estar mal

```ts
export function calcularNotaMensual(c: ComponentesEval, p: PesosEval): number {
  let nota = 0;
  for (const { key } of COMPONENTES) nota += (c[key] || 0) * (p[key] || 0);
  nota = nota - (c.descuentoIncidencias || 0) + (c.bonusVentas || 0);
  return Math.round(nota * 100) / 100;
}
```

### A — `|| 0` convierte un dato roto en un cero merecido

`NaN || 0` es `0`. `undefined || 0` es `0`. Si un componente llega roto —una división por cero
aguas arriba, una columna que volvió null, un `Number('')`— la función no falla: devuelve una nota
más baja, redondeada a dos decimales, con toda la pinta de ser cierta.

Y un cero calculado **no se distingue de un cero merecido**. Quien mire la pantalla va a leer que
esa persona no hizo nada ese mes.

Es exactamente el mismo problema que la migración 0085 resolvió del otro lado de la cadena: ahí un
día a medio declarar se pagaba a medias en silencio, y se cambió por cortar y nombrar la fecha.
Este es el mismo error de diseño en otra función.

### B — Nadie comprueba que los pesos sumen 1

Los siete pesos son editables desde `/configuración` — así tiene que ser, es la filosofía del
proyecto. Pero si alguien deja competencias en 0,20 en vez de 0,25, la nota deja de estar sobre 20
y pasa a estar sobre 19: **todo el equipo baja**, nadie cambió de desempeño, y ninguna pantalla lo
dice. Un `tramoEval()` que decía «Excelente» empieza a decir «Buen desempeño» por un decimal que
alguien tocó hace tres semanas.

Hoy suman exactamente 1,00 (verificado en `config`). El problema es que nada lo sostiene.

## 2. Lo que se hace

### C-1 — Un componente que no es un número corta

`calcularNotaMensual` deja de tragarse lo que no es finito. Si un componente o un peso llega
`NaN`, `Infinity`, `null` o `undefined`, lanza un error que **nombra cuál**:

```
El componente "valores" no es un número (NaN). La nota no se puede calcular con un dato roto.
```

**Por qué lanzar y no devolver cero.** Porque cero es una respuesta, y una respuesta equivocada
sobre el desempeño de una persona vale más que una pantalla en error. El resto de la cadena ya se
comporta así: `sueldo_entrada` corta con `DATO:` y nombra las fechas en vez de liquidar de menos.

**Lo que NO cambia:** un componente que vale `0` de verdad sigue valiendo 0 y no lanza nada. La
diferencia entre «no hizo nada» y «no sabemos» es justo lo que esta spec viene a restaurar.

### C-2 — La desviación de los pesos se puede ver, pero el sistema no decide qué hacer

Se agrega a `packages/core` una función nueva, **sin cambiar `calcularNotaMensual`**:

```ts
export function revisarPesos(p: PesosEval): { suma: number; desviado: boolean }
```

`desviado` es verdadero cuando la suma se aleja de 1 más de un centésimo (`Math.abs(suma - 1) >
0.01`). Esa tolerancia existe porque los siete pesos son decimales y `0.25 + 0.25 + 0.1 + 0.1 + 0.1
+ 0.15 + 0.05` no da exactamente 1 en coma flotante.

La pantalla de evaluaciones usa eso para mostrar un aviso junto a la nota: *«Los pesos configurados
suman 0,95: esta nota no está sobre 20 sino sobre 19»*.

**Por qué avisar y no corregir.** Que los siete pesos deban sumar 1 es la **decisión 14, todavía
abierta** (`docs/pendientes-negocio.md`). Forzarlo sería inventar una regla de negocio, y
normalizarlos por dentro sería inventarla en silencio, que es peor. Lo que sí se puede hacer sin
decidir nada es sacarlo de la oscuridad: el administrador ve el número y decide él.

Cuando Alexander responda esa decisión, `revisarPesos` es donde vive el cambio.

## 3. Lo que esta spec NO hace

- **No** cambia ningún peso por defecto: siguen siendo los siete de `PESOS_DEFAULT`.
- **No** normaliza, redondea ni ajusta la nota.
- **No** toca `notaTardanza`, `tramoEval` ni el cálculo del ciclo (`calcularCiclo`, que tiene su
  propio pendiente con los días 29, 30 y 31 — decisión 5).
- **No** construye infraestructura de tests para `apps/erp-web/lib`. Ese hueco es real —hoy los 393
  tests están todos en `packages/core` y la capa de repos no tiene corredor— pero se anota, no se
  resuelve acá: el arreglo que importa vive en `core`, que sí lo tiene.

## 4. Cómo se comprueba

En `packages/core/src/evaluaciones.test.ts`, que ya existe:

| Caso | Esperado |
|---|---|
| Componentes válidos, pesos por defecto | La misma nota que hoy — los casos que ya están no cambian |
| Un componente en `NaN` | Lanza, y el mensaje nombra el componente |
| Un componente en `undefined` | Lanza, y el mensaje lo nombra |
| Un peso en `NaN` | Lanza |
| Un componente en `0` legítimo | **No** lanza; la nota lo cuenta como cero |
| `revisarPesos(PESOS_DEFAULT)` | `desviado: false` |
| Pesos que suman 0,95 | `desviado: true`, `suma: 0.95` |
| Pesos con ruido de coma flotante en el último decimal | `desviado: false` |

## 5. Lo que queda anotado

- **La capa de repos no tiene cómo probarse.** `apps/erp-web/lib` no tiene vitest ni configuración,
  así que ninguna de sus funciones —incluido el arreglo de `leerPesosEval` que hizo L12— tiene una
  prueba que la sostenga. Es la deuda que hizo que ese lote quedara «parcial».
- **Dos fuentes del mismo default.** `apps/erp-web/lib/evaluaciones-repo.ts` repite a mano los siete
  números que `packages/core` ya exporta como `PESOS_DEFAULT`. Pueden separarse con el tiempo.
- **`/configuración` deja guardar un peso vacío.** El arreglo de L12 es defensivo, en el lector.
  Que la pantalla lo acepte en primer lugar es de otro lote.

---

## 6. Decisión de Alexander — 24-ago-2026

**Pregunta:** ¿qué hace el sistema cuando los siete pesos no suman 100 %?

**Respuesta: A ahora, B más adelante.**

- **Ahora (esta spec, C-2):** la pantalla **avisa** y deja pasar. *«Los pesos suman 95 %: esta nota
  no está sobre 20 sino sobre 19.»* El administrador ve el número y decide.
- **Más adelante:** Configuración **dejará de aceptar** pesos que no sumen 100 %. Eso entra cuando
  se rehaga esa pantalla para editar los siete juntos con el total a la vista mientras se escribe —
  no antes: bloquear el guardado sobre la pantalla actual, donde los pesos se editan de a uno,
  obliga a dejar el formulario en un estado inválido para llegar al válido, y produce una pantalla
  que pelea con quien la usa.

**Lo que se descartó, y por qué.** Que el sistema reescale los pesos solo para que siempre sumen
100 %. Nunca fallaría, pero el administrador escribiría 20 % y el motor usaría 21 %: la pantalla
mostrando un número y el motor usando otro es exactamente lo que esta auditoría vino a eliminar de
un sistema que termina en un pago.

Con esto, la **decisión 14** queda contestada. Lo que sigue abierto no es una pregunta sino una
tarea: construir el bloqueo junto con el rediseño de la pantalla de pesos.
