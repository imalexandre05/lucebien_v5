# SPEC — Al guardar una evaluación, la nota y los puntos los calcula el servidor

> **Qué es.** El ítem «Se guarda con puntos de otro ciclo» del ticket
> imalexandre05/lucebien-tablero#41 (los demás ítems del ticket quedan fuera).
>
> **Zona de rigor: spec completa.** Toca la cadena del sueldo (`puntos → evaluación /20 → pago`).
> **No cambia ninguna fórmula, peso ni escala.** Cambia *quién* calcula lo que se guarda.

## 1. El defecto (verificado contra el código, 4-oct-2026)

1. `apps/erp-web/app/evaluaciones/cliente.tsx` — `setCicloDesde` / `setCicloHasta` sólo actualizan
   `ciclo` y marcan `cicloEditado`. **No tocan `infoExtra` ni `comp`**: los puntos de un cálculo
   anterior siguen en pantalla y la nota se sigue mostrando.
2. `guardar()` manda al servidor `ciclo.desde/hasta` (los nuevos) junto con `nota`, `puntosTotal` y
   `componentes` del cálculo viejo.
3. `accionCrearEvaluacion` (`actions.ts`) **no recalcula nada**: pasa tal cual lo recibido a
   `crearEvaluacion`, que lo inserta en `evaluaciones_mensuales`. Un cliente alterado puede
   guardar cualquier nota y cualquier puntaje para cualquier ciclo.

Resultado: se puede guardar una nota calculada con los puntos de otro ciclo, que es la que termina
alimentando la liquidación.

## 2. Regla

**La nota y los puntos que se guardan los calcula el servidor**, en el momento de guardar, para el
empleado y el ciclo exactos que se guardan:

- puntos y componentes automáticos: la misma RPC que usa la pantalla,
  `evaluacion_componentes(p_empleado, p_desde, p_hasta)` (`componentesEvaluacion`);
- nota y banda: `notaDesdePuntos(puntosTotal, escala)` con `leerEscalaPuntos()` (misma escala que
  muestra la pantalla);
- `metodo = 'puntos'`;
- `pesos` se lee del servidor (`leerPesosEval()`).

Lo que el cliente mande como `notaFinal`, `puntosTotal`, `metodo` y `pesos` **se ignora** (se quitan
de la firma de la acción).

### Qué sí viene del cliente

Sólo lo que es juicio humano o entrada manual de la pantalla: `competencias` (nota derivada de las
rúbricas), `examenes`, `descuentoIncidencias` y `bonusVentas` (inputs editables hoy; no entran a la
nota, sólo al perfil guardado). Se validan como números finitos.

Los componentes `operaciones`, `software`, `limpieza`, `tardanza` y `valores` del perfil guardado
salen de la RPC, no del cliente. `valores` null (sin evaluaciones ese mes) se guarda como 0, igual
que hace la pantalla hoy.

### Bloqueos en el servidor (mismos que ya aplica la pantalla)

- Ciclo inválido (formato) o `desde > hasta` → error.
- RPC sin `puntosTotal` (migración 0095 no aplicada) → error, no se guarda.
- `ventasSinTasa === true` → error (spec puntos-como-moneda §4).
- `notaDesdePuntos` lanza (config rota) → error con su mensaje.
- Competencias fuera de rango o no finitas → error.

## 3. UI

Cambiar desde/hasta (o elegir otro empleado, ya lo hace) **anula el cálculo mostrado**:
`infoExtra = null` y los componentes automáticos vuelven a cero. La nota desaparece, «Guardar»
queda deshabilitado y hay que pulsar «Calcular desde la data» de nuevo. Las competencias elegidas
a mano se conservan (no dependen del ciclo).

## 4. Pruebas (antes del código)

Vitest en `packages/core` sobre una función pura nueva, `armarEvaluacionAGuardar`
(`evaluaciones.ts`): recibe la salida de la RPC, la escala y las entradas manuales, devuelve
`{ notaFinal, banda, puntosTotal, componentes }` o lanza. Casos: usa los puntos de la RPC y no los
del cliente; nota = `notaDesdePuntos`; componentes automáticos desde la RPC; `valores` null → 0;
sin `puntosTotal` lanza; `ventasSinTasa` lanza; competencia no finita lanza; escala rota lanza.
No hay cambio de SQL, así que no hay prueba SQL ni migración.

## 5. Fuera de alcance

Reabrir notas ya cerradas; proponer por defecto el último ciclo cerrado. Son decisiones aparte.

## 6. Defaults inventados

Ninguno. (La decisión de qué campos siguen siendo del cliente replica lo que la pantalla ya
permitía editar.)
