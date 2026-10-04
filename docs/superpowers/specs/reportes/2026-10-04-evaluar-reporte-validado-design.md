# `reportes_evaluar` valida lo que recibe — spec corta

**Ticket:** imalexandre05/lucebien-tablero#38, sólo el ítem `reportes_evaluar`.
**Zona:** cadena del sueldo (la nota del reporte alimenta puntos → evaluación → pago). Spec completa.
**Fecha:** 2026-10-04.

## Estado verificado (regla 7)

Última definición: `packages/db/migrations/0081_reportes_escritura_directa.sql:158-198`
(ninguna migración posterior la redefine). Hoy la función:

- escribe `(c->>'cal')::numeric` sin mirar el rango: se puede guardar 5, -3 o 1000;
- no mira `evaluado` ni `no_evaluable`: una segunda llamada reescribe la nota ya puesta;
- sólo actualiza las actividades que vienen en la llamada. Las omitidas conservan `calificacion` en
  `NULL`; las fórmulas de 0095 (`where a.calificacion is not null`, `sum(calificacion)`) las
  ignoran, pero `puntaje_eval` divide por `sum(peso)` de **todas** las filas, así que la omitida
  cuenta como 0 en el puntaje del reporte y como «no calificada» en los puntos: las dos cadenas
  quedan inconsistentes entre sí;
- la UI (`apps/erp-web/app/reportes/[id]/acciones.tsx`) inicia cada actividad y cada zona en
  `?? 1` (aprobada) y envía `cal[a.cod] ?? 1`: lo que el evaluador no tocó se guarda como aprobado.

## Reglas nuevas

1. **Rango.** Cada `cal` debe ser un número en [0, 1]. Fuera de rango, ausente o no numérico →
   `raise exception 'DATO: calificación fuera de rango'`. Nada se escribe (la excepción revierte).
2. **Una sola evaluación.** Si `evaluado` o `no_evaluable` → `raise exception 'ESTADO: el reporte
   ya fue evaluado'`. Reabrir una evaluación es otra funcionalidad, fuera de alcance. El chequeo se
   hace con `select ... for update` para que dos evaluadores simultáneos no se pisen.
3. **Las omitidas no cuentan como aprobadas: se exige que vengan todas.** Opción elegida frente a
   «guardarlas como no calificadas»: esa dejaría el puntaje del reporte en 0 para la omitida y los
   puntos sin ella (la inconsistencia de arriba). Exigir todas no cambia la fórmula de 0095 ni el
   `puntaje_eval` de ningún reporte bien evaluado, porque la UI ya envía todas las actividades y
   zonas. Concretamente: el conjunto de `cod` de la llamada debe ser exactamente el de
   `reporte_actividades` del reporte; faltante, sobrante o repetido →
   `raise exception 'DATO: las calificaciones no coinciden con las actividades del reporte'`.
   Un reporte sin actividades se acepta con arreglo vacío (comportamiento actual).
4. **UI.** El valor inicial deja de ser `?? 1`: sin marcar, la actividad/zona queda «sin calificar»,
   el botón Enviar permanece deshabilitado con un contador de pendientes, y el puntaje en pantalla
   no cuenta las pendientes. Los botones «Todo» siguen marcando masivamente, pero es una acción
   explícita. Cada estado (aprobar/observar/rechazar) sigue siendo 1 / 0.5 / 0.

## Sin cambios

Pesos, fórmula de `puntaje_eval`, fórmula de puntos de 0095, guard de sede, regla del evaluador
externo, grants. Fuera de alcance: `reportes_crear`, extras, atomicidad del envío.

## Pruebas (antes del código)

Prueba SQL en `packages/db/pruebas/` corrida en Postgres local: rango (>1, <0, null, texto),
doble evaluación, no_evaluable, omitida, sobrante, repetida, y caso feliz con el mismo puntaje que
da la 0081 para el mismo juego de calificaciones.

## Parámetros inventados

Ninguno: las tres reglas son de integridad de datos, no de negocio.
