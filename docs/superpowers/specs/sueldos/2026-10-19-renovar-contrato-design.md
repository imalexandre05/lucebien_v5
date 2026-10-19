# SPEC — Renovar contrato

> Spec completa (esquema, estados y permisos del contrato) · sesión 8A · 19-oct-2026 · migración **0170**.
> Decisión del dueño n.º 3 (19-oct-2026), tablero #21.

## 1. Lo que decidió el dueño

> Botón «Renovar» en la ficha/contrato que crea el contrato nuevo **en borrador** (copiando tarifa,
> horario, frecuencia) y se **activa solo al día siguiente del fin del actual**. Nunca dos contratos
> vigentes a la vez. Jordan puede editarlo antes de que empiece.

## 2. Qué hay hoy (verificado en el código)

- Estados del contrato: `borrador`, `vigente`, `liquidado` (0072). `liquidado` lo pone el cierre del
  último pago del contrato (0121), no una pantalla.
- La base impide que dos contratos de una persona se pisen en fechas (`sueldo_acuerdos_sin_solape`).
- `sueldo_acuerdo_guardar` (0167) crea el contrato y su horario en una sola transacción.
- Un borrador se edita libremente desde la pantalla de contratos.

## 3. Qué se agrega

**Columna:** `sueldo_acuerdos.renueva_a uuid` (nula): de qué contrato viene una renovación. Sirve para
distinguir una renovación automática de un borrador que alguien dejó a medias (ese nunca se activa solo).

**RPC `sueldo_acuerdo_renovar(p_acuerdo)`** (solo administrador): crea el contrato nuevo con
`sueldo_acuerdo_guardar`, copiando persona, frecuencia (`modalidad`, `cada_dias`), cuota o tarifa por
hora, escala, almuerzo, parámetros del contrato y todo el horario. Queda en `borrador`, con `renueva_a`.

- **Inicio:** el día siguiente al fin del actual.
- **Fin (default inventado, editable):** si el actual dura meses completos, los mismos meses
  (1-oct a 31-oct → 1-nov a 30-nov); si no, los mismos días.
- **Se rechaza** si el contrato de origen es un borrador, o si la persona ya tiene un contrato que
  empieza después de su fin (ya está renovado). Un solo borrador de renovación por contrato.
- **Copia la frecuencia y la cuota o tarifa VIGENTES al final del contrato**, no las del primer día: si
  tuvo un cambio de frecuencia (0120/0121), se toma el último con `desde <= fecha_fin`. Si no, las del
  contrato. (Hallazgo del verificador: copiar las del primer día pagaba de menos tras un cambio.)
- No copia: el historial de cambios, liquidaciones, movimientos ni marcas de asistencia.

**Activación `sueldo_renovaciones_activar(p_hoy)`** (cron diario, hora Perú): pasa a `vigente` el
borrador con `renueva_a` cuyo inicio ya llegó, **solo si la persona no tiene otro contrato vigente**.
Mientras el contrato anterior siga vigente (porque falta cerrar su último pago), la renovación espera:
nunca hay dos vigentes. Un borrador sin `renueva_a` nunca se activa solo.

## 4. Pantalla

Botón «Renovar» en la pestaña Contrato de la ficha (y en la lista de contratos) sobre el contrato
vigente. Al pulsarlo se crea el borrador y se muestra: «Listo: el contrato nuevo empieza el
01/11/2026. Puedes cambiarlo hasta entonces.» con un enlace al borrador. Si ya está renovado, el botón
dice «Ya renovado» y lleva al borrador.

## 5. Casos que debe cubrir la prueba

1. Renovar copia tarifa/cuota, frecuencia, escala, almuerzo, parámetros y todo el horario; queda en borrador con `renueva_a`.
2. Fechas: meses completos → mismos meses; no completos → mismos días.
3. Renovar dos veces el mismo contrato se rechaza.
4. Un no administrador no puede renovar. Un borrador no se renueva.
5. Activación: antes del inicio no hace nada; con el anterior aún vigente espera; con el anterior liquidado pasa a vigente. Nunca dos vigentes.
6. Un borrador sin `renueva_a` no se activa solo.
7. El administrador puede editar el borrador antes de que empiece.
8. Con un cambio de frecuencia/cuota dentro del contrato, el borrador sale con lo vigente al final (no con lo del primer día).
