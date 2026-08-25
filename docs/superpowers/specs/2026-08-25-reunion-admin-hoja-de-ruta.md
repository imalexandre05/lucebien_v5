# Hoja de ruta — lo que salió de la reunión con el administrador (25-ago-2026)

> **Qué es esto.** Alexander trajo las anotaciones de una reunión con el administrador: ~45 pedidos,
> observaciones y decisiones, en el orden en que salieron en la conversación. Este documento los
> ordena por tema y por riesgo, dice cuáles ya están hechos, cuáles necesitan spec propia y cuáles
> son preguntas de negocio que **nadie puede contestar por el administrador**.
>
> **No inventa nada.** Cada fila cita la anotación textual. Donde hubo que interpretar, se dice que
> se interpretó y por qué. Donde no alcanzó para decidir, queda como pregunta abierta, no como
> default silencioso (no-negociable 5).
>
> **Cómo se usa.** Es el índice de trabajo del loop que arrancó el 25-ago. Cada tema con spec propia
> enlaza a su documento. Lo que está en «hecho» se verificó contra la base o contra el código, nunca
> contra otro documento (no-negociable 7).

---

## 0. Lo más importante que dijo el administrador

Alexander lo subrayó aparte, al final de las notas, y por eso encabeza este documento:

> *«todas las actividades, pipeline, etc, dan puntos, eso es importante, porque en la evaluación una
> cierta cantidad de puntos aún no definida (por ejemplo: 5000) significará el promedio, y tendrá por
> ejemplo la nota de "16" y luego veremos cuántos puntos debe llegar para tener 20 de nota (que es
> excelente o perfección) si pasa de ese promedio o incluso más de la nota de 20 (haciendo
> actividades extras, etc) es alguien sobresaliente y se evalúa poder mejorar sus condiciones
> laborales o línea de carrera»*

Esto **da vuelta cómo se calcula la nota mensual**. Hoy la nota es un promedio ponderado de siete
componentes, cada uno sobre 20, con siete pesos que suman 100 %. El administrador quiere otra cosa:

| | Hoy | Lo que pide el administrador |
|---|---|---|
| **De dónde sale la nota** | Promedio ponderado de 7 componentes | De los **puntos acumulados** en el período |
| **Techo** | 20, siempre | **Se puede pasar de 20** — eso define «sobresaliente» |
| **Para qué sirven los 7 componentes** | Son la fórmula | Pasan a ser un **perfil**: en qué es bueno y en qué flaquea |
| **Qué es la nota** | El cálculo | Una **lectura visual** de los puntos (*«el 1/20 que quede como visual no como ponderado»*) |

Tiene spec propia: **[2026-08-25-puntos-como-moneda-design.md](sueldos/2026-08-25-puntos-como-moneda-design.md)**.

---

## 1. Tabla maestra — los 45 pedidos, por tema

Leyenda de estado: ✅ hecho y verificado · 📐 con spec, sin construir · 🔨 en construcción ·
🔴 **pregunta de negocio abierta** — nadie puede contestarla por el administrador · ⏸️ anotado, sin
empezar.

### A. Puntos, nota y evaluación — el núcleo

| # | Lo que dijo | Estado | Dónde |
|---|---|---|---|
| A-1 | *«los componentes dan los puntos, no lo demás»* · *«esos puntos son lo que dan dinero en algún punto»* | 📐 | [puntos-como-moneda](sueldos/2026-08-25-puntos-como-moneda-design.md) |
| A-2 | *«el 1/20 que quede como visual no como ponderado»* · *«por ejemplo 5000 puntos son 16, pero 7500 es 20, si pasa 7500 es mayor todavía»* | 📐 | ídem |
| A-3 | Bandas: *«>18 ideal y perfección»* · *«>20 persona sobresaliente (lograble con metas de ventas y extras constantes)»* · *«<13 riesgo de despido»* | 📐 | ídem |
| A-4 | *«poder ver si esa persona es puntual o es buena con ventas y ver dónde flaquea; tal vez es buena en limpieza y puntual pero no venda»* | 📐 | ídem, §perfil |
| A-5 | *«y con eso tomar decisiones, como darles cursos etc y retener a los empleados»* | ⏸️ | Consecuencia de A-4, no es código todavía |
| A-6 | 🔴 *«considerar que a veces hay personas que no hacen pipeline y solo ventas, tenemos que ver cómo equiparar; si planchar 100 prendas vale 1000, ¿cuánto vale una venta?»* | 🔴 | **La pregunta más cara de toda la reunión.** Ver §2 |
| A-7 | *«corregir las horas extras en reportes de actividades y en el desempeño/evaluación»* | ⏸️ | Falta que el administrador precise qué está mal — ver §2 |
| A-8 | *«en el tema de evaluación debe ser automático, todos los usuarios deben evaluar a un usuario una semana antes del pago de éste, y que tengan un pendiente de evaluar a esa persona hasta su día de pago»* | 📐 | Spec propia pendiente (B-prioridad) |
| A-9 | *«diseñar parte de exámenes tanto para admin y usuarios»* | ⏸️ | Módulo nuevo, grande. Ya estaba anotado como pendiente desde el 14-ago (`valorCapacitacion` depende de esto) |

