# SPEC — Deshacer un alta hecha por error, sin abrir la puerta a borrar a una persona

> **Qué es.** El ítem F-3 de [la hoja de ruta](../2026-08-25-reunion-admin-hoja-de-ruta.md), acotado
> por Alexander el 25-ago-2026: *«sirve en caso de presionar accidentalmente crear personal o algo
> así»*. No es «borrar empleados» — es **deshacer un alta recién hecha**.
>
> **Zona de rigor: spec completa.** Borra filas de personas de forma irreversible. El radio de daño no
> es el tamaño del código, es que un botón mal puesto se lleve historia que no se puede recuperar.

---

## 1. Por qué esto ya se había decidido que NO, y por qué ahora sí

El 14-ago-2026 se estudió «eliminar personal» y **se decidió que no**. La razón está medida y sigue
siendo cierta (`docs/aprendizajes.md`): borrar a alguien exigía tocar **48 referencias**, y hacerlo a
lo bruto se llevaba **73 reportes y 473 filas de historial de prendas** — que son de la empresa, no de
la persona. Por eso existe *suspender*, que corta el acceso y conserva todo.

**Lo que cambia hoy no es esa conclusión: es el caso de uso.** Alexander no pide borrar a alguien que
trabajó. Pide deshacer un alta creada por accidente — alguien que se creó hace dos minutos y no llegó
a hacer nada. Eso no tiene 48 referencias: no tiene ninguna.

**Suspender sigue siendo la respuesta para todo lo demás.** Esta spec no la reemplaza; agrega la
única salida que suspender no cubre: la fila que nunca debió existir.

## 2. Hasta dónde llega, decidido por Alexander

Se ofrecieron tres alcances. Eligió el del medio:

> **Se puede borrar si no tiene pagos ni evaluaciones** — aunque tenga algo de asistencia o reportes
> sueltos.

Traducido a la base, **el borrado se niega si la persona tiene cualquiera de estas**:

| Bloquea | Por qué |
|---|---|
| `sueldo_liquidaciones` | Es un pago emitido. Está congelado por cuatro guardas y no se borra ni anulado |
| `sueldo_liquidacion_pagos` | Plata efectivamente entregada |
| `pagos` (sistema viejo) | Historia congelada (§2.7) — no se toca ni para borrar |
| `sueldo_acuerdos` | Un contrato pactado. `on delete restrict` ya lo impide a nivel de base |
| `evaluaciones_mensuales` | Una nota emitida sobre esa persona |
| `evaluaciones_valores` (como evaluado **o** como evaluador) | Rompería el promedio de otra persona, o dejaría su propio puntaje colgando |
| `sueldo_movimientos` / `sueldo_ventas` | Adelantos, bonos, ventas — plata |

**No bloquean, pero se cuentan y se muestran antes:** `asistencias`, `reportes` (como encargado),
`reporte_trabajadores`, `incidencias`, `pipeline_puntos`, `marcas_huellero`, `empleado_tiendas`.

## 3. El diseño

### C-1 — La cuenta ANTES, con el costo a la vista

Es el aprendizaje textual del 14-ago: *«se cuenta fila por fila ANTES, y el conteo se le muestra al
dueño para que decida con el costo a la vista»*.

Al pedir borrar, el sistema **primero cuenta** y muestra exactamente qué se va a llevar:

```
Vas a borrar a «Juan Pérez» (creado hace 3 minutos).
Esto se elimina y no se puede recuperar:
  · 2 días de asistencia
  · 1 marca del huellero
  · 4 sedes asignadas
No tiene pagos, contratos ni evaluaciones.
```

Si la cuenta da todo en cero —el caso que Alexander describe— el texto lo dice y el botón queda
directo. **Si hay algo que se lleva, el número está a la vista antes de confirmar, no después.**

### C-2 — Qué se hace con lo que arrastra

Dos criterios distintos, y la diferencia importa:

- **Lo que es de la persona** (`asistencias`, `marcas_huellero`, `empleado_tiendas`,
  `reporte_trabajadores`, `pipeline_puntos`): se borra con ella.
- **Lo que es de la empresa** (`reportes` donde fue encargado, `incidencias` que reportó o donde es
  responsable): **la fila se conserva y la referencia se vacía**. Un turno que ocurrió, ocurrió — que
  el encargado haya sido dado de alta por error no borra el turno.

Es el mismo criterio que ya usó el borrado de los 16 empleados del 14-ago: *«donde la referencia
admite nulo, se vacía en vez de borrar la fila»*.

### C-3 — Quién puede, y con qué guard

Sólo administrador. La RPC lleva su propio `private.app_es_admin()` adentro, no depende de que la
pantalla lo pregunte — mismo criterio que `sueldo_entrada` y `huellero_declarar_faltas_del_dia`.

### C-4 — Queda registrado

El borrado se anota en `audit_log`, que ya existe (migración `0058`, ampliada por la `0088`) y ya
cubre `empleados`. **Se guarda el nombre y el código de quien se borró, en el `antes` del registro** —
si no, no queda ninguna forma de saber a quién se eliminó. `password_hash` **nunca** entra al registro
(regla ya vigente desde la `0058`).

