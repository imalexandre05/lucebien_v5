# Lo que falta del frontend para mandar a producción

> **Escrito el 21-ago-2026**, al cerrar la sesión que rehizo el sistema de diseño del ERP.
> **Para retomar:** leé este documento y [sistema-de-diseno.md](sistema-de-diseno.md). Los dos
> juntos son el estado completo.

---

## 1. Dónde quedó todo

Treinta y dos commits en `feat/sueldos-motor`, **sin pushear**. Lo hecho, en una línea cada cosa:

- **Tokens de marca** en vez de la paleta de Tailwind, con una regla del guard que lo hace cumplir.
- **Módulo de colaboradores** (`/colaboradores`): una entrada de menú en lugar de ocho.
- **Movimiento** dentro de presupuesto, hover táctil gateado, `prefers-reduced-motion` que quita el
  desplazamiento y conserva el color.
- **Estados**: diez `loading.tsx` nuevos, estados vacíos que dicen de dónde sale lo que falta,
  errores anunciados, controles deshabilitados que dicen por qué.
- **Se fueron** seis `window.alert()` y ocho `window.confirm()`.
- **Lo comercial salió del menú**, salvo `/inventario`, que se queda hasta que el otro sistema esté
  conectado.

Verificado en cada tanda: typecheck, `next build`, guard, 388 tests del core, y las 105 utilidades
de token presentes en el CSS compilado.

**No verificado, y es la limitación que más pesa: nadie miró una pantalla renderizada.** Todo lo de
abajo sale de leer código, no de usar el sistema.

---

## 2. Los dos bugs del `Modal`, que hay que confirmar en pantalla

Se arreglaron el 21-ago sin poder probarlos. **Lo primero de la próxima sesión es confirmar que de
verdad se fueron**, porque explican buena parte de lo que Alexander reportó como «secciones y
modales que no funcionan».

**El foco.** El efecto del modal tenía `onClose` en sus dependencias, y las 27 pantallas que lo
abren pasan una arrow inline. El efecto se re-ejecutaba en cada render y termina en
`panelRef.focus()`: escribías una letra y el modal le sacaba el foco al campo.

**El alto.** El panel no tenía alto máximo ni scroll: un modal largo dejaba el pie con los botones
fuera de la ventana.

Cómo confirmarlo: abrir un modal con campos de texto —evaluar en `/colaboradores/[id]/evaluacion`,
una solicitud nueva, un movimiento de sueldo— escribir una frase entera de corrido, y achicar la
ventana hasta que el modal no entre.

---

## 3. El programa que falta

### 3.1 Responsive de verdad

El andamiaje está: `toque` para el área tocable, `hover-fine` para el hover que sólo vale con
mouse, `Table` con su propio scroll, el drawer móvil. **Falta la pasada pantalla por pantalla a
360 px**, que es el ancho real de los teléfonos del equipo.

Lo que hay que buscar en cada una: que nada empuje la página de costado, que ningún control quede
por debajo de 44 px de alto tocable, que los modales entren, y que las tablas anchas se lean.

### 3.2 Menos escribir, más presionar

Es lo que más va a mover la adopción: la gente llena esto de pie, con el teléfono, muchas veces con
las manos ocupadas.

La pieza ya existe —`OpcionBotones`— y el criterio ya está escrito en su propio comentario:
**botones antes que un `<select>` para cualquier grupo de cinco opciones o menos**. Falta aplicarlo.

Dónde mirar primero: todo campo de texto cuyo valor sale de un conjunto conocido. Tipos, colores,
tallas, motivos, niveles, condiciones. Cada uno de ésos es un teclado que no hace falta abrir.

### 3.3 Que los flujos cierren

**Esto no se puede hacer leyendo código.** Hay que recorrer cada flujo de punta a punta y encontrar
los callejones sin salida. Alexander reportó que los hay, pero sin ejemplos concretos.

La forma de arrancar: que él nombre dos o tres pantallas donde se traba, y buscar el patrón — como
pasó con el bug del foco, donde un solo defecto compartido explicaba síntomas en veinte lugares.

---

## 4. Lo que quedó sin resolver, y no es frontend

- **Las cuatro migraciones**, listas para pegar en `tools/migraciones-pendientes/` con su `LEEME.md`.
  Ninguna aplicada al 21-ago. La `0079` corrige un defecto del huellero que hoy corta la ingesta del
  colector; la `0076` es la única que mueve plata y no debería aplicarse sin ver el número antes.
- **Trece archivos** escriben el estilo de campo en línea. Están en el baseline del guard: la deuda
  está contada y no puede crecer. No se barrieron porque el cambio puede mover relleno y ancho, y
  eso hay que mirarlo en pantalla.
- **El estado de error de los campos** (`aria-invalid`) no tiene consumidores: los formularios
  llevan un error de nivel formulario, no uno por campo.
- **Valores 360°**: revisar a fin de mes cuántas evaluaciones llegaron contra el mes anterior, ahora
  que exige las seis respuestas.

---

## 5. Dos cosas que se colaron y conviene saber

En el commit `47da235`, un `git add -A` arrastró dos cambios que no eran de esa tanda:

1. **`docs/mapa-verificado.md`** — una corrección sobre el dominio del otro sistema, escrita por otra
   sesión. El contenido está bien; lo que está mal es que viaje dentro de un commit de diseño.
2. **`tools/colector-huellero.rar`** — 1,9 MB de binario que estaba sin trackear a propósito. Se
   quitó del índice en `d1e0b7f` y `*.rar` fue al `.gitignore`, pero **el blob sigue en el
   historial**.

Como todavía no se pusheó nada, las dos se pueden limpiar reescribiendo los commits. Después de
pushear, ya no sale gratis.
