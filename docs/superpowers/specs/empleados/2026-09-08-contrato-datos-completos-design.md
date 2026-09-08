# SPEC — C-2: el contrato muestra todos los datos de la persona

> **Zona de rigor:** nivel 3 por ser migración de base (`docs/rigor-por-zona.md`), de alcance
> acotado: una columna nueva + una RPC nueva, sin tocar cálculo de sueldo.
>
> Implementa **C-2** de [la hoja de ruta del 25-ago](../2026-08-25-reunion-admin-hoja-de-ruta.md):
> *«en el contrato que aparezcan todos los datos (como cel, DNI, recomendaciones)»*.

## 1. Lo que ya existe y lo que falta (verificado contra el código, no contra el plan viejo)

`empleados.dni` y `empleados.telefono` existen desde la `0001_init.sql` y ya se editan en la
pestaña «Datos» del expediente (`app/personal/[id]/datos/cliente.tsx`) — el problema de C-2 es que
**no llegan** a la pantalla del contrato: `colaboradores-repo.ts` (que alimenta
`app/personal/[id]/contrato/page.tsx`) no los selecciona. Es un problema de traer y mostrar, no de
capturar.

**«Recomendaciones» no existe en ningún lado** — ni columna ni tabla, verificado con `grep` sobre
las 103 migraciones. El administrador la nombra junto a cel/DNI, como un dato simple más de la
persona, no como una lista estructurada de referencias con nombre/teléfono/relación — se implementa
como texto libre (`empleados.recomendaciones text`), la lectura literal más chica de lo pedido
(no-negociable 5: no inventar una estructura que nadie pidió).

## 2. Hay un plan viejo con la misma numeración C-1..C-4 que NO es esto

`docs/superpowers/plans/2026-08-23-contrato-individual.md` usa C-1..C-4 para «persona fija»,
«horario visual», «resumen mensual» y «cierre» — **ya implementado**, verificado en el código
(`TURNOS_RAPIDOS`, `pctBarra`, `analizar()` en `app/sueldos/acuerdos/cliente.tsx`). Es un trabajo
distinto, ya cerrado. Esta spec es sobre el C-2/C-3 de la reunión del 25-ago, sin relación.

## 3. Decisión: una RPC nueva, no extender `empleado_actualizar`

`empleado_actualizar` (migración `0050`) ya tiene 12 parámetros posicionales por nombre (vía
PostgREST). Agregarle un 13º con `create or replace` mantiene el nombre pero cambia la firma
completa (tipos de los parámetros): Postgres no lo trata como un reemplazo, crea una **función
sobrecargada** nueva al lado de la vieja, y con PostgREST resolviendo por los nombres del JSON eso
es exactamente el tipo de ambigüedad que este repo ya aprendió a evitar (`docs/aprendizajes.md`).

Se agrega en cambio `empleado_actualizar_recomendaciones(p_id uuid, p_texto text)`, chica y con el
mismo guard de admin que la RPC grande. `actualizarEmpleado()` (`empleados-repo.ts`) llama a las dos
RPC en secuencia desde el mismo botón «Guardar» — dos llamadas, un solo click, sin tocar la firma de
la RPC que ya usa toda la ficha de personal.

## 4. Qué muestra el contrato, y qué no

El contrato (`app/sueldos/acuerdos/cliente.tsx`, vista `enEditor`) suma tres líneas con DNI,
teléfono y recomendaciones de `personaFija` — vacío se muestra como «—», nunca se oculta la línea
entera (mismo criterio que el resto de la pantalla: lo que falta se ve como falta, no desaparece).

No se toca el formulario de edición de la ficha para volverlo obligatorio: si el administrador no
cargó el DNI de alguien, el contrato lo va a decir con un «—», y ESO es la señal para cargarlo — no
un valor inventado ni un bloqueo que le impida imprimir el contrato mientras tanto.

## 5. Cómo se prueba

`packages/db/pruebas/0104_empleados_recomendaciones.prueba.sql`: monta un colaborador de prueba,
comprueba que `empleado_actualizar_recomendaciones` guarda el texto, que un no-admin no puede
llamarla, y que `empleado_actualizar` (la RPC grande, sin tocar) sigue funcionando exactamente
igual que antes — no debe haber quedado ninguna sobrecarga ambigua.