## 4. Lo que esta spec NO hace

- **No** reemplaza a suspender. Suspender sigue siendo lo correcto para alguien que trabajó y se fue.
- **No** permite borrar al último administrador activo — ya lo impide la `0083` para suspender, y acá
  vale igual por la misma razón: la empresa quedaría afuera de su propio sistema.
- **No** toca los 16 borrados del 14-ago ni ninguna fila existente.
- **No** agrega ningún parámetro de negocio.

## 5. Casos de prueba

| # | Escenario | Esperado |
|---|---|---|
| 1 | Persona recién creada, sin nada | Se borra. La cuenta previa muestra todo en cero |
| 2 | Persona con 2 asistencias y 1 marca | Se borra, **después de mostrar esos números**. Las asistencias y la marca se van con ella |
| 3 | Persona que fue **encargada de un reporte** | Se borra, **el reporte queda** con `encargado_id` en null |
| 4 | Persona con una **liquidación** | **Se niega**, nombrando el motivo |
| 5 | Persona con un **contrato** (`sueldo_acuerdos`) | **Se niega** — además la FK `on delete restrict` ya lo impediría |
| 6 | Persona con una **evaluación mensual** | **Se niega** |
| 7 | Persona que **votó** a otra en Valores 360° | **Se niega** — borrarla movería el promedio de otro |
| 8 | El **último administrador activo** | **Se niega** |
| 9 | Un no-administrador intenta borrar | **Se niega** por el guard de la RPC, no sólo por la pantalla |
| 10 | Después de borrar | Queda la fila en `audit_log` con el nombre y el código |

## 6. Orden de implementación

1. ✅ La RPC `empleado_borrar_alta(p_empleado uuid)` y su hermana de sólo lectura
   `empleado_borrar_alta_previo(p_empleado uuid)` — la que cuenta sin borrar, para C-1. Migración
   `0099`, aplicada contra `scilb` el 8-sep. Corrigió sobre la marcha un bug real de PL/pgSQL
   (`text[] || 'texto'` sin cast, ver `docs/aprendizajes.md`) que sólo apareció al ejecutarla contra
   la base — quedó documentado en el encabezado de la migración.
2. ✅ La prueba de migración: 13 casos (los 10 de §5 más 3 extra que salieron de §7 —
   `huellero_mapeos`, `prenda_pasada` como lavadora, y `evaluaciones_valores` en los dos roles), más
   6 de refuerzo tras el fix del cast. Los 17, `[ok]` contra `scilb`.
3. ✅ `apps/erp-web/lib/empleados-repo.ts` y la pantalla: el botón «Deshacer alta» vive en la
   cabecera del expediente de `/personal/[id]` (visible en cualquier sección, no sólo en Datos, para
   no chocar con el trabajo en paralelo sobre esa pestaña). El diálogo de dos pasos: consulta
   `empleado_borrar_alta_previo()` al abrir, lista los bloqueos con el botón de confirmar
   deshabilitado si hay alguno (y remite a «Suspender»), o los conteos traducidos a texto llano si
   no hay ninguno, con el botón de borrado en rojo. `bash tools/verificar-local.sh` en verde.

---

## 7. Addendum — el mapa real de referencias, medido (25-ago-2026)

> Las secciones 2 y 3 se escribieron listando de memoria las tablas que cuelgan de una persona.
> Antes de encargar el código se midió contra `scilb` (`pg_constraint` sobre `public.empleados`) y
> **la lista estaba corta: son 50 columnas en 35 tablas, no 14**. Lo que sigue reemplaza a §2 donde
> se contradigan. Es el no-negociable 7 aplicado a esta spec: la lista de arriba era un documento
> comprobado contra otro documento; ésta es la base.

Tres omisiones habrían hecho fallar la RPC en producción:

1. **`huellero_mapeos.empleado_id` es `on delete restrict` y hoy tiene 13 filas.** Es exactamente el
   caso que describe Alexander —un alta recién hecha a la que ya se le asignó su huella—, y la base
   habría negado el borrado con un error crudo de Postgres. Hay que borrar el mapeo *antes*.
2. **`prenda_historial` (11.084 filas), `prenda_pasada` (1.709) y `prenda_calificacion` (454)** ni
   figuraban. Son `no action` con columna nullable: sin vaciarlas, el `delete` falla.
3. **`evaluaciones_valores` es `on delete cascade`.** §2 la pone como bloqueante y está bien, pero
   la base **no** la haría cumplir: borraría los votos en silencio. El bloqueo tiene que estar
   escrito en la RPC, no delegado a la FK.

### 7.1 — Bloquean el borrado

La RPC se niega y nombra el motivo. No confía en la FK: comprueba ella misma.

