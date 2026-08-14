# Respuestas del dueño — segunda ronda (13 de agosto de 2026)

> Respuestas a `entrevista-dueno-2.md`. Están agrupadas por tema, no por número de pregunta, con
> el código original entre paréntesis para poder rastrear cada una.
>
> **Lo que dice el dueño manda sobre lo que diga cualquier otro documento.** Cuando una respuesta
> corrige algo que ya estaba escrito, se marca con ⚠️.

---

## 1. Puntos del pipeline

**Los 9 valores actuales están bien** (C1-bis a) — compostura 5, lavado especializado 5, lavado
en seco 3, planchado 3, control de calidad 2, refacción 2, lavado normal 1, empatado 0,5,
accesorio 0,5. Condición: **siempre editables**.

**Quién decide el tipo de lavado** (C1-bis b): el propio colaborador u operario. No viene decidido
de antes.

**Los pasos sin puntos sí deberían tener puntos** (C1-bis c): recepcionar, dejar en su sitio,
codificar y dejar listo para enviar. *"Está en el otro sistema"* — o sea, esos pasos pasarían a
depender del inventario del otro programador. Falta definir cuántos puntos.

**El despiece 60/40 aplica a todos los trabajos por igual** (C1-bis d), no sólo a algunos.

## 2. Urgencias en el pipeline (N12)

- **No hay niveles que alguien elija.** Una prenda es urgente cuando **le faltan menos de 3 días
  para su fecha de entrega**.
- **Nadie la marca a mano:** sale de la fecha de entrega que se anotó al mandarla al almacén.
- **Qué pasa:** aparece resaltada. Nada más — no avisa a nadie.

## 3. Tipos de prenda (N10, N11)

- Los flujos cortos que se documentaron **son correctos** (zapatos, camisas, corbatas).
- Si faltan tipos de prenda: **pendiente**, lo deja para después.
- **Los puntos deberían variar según el tipo de prenda**, pero con una condición fuerte: *"debe
  ser lo más sencillo y entendible para el operario"*. Cualquier diseño que complique la pantalla
  del operario está descartado aunque sea más justo.
- **Dar de baja una prenda** (camisa muy manchada): lo decide el encargado o el administrador. Se
  va a registrar en el sistema de inventario del otro programador, no en este.

## 4. Evaluación

**No se puede evaluar antes de que termine el ciclo** (B8): *"tiene que terminar su mes sí o sí"*.

**Valores 360°** (N6, N7):
- La ventana es **la misma para todos**, no una por persona.
- Dura **3 días**.
- Si alguien no la completa: **se le bloquea el sistema** hasta que la haga. Y si ni así la hace,
  **le baja su propia nota hasta el mes siguiente**.
- **Cada uno evalúa a todos sus compañeros**, no sólo a los de su sede o turno. Consecuencia
  directa: la lista de colaboradores tiene que estar al día o la gente evalúa a personas que ya
  no están.

## 5. Horarios (N8, N9)

- **Los arma el administrador**, él solo.
- **Hoy están en Excel.**
- Se arman **lo más pronto posible**: cuando entra alguien nuevo, cuando alguien pide cambio.
  Una semana de anticipación o menos.
- **No cambian durante la semana.** Se revisan cada mes o cada dos meses, según capacidades del
  personal o temporada.
- **El horario es por persona, no por puesto.** *"A veces contrato sólo los domingos, a veces
  sólo pueden venir ciertos días un par de horas"*. Cualquier plantilla rígida por puesto no
  sirve.

## 6. Sanciones

**Sanción al cajero por alquiler no devuelto** (N2):
- Sí se **descuenta del sueldo**.
- Es el **costo completo** del terno. *"A veces baja por usos del terno"*, pero eso se define
  junto con el otro programador cuando exista el inventario.
- **El administrador decide** si el cajero fue realmente responsable.
- **El sistema debe registrarlo.**

**Sanción por prenda perdida** (N3):
- **Mismo mecanismo** que la del cajero, siempre.
- Aplica aunque no se sepa quién fue, aunque lo ideal es que siempre se sepa.
- ⚠️ **Regla nueva: si el terno aparece, la sanción se revoca.** Una sanción tiene que poder
  deshacerse, no sólo registrarse.

**Comisión por ticket** (N1):
- Se calcula **por monto**, no por cantidad de productos.
- 2% sobre boletas de venta y alquiler por encima de un mínimo — es la misma comisión del sistema
  de sueldos.
- ⚠️ **"Se seguirá llevando aparte."** Contradice a RN-13 de la spec de sueldos, que sí la
  calcula. Ver §8 de este documento.

## 7. Puntos y sueldo (N4, N5)

