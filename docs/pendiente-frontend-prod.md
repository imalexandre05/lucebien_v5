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

**Confirmados en pantalla por Alexander el 21-ago-2026: los dos se fueron.** La frase entra
completa sin perder el foco, el modal deja de crecer, cabecera y pie quedan fijos, y en modo
teléfono los botones se ven sin scrollear la página. Ya no hay que volver sobre esto.

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

### 3.3 Un modal es para una decisión; una página es para trabajar

**Probado con Alexander el 21-ago-2026.** Los dos bugs del `Modal` quedaron cerrados, y al
verificarlos apareció algo más grande: *«para algo tan importante como contrato no debería haber
modal, sino funcionar dentro de la misma página; sólo los parámetros que se abran en un modal»*.

Tiene razón, y la regla que sale de ahí vale para todo el sistema:

- **Modal** = una decisión corta. Confirmar algo, elegir de una lista, ajustar un número. Entrás,
  resolvés, salís.
- **Página** = trabajo. Muchos campos, consecuencias que hay que revisar antes de guardar, algo que
  querés poder mirar dos veces. Un modal acá te deja el contexto tapado justo cuando lo necesitás.

Que el modal ahora scrollee resolvió el síntoma —los botones se alcanzan— pero no la causa: **un
formulario que necesita scroll interno es un formulario que quería ser una página.**

Los tres casos, en orden de cuánto molestan:

| Dónde | Qué es hoy | Qué debería ser |
|---|---|---|
| Contrato de sueldo (`sueldos/acuerdos`) | Modal con fechas, modalidad, sueldo, horario por día y parámetros | Página, dentro del contenedor de contratos. **Sólo los parámetros** quedan en modal |
| Nueva solicitud (`solicitudes/nueva-solicitud`) | Modal con prendas, artículos y motivos | A revisar con el mismo criterio |
| Evaluar (`evaluaciones`) | Modal con ocho competencias, valores, checklists y el panel de pago | A revisar: es el formulario más largo del sistema |

Empezar por el contrato, que es el que Alexander señaló y el que más consecuencias tiene: lo que se
pacta ahí es lo que después se paga.

### 3.4 Botones que prometen más de lo que hacen

Alexander, probando: *«no sé para qué sirve lo de nuevo parámetro»*. Es una señal, no una duda.

«Nuevo parámetro» en `/configuracion` crea una fila en `config` con la clave que escribas. El
problema es que **nada del sistema la va a leer**: cada parámetro se lee por su nombre desde el
código, así que uno inventado a mano queda ahí sin efecto hasta que alguien escriba el código que
lo consulte.

O sea que el botón, tal como está, sirve para dejarse una nota. Tres salidas posibles, y hay que
elegir una:

1. **Explicarlo en el propio modal** — «esto crea el parámetro; para que haga algo, un programador
   tiene que leerlo desde el código».
2. **Cerrarlo a admin** y moverlo abajo de todo, como herramienta avanzada.
3. **Sacarlo**, si en la práctica nadie lo va a usar.

Y la pregunta general que abre, que vale para toda la pasada de flujos: **¿hay otros botones que
prometen más de lo que hacen?** Un control que existe y no cambia nada enseña que el sistema es
impredecible, y eso cuesta más caro que la función que falta.

### 3.5 Que los flujos cierren

**Esto no se puede hacer leyendo código.** Hay que recorrer cada flujo de punta a punta y encontrar
los callejones sin salida. Alexander reportó que los hay, pero sin ejemplos concretos.

La forma de arrancar: que él nombre dos o tres pantallas donde se traba, y buscar el patrón — como
pasó con el bug del foco, donde un solo defecto compartido explicaba síntomas en veinte lugares.

---

## 4. Lo que quedó sin resolver, y no es frontend

- **Las migraciones**, en `tools/migraciones-pendientes/` con su `LEEME.md`. Estado al 21-ago-2026,
  verificado contra la base:

  | Migración | Estado |
  |---|---|
  | `0079` · huellero | **Aplicada.** Probada antes contra las 3.107 marcas reales: nueve casos en verde |
  | `0077` · hora fuera de contrato | **Aplicada.** No movió ningún monto, que era el punto de su default en 1 |
  | `0078` · las pausas no se pagan | Probada (seis casos en verde). Falta el Run que la aplica |
  | `0076` · meta semanal | **Sin aplicar, a propósito.** Es la única que mueve plata: hasta S/76,40 por persona por mes. Antes hay que comparar un borrador de liquidación con y sin ella |
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

---

## 6. Lo hecho el 21-ago-2026, después de probar en pantalla

### Contrato de sueldo: del modal a la página (§3.3, cerrado)

El editor de contrato vive ahora dentro del contenedor de contratos y reemplaza a la lista mientras
se trabaja. **Sólo los parámetros quedan en modal**, con la cuenta de los que están pisados y sus
valores como chips, para no tener que abrirlo para saber si hay algo distinto.

Consecuencia conocida: el editor no es una ruta, así que el botón «atrás» del navegador sale de
Contratos en vez de volver a la lista. Si molesta, se convierte en `?editar=<id>`.

### Envío a Lavandería, rehecho con la estructura del sistema viejo

Alexander probó la primera versión y la rechazó: *«el sistema anterior era así y lo entendían un
poco mejor»*. La lección vale para todo lo que falta: **la disposición que el equipo ya usa no es
deuda, es conocimiento** — lo que se cambia es la piel, no el orden en que se piensa el trabajo.

La pantalla quedó: tipo de envío → Registrar prenda → Accesorios (conteo) → Responsables → barra de
envío pegada abajo. Lo demás está en `docs/pendientes-negocio.md` §21-ago.

### Sin tipografía monoespaciada (decisión de Alexander)

Los códigos y los números iban en `font-mono`. **La familia ni siquiera estaba cargada**: no hay
`next/font` ni un `<link>` en `app/layout.tsx`, así que el navegador caía en la monoespaciada del
sistema y el ERP se veía como una terminal. Se sacaron las 338 apariciones en 75 archivos, se
cambiaron por `tabular-nums` —que es lo único que hacía falta: que los números no bailen—, se quitó
la familia de `tailwind.config.ts` y **el guard tiene una regla nueva** (`mono`) probada en las dos
direcciones.

### Avatares con identidad

Todos eran el mismo disco dorado, así que una lista de dieciocho personas se veía como dieciocho
discos iguales. Ahora el tono sale del nombre —seis, de los categóricos— y la misma persona sale
del mismo color en toda la aplicación. Toca `Avatar`, `PersonaPicker`, la topbar, empleados y
valores.

---

## 7. Lo que sigue abierto

| Qué | Estado |
|---|---|
| **Pantalla de carga al cambiar de sección** | Pendiente pedido el 21-ago. Hay `loading.tsx` por ruta, pero en una navegación del cliente no se ve nada mientras el servidor responde: hace falta un indicador global de navegación |
| **Tipo de envío (general / refacción)** | Ver `docs/pendientes-negocio.md`: hoy dice dos veces lo mismo que el destino por prenda |
| **El 26 quedó en tallas de adulto** | Si es talla de niño, se mueve en `catalogos.ts` |
| **Responsive a 360 px** | Sigue pendiente pantalla por pantalla (§3.1) |
| **Flujos que se traban** | Alexander los está recorriendo; sin ejemplos concretos todavía (§3.5) |
| **«Nuevo parámetro» en Configuración** | Sin decidir (§3.4) |
| **Los dos archivos colados en `47da235`** | Sin decidir (§5) |