| Tabla . columna | `on delete` | Por qué |
|---|---|---|
| `sueldo_liquidaciones.empleado_id` | restrict | Un pago emitido |
| `sueldo_acuerdos.empleado_id` | restrict | Un contrato pactado |
| `sueldo_movimientos.empleado_id` | restrict | Adelantos, bonos — plata |
| `sueldo_ventas.empleado_id` | restrict | Ventas atribuidas |
| `pagos.empleado_id` | no action, **not null** | Historia congelada del sistema viejo |
| `evaluaciones_mensuales.empleado_id` | no action, **not null** | Una nota emitida |
| `evaluaciones_valores.evaluado_id` | **cascade** | Se borrarían solos. Bloquear explícitamente |
| `evaluaciones_valores.evaluador_id` | **cascade** | Ídem: movería el promedio de otra persona |
| `solicitudes.solicitante_id` | no action, **not null** | 0 filas hoy; not null ⇒ bloquea por defecto |
| `mt_consentimiento.registrado_por` | no action, **not null** | 0 filas hoy; ídem |
| `mt_medicion_real.tomada_por` | no action, **not null** | 0 filas hoy; ídem |

`sueldo_liquidacion_pagos` **no** tiene `empleado_id`: cuelga de `liquidacion_id`. Bloquear por
`sueldo_liquidaciones` ya lo cubre; comprobarla aparte sería ruido.

**Criterio para las tres de cero filas:** una referencia *not null* que todavía no se pensó bloquea.
El costo de equivocarse hacia el bloqueo es un mensaje de "no se puede"; hacia el otro lado es una
fila perdida.

### 7.2 — Se van con la persona

| Tabla . columna | `on delete` | Cómo |
|---|---|---|
| `asistencias.empleado_id` | cascade | Sola |
| `empleado_tiendas.empleado_id` | cascade | Sola |
| `huellero_mapeos.empleado_id` | **restrict** | **`delete` explícito antes**, o la base niega todo |
| `pipeline_puntos.empleado_id` | no action, not null | `delete` explícito |
| `reporte_trabajadores.empleado_id` | no action, nullable | `delete` explícito — es la fila que dice "estuvo en ese turno", y sin la persona no dice nada |

### 7.3 — La fila queda, la referencia se vacía

Ocurrió; que el actor fuera un alta equivocada no lo deshace.

`reportes.encargado_id`, `reportes.evaluador_id`, `reporte_drafts.encargado_id`,
`reporte_extras.registrado_por_id`, `incidencias.reportado_por_id`, `incidencias.responsable_id`,
`prenda_historial.empleado_id`, `prenda_pasada.lavador_id`, `prenda_pasada.planchador_id`,
`prenda_calificacion.calificador_id`, `dispositivos_autorizados.aprobado_por`.

Automáticas por FK (`set null`), no hay que tocarlas: `audit_log.actor`, `marcas_huellero.empleado_id`,
`sueldo_acuerdos.creado_por`, `sueldo_liquidaciones.anulada_por`, `sueldo_liquidaciones.cerrada_por`,
`sueldo_liquidacion_pagos.registrado_por`, `sueldo_liquidacion_pagos.anulado_por`,
`sueldo_movimientos.creado_por`.

**Las marcas del huellero se conservan sin dueño a propósito.** Una marca es una pulsación real del
reloj físico: conserva su `huellero_id` crudo y se puede volver a asignar. Borrarlas perdería
evidencia del aparato por un error del sistema.

### 7.4 — Comercial: código muerto, pero la FK es real

893 filas entre las nueve tablas. Están fuera de alcance desde el 20-ago **para navegar**, no para la
integridad referencial: sin vaciarlas, el `delete` falla igual.

`caja_movimientos.registrado_por_id`, `caja_sesiones.abierta_por_id`, `caja_sesiones.cerrada_por_id`,
`compras.responsable_id`, `pedidos.creado_por_id`, `pedido_garantias.creado_por_id`,
`envios_accesorios.responsable_id`, `envios_accesorios.validado_por_id`,
`envios_prendas.responsable_id`, `stock_movimientos.responsable_id`, `accesorios_log.responsable_id`.

Todas nullable: **se vacía la referencia y no se borra ni una fila del comercial.**
`solicitudes.aprobado_por_id`, `confirmado_por_id`, `entregado_por_id` y `rechazado_por_id` también
se vacían (su `solicitante_id`, en cambio, bloquea — §7.1).

### 7.5 — Enumerar, no descubrir

La RPC lista estas tablas **una por una**. La alternativa —recorrer `pg_constraint` en tiempo de
ejecución y vaciar todo lo que sea nullable— nunca se desactualiza, y ése es justamente el problema:
una tabla futura que guarde plata o historia entraría sola al grupo "se vacía en silencio".

Con la lista escrita, una tabla nueva con FK a `empleados` hace que el borrado **falle con un error de
Postgres**. Es ruidoso y es el lado correcto en el que fallar. La prueba de migración deja anotado
que ese error significa "hay una tabla nueva: decidí a qué grupo va".

### 7.6 — Dos datos más del esquema

- `empleados` **no** tiene columna hacia `auth.users`. El login es `cod` + `password_hash`
  (`0001`). Borrar la fila no deja ningún usuario de autenticación colgando.
- `empleados` sí tiene `password_hash`: **jamás entra al `audit_log`** (regla vigente desde la `0058`).