**Meta de puntos que paga dinero:** todavía **sin definir**. El dueño quiere primero ver cuántos
puntos junta la gente al mes y recién después ponerle un valor. Lo que sí dejó fijo:
- El valor del punto **debe ser editable**.
- **La meta no es igual para todos.** Cambia por puesto (más rango, más meta), por tienda y por
  otras cosas.

**Puntualidad:** *"se paga por horas, por ende, cuando se llega tarde se hace un descuento y
además se pagan menos horas"*. Confirma que el castigo es **doble** y por dos caminos distintos:
la multa por tardanza más las horas que efectivamente no trabajó. Es exactamente lo que hace el
motor de sueldos (RN-08 y RN-06 por separado).

## 8. Sistema de sueldos (S1 a S9)

| Pregunta | Respuesta |
|---|---|
| S1 — Cómo se paga | **Por horas trabajadas**, que después se traduce a sueldo fijo mensual, por semana o por día. Depende de lo que se acuerde con cada trabajador |
| S2 — Cada cuánto | Depende de cada trabajador y de su fecha de entrada |
| S3 — ¿Todos igual? | **No. Cada uno tiene su acuerdo** |
| S4 — Qué se descuenta | ⚠️ **Sin responder.** Ver §9 |
| S5 — Qué se suma | Comisiones y bonos. No mencionó horas extra ni puntos |
| S6 — Planilla | Hoy no hay. *"Sería ideal tener la estructura de una planilla"* |
| S7 — Quién arma la planilla | **Nadie. No se hacen** |
| S8 — Comprobante | Hoy sólo el resumen de "mi desempeño". Un recibo formal queda como idea para cuando haya planilla |
| S9 — Adelantos | Sí hay. ⚠️ **Regla nueva:** para pedir uno hay que tener **mínimo una semana trabajada ese mes** como garantía |

**Lo que esto confirma de la spec de sueldos:**
- El principio central — todo cuelga del **valor por hora** — es correcto (S1).
- El periodo por persona, anclado a su fecha de entrada, es correcto (S2).
- Un acuerdo por colaborador, no por puesto, es correcto (S3).
- La modalidad **por día trabajado** existe y no está implementada: la spec sólo contempla
  mensual y semanal.
- La **garantía de una semana** para el adelanto no está en la spec.
- La **comisión** queda en duda: la spec la calcula (RN-13) pero el dueño dijo que se lleva
  aparte (N1).

## 9. Lo que duele en el negocio (A3 a A6)

**Lo que más plata hace perder** (A4) — la pregunta clave, la que define qué blindar primero:
1. **El control de inventario**: se retienen productos, se estancan, no se ponen en su lugar
   (el mostrador).
2. **Que los colaboradores no hagan sus actividades.** *"Es requerido mapear bien las
   actividades"*.

**Lo único que arreglaría si pudiera arreglar una cosa** (A5):
1. Un inventariado de ternos más eficiente y rápido.
2. El mapeo correcto de los colaboradores.

**Lo que hace perder tiempo, además de la falta de comunicación** (A3):
- Falta una **línea de carrera** como incentivo.
- El dueño quiere **jerarquizar**: supervisores o encargados, y comunicarse sólo con ellos en
  vez de con todos.

**Lo que todavía vive fuera del sistema** (A6): las **prendas para dar de baja**. El resto ya
está digitalizado.

> **Lectura:** de las dos cosas que más plata pierden, una (el inventario) es del otro
> programador. La otra —el mapeo de actividades— es de este sistema y es exactamente lo que ya
> existe. El problema no es que falte software, es que **nadie lo usa** (adopción 4,4%).

## 10. Pérdidas de prendas (C4)

⚠️ **Corrección importante:** se pierden **5 a 8 prendas al año**, no 1 a 3 por mes.

La estimación anterior (1–3 mensuales, de Alexander) era entre 5 y 7 veces más alta que la real.
Cambia la prioridad: la pérdida de prendas **no** es el agujero principal del negocio.

## 11. Otras decisiones

**Numeración de pedidos** (Anexo 2): **cada tienda con su propia numeración**, no una cuenta
única para toda la empresa. Hoy está al revés.

**Auditoría** (Anexo 4): *"todo debe registrarse para el control total"*. Hoy sólo se auditan 5
lugares (pedidos, caja, empleados, pagos, evaluaciones). Falta pipeline, incidencias, cambios de
horario y solicitudes. El pipeline es el caso difícil: serían miles de filas por día.

**La tienda Trece** (N13): **sí entra al sistema nuevo**, como una tienda normal. No queda aparte.

---

_Fuente: PDF respondido por el dueño, entregado el 13 de agosto de 2026._