### B. Huellero y asistencias — donde el dato se vuelve plata

| # | Lo que dijo | Estado | Nota |
|---|---|---|---|
| B-1 | *«tolerancia en 0, de hecho se debería llegar 10 mins antes»* | 📐 | Cambia `sueldo_tolerancia_minutos` de 10 a 0. **Es un parámetro, no código** — pero mueve plata: hay que avisar antes de aplicarlo |
| B-2 | *«si su salida es a las 8 y se marca a las 8:20 entonces se ponga que es de salida y ya no de entrada»* | 📐 | Emparejado del huellero |
| B-3 | *«que automáticamente decida si algo (marcaje) es ingreso o salida dependiendo su horario»* | 📐 | Mismo tema que B-2, generalizado |
| B-4 | *«si se marca dos veces, por ejemplo a las 8pm y 8:01pm, que se considere el que esté más temprano y se obvie el otro»* | 📐 | Deduplicación por ventana |
| B-5 | *«cuando no se marca entrada o salida por huellero entonces se rellena automáticamente, pero se avisa que ese marcado no es real y fue automático porque no se marcó»* | 📐 | **Contradice parcialmente una regla existente**: hoy un día sin salida queda `sin_dato` y CORTA la liquidación. Ver §3 |
| B-6 | *«en caso si no se marca ni una huella ya es falta»* | 📐 | Hoy queda `sin_dato` (que no es falta). Es un cambio de regla real |
| B-7 | *«¿cómo se marca en las asistencias cuando es doble turno?»* | 🔴 | Pregunta del administrador, no pedido. Ver §2 |
| B-8 | *«tratar de mejorar el reconocimiento del huellero para que no tenga tantos errores»* · *«entrenar al huellero para reconocer marcas, a veces los colaboradores fallan»* | ⏸️ | Es hardware/configuración del Hikvision, no del ERP. Va a la lista de Jordan |
| B-9 | *«notificaciones en caso de declaraciones falla»* | ⏸️ | Necesita definir por dónde notifica (¿pantalla? ¿WhatsApp?) |
| B-10 | *«que en declarar asistencias solo se vea lo que pone del período»* | 📐 | Pantalla, acotado |
| B-11 | *«cómo hacer para registrar persona y conectar huellero»* | ⏸️ | Es procedimiento, no código: va a la lista de Jordan + un documento de «cómo dar de alta a alguien» |

### C. Contratos

| # | Lo que dijo | Estado | Nota |
|---|---|---|---|
| C-1 | *«pruebas de ediciones de contrato»* | ⏸️ | Prueba E2E, acotada |
| C-2 | *«en el contrato que aparezcan todos los datos (como cel, DNI, recomendaciones)»* | 📐 | El contrato imprimible hoy no los trae |
| C-3 | *«y también se pueda adjuntar imágenes, CVs, DNIs»* | 📐 | Necesita Supabase Storage — ya se usa para `mt_*` (Mi Talla), hay patrón que copiar |

### D. Liquidaciones y pagos

| # | Lo que dijo | Estado | Nota |
|---|---|---|---|
| D-1 | ⚠️ *«las liquidaciones cuando se cierran que se pueda editar, todo debe ser editable "por si las moscas"»* | 📐 con **interpretación** | **Choca de frente con el congelado.** Ver §3 — se resuelve sin romperlo |
| D-2 | *«las liquidaciones y pagos y todo eso se debe registrar el método (yape, efectivo etc)»* | ✅ **ya existe** | `sueldo_liquidacion_pagos` (migración 0080) ya guarda el método. Verificar en pantalla y confirmarlo |
| D-3 | *«los cambios en configuración deben aplicarse»* | ⏸️ | Suena a defecto real: algo se edita en /configuración y no surte efecto. **Falta reproducirlo** — ver §2 |

### E. Incidencias

| # | Lo que dijo | Estado | Nota |
|---|---|---|---|
| E-1 | *«incidencias solo a su nombre»* + *«el admin sí puede ver de todos»* | 🔨 **contradice lo del 24-ago** | Ver §3: el 24-ago dijo que los operativos ven el listado de su sede; ahora dice sólo las propias |
| E-2 | *«en incidencias no se puede ver el responsable para los colaboradores, solo administradores»* | ✅ hecho | PR #23, 24-ago-2026 |
| E-3 | *«incidencias solo en "otros" se puede ver gravedad y requiere descripción»* | 📐 | Acotado, de pantalla |
| E-4 | *«incidencias en lo demás si tiene sus puntos en contra y ya tiene gravedad, es redundante»* | 📐 | Ídem E-3, la otra mitad |

