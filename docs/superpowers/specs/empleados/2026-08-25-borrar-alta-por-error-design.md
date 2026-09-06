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

1. La RPC `empleado_borrar_alta(p_empleado uuid)` y su hermana de sólo lectura
   `empleado_borrar_alta_previo(p_empleado uuid)` — la que cuenta sin borrar, para C-1.
2. La prueba de migración con los 10 casos.
3. `apps/erp-web/lib/empleados-repo.ts` y la pantalla: el diálogo que muestra la cuenta antes de
   confirmar.
