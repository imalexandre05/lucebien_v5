# SPEC — Módulo único de colaboradores

> **Fecha:** 2026-08-20
> **Estado:** construido. Compila (`next build`), typecheck limpio, 388 tests del core en verde.
> **Zona de rigor:** media para la navegación; **crítica** para el gate de permisos, porque el
> módulo cruza asistencia, nota y sueldo de terceros.
> **Decidido con Alexander:** el módulo reemplaza las entradas sueltas del menú (opción A).

---

## 1. El problema

El ERP estaba organizado por **tabla** y quien administra piensa por **persona**.

Ocho entradas del menú lateral contestaban pedazos de la misma pregunta —Evaluaciones, Pagos,
Contratos, Declarar asistencia, Liquidaciones, Adelantos y ventas, Asistencias, Valores 360°— y
ninguna la contestaba entera: *¿qué pasa con Mary este mes?*. Para responderla había que abrir cinco
pantallas y filtrar por la misma persona en cada una, con un rango de fechas propio en cada una.

El sistema viejo (Express + SQLite, `public/index.html:936`) tenía esto resuelto: un módulo
«Evaluación Mensual» con un selector de colaborador y un rango arriba, y seis pestañas debajo. No
era bonito, pero se entendía. La adopción del ERP nuevo es del 4,4%, y esto es parte del porqué.

**Lo que se copia del viejo es la organización, no el diseño.** La disposición —persona y período
una sola vez, arriba; secciones abajo— y nada de su estética.

---

## 2. Lo que se construyó

### Rutas

| Ruta | Qué es |
|---|---|
| `/colaboradores` | La lista: las 18 personas activas con su estado del período |
| `/colaboradores/[id]` | Resumen: qué falta para cerrar el período y qué pasó en él |
| `/colaboradores/[id]/asistencias` | Declarar qué pasó cada día |
| `/colaboradores/[id]/evaluacion` | La nota /20 y su desglose |
| `/colaboradores/[id]/valores` | El promedio recibido en Valores 360°, sin revelar quién puntuó |
| `/colaboradores/[id]/pago` | Los pagos registrados de esa persona |
| `/colaboradores/[id]/movimientos` | Adelantos, descuentos y ventas del período |
| `/colaboradores/[id]/contrato` | Lo pactado: modalidad, sueldo y horario |

### El período vive en la URL

`?desde=&hasta=`. No en un estado de React y no en un contexto que atraviese layouts.

Un layout de App Router no recibe `searchParams`, así que la barra lo lee del navegador
(`useSearchParams`) y cada página lo lee del servidor con la misma función (`lib/periodo.ts`). Eso
hace que atrás y adelante del navegador funcionen, que un enlace conserve lo que se está mirando, y
que no haya dos lugares donde el período pueda desincronizarse.

Presets: **Mes actual**, **Mes anterior** y **Ciclo personal** —el ciclo aniversario, que sale de
`calcularCiclo()` del core recibiendo `hoyPeru()` desde la UI, nunca `new Date()` (no-negociable 4).

### El hilo

Los cinco pasos que separan a una persona de su pago, dibujados como un hilo que se enhebra de
izquierda a derecha: dorado donde ya está cosido, gris donde falta, con un anillo ámbar en el punto
de corte.

```
contrato → horas de salida → días declarados → evaluación → pago
```

**No inventa ninguna regla de negocio** (no-negociable 5). Cada paso refleja una condición que el
motor ya impone y que hasta ahora sólo se descubría cuando la liquidación se negaba a correr:
`sueldo_entrada` corta el período entero nombrando cada fecha en `'sin_dato'`
(`0073_sueldos_rpc.sql:128-145`), y un día con entrada y sin salida queda en `'sin_dato'`, que es la
misma condición vista desde el otro lado. Lo único que cambia es **cuándo** se entera una persona:
antes de sentarse a liquidar, en vez de cuando el motor se planta.

El mismo componente sirve compacto en la lista, y por eso la lista contesta "¿a quién le falta
algo?" sin abrir a nadie. El orden por defecto pone arriba a quienes tienen un corte.

---

## 3. Permisos: no se inventó ninguno

Cada sección conserva **exactamente** el módulo de permisos que ya gobernaba su pantalla suelta
(`lib/colaboradores-secciones.ts`). Unificar la navegación no puede ampliar lo que alguien ve, y
menos sobre datos de personas (no-negociable 3).

| Sección | Módulo | Antes era |
|---|---|---|
| Resumen, Evaluación | `evaluaciones` | `/evaluaciones` |
| Asistencias, Movimientos, Contrato | `sueldos` | `/sueldos/*` |
| Pago | `pagos` | `/pagos` |
| Valores 360° | `evaluaciones` | ver abajo |

**Valores 360° no usa el permiso `valores`, y es a propósito.** Ese permiso está sembrado para los
7 roles porque `/valores` es el peer review que llena todo el equipo. Mirar el puntaje que recibió
**otra** persona es una lectura administrativa, tan sensible como su nota, y el aislamiento 2 dice
que nadie ve la nota de otro. Por eso va con `evaluaciones`, y la página comprueba además
`esAdmin || es la propia persona`.