### F. Pantallas y administración

| # | Lo que dijo | Estado | Nota |
|---|---|---|---|
| F-1 | *«que se quede borrador en caso se cambie de pantalla»* | 📐 | Formularios largos que se pierden al navegar. Acotado, alto valor de uso |
| F-2 | *«poner una página de métricas de todo tipo, dashboard de personal exclusivamente»* | 📐 | Pantalla nueva. Se alimenta sola de A-4 (el perfil) |
| F-3 | *«poder deshabilitar y eliminar a personal»* | ✅ parcial | Suspender ya existe y banea el acceso (migración 0083). **Eliminar** ya se estudió: cuesta 48 referencias, decidido no borrar. Confirmar que la pantalla lo dice claro |
| F-4 | *«MANDAR LISTA DE COSAS QUE TIENE QUE HACER JOVEN JORDAN»* | 📐 | Entregable propio, no código |

---

## 2. 🔴 Las preguntas que nadie puede contestar por el administrador

Estas quedan **abiertas a propósito**. Ninguna se rellena con un default inventado (no-negociable 5);
donde el sistema necesita seguir funcionando mientras tanto, se dice exactamente qué hace y por qué
esa elección es la conservadora.

1. **¿Cuántos puntos vale un sol vendido?** (A-6) Es la pregunta más cara de toda la reunión: sin
   ella, quien sólo vende no puede tener nota. El administrador ya dio la mitad del ancla:
   *«si planchar 100 prendas vale 1000»* → 10 puntos por prenda planchada. Falta la otra mitad.
   **Mientras tanto:** el sistema deja el parámetro **vacío**, las ventas suman 0 puntos, y la
   pantalla lo dice con todas las letras en vez de fingir que la persona rindió poco.
2. **¿Cuántos puntos son el promedio, y cuántos son 20?** El administrador dio 5000 y 7500 como
   *ejemplo* (*«una cierta cantidad de puntos aún no definida (por ejemplo: 5000)»*). Se siembran
   como default explícito y editable desde /configuración, marcados como provisionales.
3. **¿Qué está mal con las horas extras?** (A-7) *«corregir las horas extras en reportes de
   actividades y en el desempeño/evaluación»* — no dice qué está mal. Hace falta un ejemplo concreto
   (una persona, un período, qué muestra y qué debería mostrar).
4. **¿Cómo se declara un doble turno?** (B-7) El administrador lo preguntó, no lo respondió. Hoy la
   base guarda una fila por `(empleado, fecha, turno)` y el motor suma los tramos — o sea que ya
   está soportado. Falta saber si lo que le preocupa es cómo se ve en pantalla o cómo lo emparejaría
   el huellero.
5. **¿Qué cambio de configuración no se aplicó?** (D-3) Sin un ejemplo concreto no se puede
   reproducir ni arreglar; puede ser un defecto real o un malentendido de qué hace un parámetro.
6. **Tolerancia 0** (B-1): *«de hecho se debería llegar 10 mins antes»*. ¿Los 10 minutos antes son
   una expectativa cultural, o el sistema debe contar tardanza desde 10 minutos ANTES de la hora
   pactada (o sea, tolerancia −10)? Cambia a quién se le descuenta plata.

---

## 3. Los tres choques — donde una anotación contradice algo que ya está construido y verificado

No se resuelven a favor de la anotación ni a favor del código: se resuelven entendiendo qué problema
real tenía el administrador, y buscando la forma que no rompa nada que ya protege a alguien.

### 3.1 «Todo debe ser editable» contra el congelado de las liquidaciones (D-1)

**El choque.** `sueldo_liquidaciones` tiene cuatro guardas de inmutabilidad (migración 0072 §8) que
le costaron al proyecto una ronda entera de verificación adversarial: diez defectos, seis de ellos
en el congelado. Una liquidación cerrada no se edita, y esa es toda la garantía de que el recibo que
firmó una persona diga lo mismo dentro de un año.

**Qué quiso decir el administrador.** *«por si las moscas»* no es *«quiero reescribir pagos»*: es
*«no quiero quedarme trabado si me equivoqué»*. Y para eso el sistema **ya tiene camino**: anular
con motivo y volver a emitir. Lo que falta no es permiso, es que ese camino sea evidente.

**Decisión (interpretación mía, para confirmar).** El congelado se queda **intacto**. Lo que se
construye es un botón **«Corregir esta liquidación»** que hace anular + clonar en borrador en un
solo paso, pidiendo el motivo. El administrador consigue exactamente lo que pidió —poder arreglar—
sin que se pierda el rastro de qué se pagó primero. Si aun así quiere edición directa sobre una
cerrada, **eso sí hay que preguntárselo de nuevo**, con el costo a la vista.

