# SPEC — Evaluar solo ciclos terminados, anular una nota guardada y «última nota» por mes

> **Qué es.** Tres ítems restantes del ticket imalexandre05/lucebien-tablero#41. El ítem «la nota
> y los puntos los calcula el servidor» ya está resuelto (spec 2026-10-04-evaluacion-guardar-
> recalculada) y no se rehace.
>
> **Zona de rigor: spec completa.** Toca la cadena del sueldo (`evaluación /20 → pago`) y agrega
> una RPC de borrado. **No cambia ninguna fórmula, peso ni escala.**

## 1. Defectos (verificados contra el código, 18-oct-2026)

1. `elegirEmpleado` (`app/evaluaciones/cliente.tsx`) propone `calcularCiclo(ingreso, hoyPeru())`,
   que devuelve el ciclo **en curso**. Se puede guardar una nota con puntos de un ciclo que aún no
   terminó, y como la unicidad es `(empleado_id, mes)` ese mes queda ocupado con datos parciales.
2. No hay forma de corregir una nota guardada: el único camino es borrar la fila a mano en la base.
3. `empleadosParaPago` (`pagos-repo.ts`) y `miDesempeno` (`desempeno-repo.ts`) eligen la «última
   nota» por `created_at`. Si el administrador evalúa un ciclo viejo después de uno nuevo, la
   «última» pasa a ser la vieja y el monto sugerido de pago usa la nota equivocada.

## 2. Reglas

### 2.1 Ciclo cerrado (C-1)

- Nueva función pura del core `cicloCerradoAnterior(fechaIngreso, hoy)`: devuelve el ciclo más
  reciente cuyo `hasta <= hoy`. Si `calcularCiclo(fechaIngreso, hoy)` ya da `hasta <= hoy` (solo
  pasa en el fallback de mes calendario no; ver borde), lo devuelve; si no, devuelve
  `calcularCiclo(fechaIngreso, díaAnterior(desde))`. No llama `new Date()` (no-negociable 4).
- La pantalla propone ese ciclo al elegir empleado. Las fechas siguen editables.
- El servidor (`accionCrearEvaluacion`) rechaza si `cicloHasta > hoyPeru()` con
  «El ciclo termina el DD/MM/AAAA; solo se puede evaluar un ciclo que ya terminó». Aunque la
  pantalla se altere, el servidor decide.
- **Borde:** `cicloHasta == hoy` SE PERMITE (el ciclo termina hoy y el día ya se puede contar).
  Decisión por defecto, a confirmar con el dueño (ver `docs/pendientes-negocio.md`).

### 2.2 Anular una evaluación (C-2)

- RPC `evaluacion_anular(p_id uuid, p_motivo text)`, `security definer`, solo
  `private.app_es_admin()`, con `revoke ... from public, anon` y `grant ... to authenticated`.
- Exige motivo no vacío (tras `trim`).
- Se NIEGA si algún `pagos.evaluacion_id` apunta a la evaluación (única FK hacia
  `evaluaciones_mensuales`, medida en `0001_init.sql`), o si existe una `sueldo_liquidaciones` no
  anulada del mismo empleado cuyo periodo se cruza con el ciclo de la evaluación (la liquidación
  no tiene FK, pero consume la nota; mismo criterio de bloqueo que la 0099). El mensaje dice
  qué hacer: anular primero el pago o la liquidación.
- Rastro: `trg_audit_evaluaciones_mensuales` (0058) ya registra el DELETE con `antes` completo; no
  se duplica. El motivo, que el trigger no conoce, se guarda en una fila aparte de `audit_log`
  (`tabla = 'evaluaciones_mensuales'`, `operacion = 'DELETE'`, `fila_id`, `despues = {motivo,
  anulacion: true}`) porque el esquema real solo admite INSERT/UPDATE/DELETE.
- Borra la fila; el administrador recalcula y vuelve a guardar por el flujo normal.
- UI: botón «Anular evaluación» en el historial (solo administrador), con confirmación y campo de
  motivo; si la base la niega, se muestra el mensaje accionable.

### 2.3 Última nota por mes (C-3)

La «última nota» de una persona es la del `mes` mayor; `created_at` solo desempata. Se extrae a
una función pura testeable.

## 3. Tests

- Core: `cicloCerradoAnterior` (ciclo en curso → anterior; borde `hasta == hoy`; mes corto;
  sin fecha de ingreso; cambio de año).
- Core: función pura de «última por mes».
- SQL (`packages/db/pruebas/0148_*.prueba.sql`): administrador ok, no administrador negado, con
  pago bloqueado, sin motivo negado.

## 4. Fuera de alcance

Pipeline; recalcular automáticamente tras anular; permitir anular con pago (hay que anular el pago
primero).