La sección **nunca** muestra quién puntuó: `valores-repo` trae el evaluador para poder promediar y
no lo devuelve, y acá tampoco se pide. Sin anonimato el peer review deja de decir la verdad.

Todo el módulo pasa por `getServerClient()`, así que manda la RLS. **Ninguna consulta usa
`getAdminClient()`** — los seis archivos permitidos siguen siendo seis.

Reautenticación en la lista y en el layout de la persona, mismo criterio que `/evaluaciones` y
`/pagos`.

---

## 4. El menú: de ocho entradas a dos

**Salieron** (las rutas siguen existiendo y funcionando; sólo dejaron de estar en el menú):
Evaluaciones, Pagos, Contratos, Declarar asistencia, Adelantos y ventas, Asistencias.

**Se quedaron, y hay que decir por qué:**

- **Liquidaciones** (`/sueldos/liquidaciones`). La liquidación trabaja sobre **un contrato entero**,
  no sobre un rango libre de fechas, que es el grano del módulo. Mudarla sin resolver esa diferencia
  sería mover el problema de lugar. Queda pendiente.
- **Valores 360°** (`/valores`), en *Interno*. Es el formulario que llena todo el equipo, no una
  pantalla administrativa. Sacarlo del menú habría roto el peer review de 18 personas para ganar una
  línea. La sección del módulo es la lectura administrativa de lo mismo, que es otra cosa.

La entrada del módulo se ve con `evaluaciones`, `pagos` **o** `sueldos` (`modulosAlternos` en el
sidebar). Con un solo módulo, un rol que sólo veía `sueldos` habría perdido el acceso que tenía.

`/asistencias` —la lista de registros sueltos— salió del menú y no tiene reemplazo directo: el
módulo declara por persona y período, que es lo que la gente hacía con ella. Si algún rol la
necesita, vuelve.

---

## 5. Reutilización, no reescritura

Las secciones **renderizan los clientes que ya existían**, con los datos acotados a la persona:
`AsistenciaCliente`, `EvaluacionesCliente`, `PagosCliente`, `MovimientosCliente`, `AcuerdosCliente`.

Esas pantallas saben cosas que costó aprender —que un día sin declarar no es una falta, el margen de
horas del marcaje astuto (C-05), el turno de la fila que ya existe para no crear una segunda, el
snapshot de pesos de la evaluación—. Copiarlas habría dejado **dos verdades sobre la misma regla**, y
la que alguien se olvide de actualizar es la que va a pagar mal.

Lo único nuevo de verdad es la lista, el resumen, el hilo y la sección de Valores.

---

## 6. Una diferencia de grano que quedó a la vista

**Asistencias se declara sobre el período del contrato, no sobre el de la barra.** No es un
descuido: el horario pactado sale del contrato, y sin él la tardanza no se puede medir. Cuando el
contrato y el período elegido no coinciden, la sección lo dice en una línea en vez de mostrar
números que no se corresponden con lo de arriba.

Movimientos sí usa el período de la barra, porque la liquidación consume esos movimientos por rango
(persona y período), que es exactamente como los mira el motor.

---

## 7. Lo que falta

1. **Liquidaciones dentro del módulo.** Requiere decidir qué pasa cuando el período elegido no
   coincide con ningún contrato. Es una decisión de negocio, no de UI.
2. **Días laborales y reportes esperados.** El módulo viejo los mostraba (`public/js/admin.js:1247`).
   Salen de cruzar `sueldo_acuerdo_turnos` con el calendario del período. No se portaron todavía
   porque el número que mostraba el viejo no está verificado contra el motor nuevo.
3. **El mapa de actividad y la matriz actividades × días** del módulo viejo. Son dos vistas buenas
   que no tienen equivalente en el ERP nuevo.
4. **Absorber `/empleados`** como sección «Datos». Hoy conviven el módulo y el ABM de empleados, que
   es la única duplicación que quedó en pie.
5. **Probarlo con Alexander sobre datos reales.** Compila y los tipos cierran; lo que todavía no
   pasó es que alguien lo use para cerrar un período de verdad.

---

## 8. Anexo — por qué el hilo y no una lista de checks

La pregunta que se hace el administrador no es "¿cuáles pasos están listos?" sino "¿dónde se
cortó?". Un hilo tiene dirección y un punto de corte; una lista de checks hay que leerla entera.

Y el punto de corte es lo único accionable: el motor ya se niega a liquidar si falta un día por
declarar, así que no tiene sentido mirar la evaluación antes de resolver eso. El hilo pone el orden
de resolución a la vista sin que nadie tenga que explicarlo.

Es además la metáfora de la casa: LuceBien confecciona, y el hilo dorado ya era vocabulario del
sistema. No es un adorno traído de afuera.