### 3.2 «Incidencias solo a su nombre» contra lo que él mismo dijo el 24-ago (E-1)

**El choque.** El 24-ago-2026 contestó: *«sí [los operativos ven el listado], pero no pueden ver
quién reportó, solo el admin puede»*. Sobre eso se construyó y se aplicó la migración `0092`, que
abrió la lectura de incidencias a la sede de cada persona. Ahora dice *«incidencias solo a su
nombre»*.

**Lectura.** No son necesariamente contradictorias: *«a su nombre»* puede significar «las que la
tienen a ella como responsable», que es más restrictivo que «las de su sede» pero sigue siendo más
que nada. Con las cuatro sedes asignadas a todo el mundo (confirmado el 24-ago como intencional),
«por sede» hoy significa en la práctica «todas» — que es justo lo que suena que quiso acotar.

**Decisión (interpretación mía, para confirmar).** Se ajusta a **«el colaborador ve las incidencias
donde él es el responsable; el administrador ve todas»**. Es la lectura literal de las dos frases
juntas (*«solo a su nombre»* + *«el admin sí puede ver de todos»*) y es la más conservadora con datos
de personas (no-negociable 3). Es un cambio chico sobre la `0092`, no una vuelta atrás.

### 3.3 «Se rellena automáticamente» contra el corte por día sin declarar (B-5, B-6)

**El choque.** Hoy, un día con entrada y sin salida queda en `condicion = 'sin_dato'` y **corta la
liquidación del período entero**, nombrando la fecha. Eso se construyó a propósito: la migración
`0085` existe justamente porque un día a medio declarar antes se pagaba a medias, en silencio, y era
el único camino del sistema que pagaba de menos sin avisar.

**Qué pide el administrador.** Que se rellene solo, pero *«se avisa que ese marcado no es real y fue
automático porque no se marcó»*. Y aparte: *«si no se marca ni una huella ya es falta»*.

**Decisión (interpretación mía, para confirmar).** Las dos cosas conviven si el relleno automático
**no es silencioso ni definitivo**:
- El sistema **propone** la hora que falta (la del horario contratado), marcada como derivada, con
  su aviso visible en la pantalla de asistencia y en el detalle de la liquidación.
- La liquidación **deja de cortar** por ese día, porque ya no hay un dato ausente: hay uno propuesto
  y marcado como tal.
- El administrador puede pisarlo con la hora real en cualquier momento.
- Cero marcas en un día contratado sí pasa a ser **falta** (B-6), que es lo que él pidió, y eso ya
  tiene consecuencia económica definida (dos días).

Lo que **no** se hace: rellenar sin marcar que se rellenó. Eso sería exactamente el defecto que la
`0085` vino a cerrar.

---

## 4. El orden de trabajo

Por radio de daño y por lo que el administrador subrayó, no por lo que es más fácil.

1. **Puntos como moneda + nota visual** (A-1 a A-4). Es el núcleo, y todo lo demás de evaluación
   cuelga de él. Spec escrita.
2. **Incidencias: las tres correcciones juntas** (E-1, E-3, E-4). Chico, acotado, y E-1 toca datos
   de personas.
3. **Huellero: emparejado inteligente** (B-2, B-3, B-4, B-5, B-6). Un solo cambio de fondo, cinco
   pedidos.
4. **Evaluación automática con pendiente** (A-8). Depende de 1.
5. **Dashboard de personal** (F-2). Depende de 1 — es la pantalla donde el perfil de A-4 se vuelve
   útil.
6. **Contratos: datos completos + adjuntos** (C-2, C-3).
7. **Corregir liquidación en un paso** (D-1) y **borrador que sobrevive** (F-1).
8. **Lista de Jordan** (F-4) — se puede escribir en cualquier momento, no depende de nada.

---

## 5. Qué NO se va a hacer en este loop, y por qué

- **Módulo de exámenes** (A-9): es un módulo entero, no un cambio. Necesita su propia conversación
  sobre qué se evalúa, quién arma las preguntas y qué pasa con el resultado.
- **Mejorar el reconocimiento del huellero** (B-8): es configuración del equipo Hikvision, no del
  ERP. Va a la lista de Jordan.
- **Notificaciones** (B-9): falta decidir el canal antes de construir nada.
- **Eliminar personal** (F-3, la parte de «eliminar»): ya se estudió el 14-ago y se decidió que no
  se borra —cuesta 48 referencias y se lleva historia de la empresa—. Se suspende. Si el
  administrador insiste, es una conversación aparte con ese costo sobre la mesa.
