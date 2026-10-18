# Incidencias: el servidor valida el permiso y toma los puntos del catálogo

**Ticket:** imalexandre05/lucebien-tablero #26. **Rigor:** spec completa (los puntos de penalidad
descuentan de la nota → sueldo, no-negociable 1). No toca `packages/core` ni ninguna RPC.

## Verificado contra el código (regla 7)

| Hallazgo | Dónde |
|---|---|
| `accionCrearIncidencia` solo comprueba que haya sesión; no mira el permiso `incidencias`. | `apps/erp-web/app/incidencias/actions.ts` |
| `puntosPenalidad` y `nivel` llegan del navegador y se guardan tal cual. | misma acción → `crearIncidencia()` |
| El mismo hueco existe en el reporte de turno: `items[].puntosPenalidad` va directo a `crearIncidenciasDeReporte()`. | `apps/erp-web/app/reportes/actions.ts:105` |
| Los operativos tienen `incidencias:ver` a propósito (0065): registran desde la pantalla o desde su reporte. | `0065_permisos_operativos_eval_incidencias.sql` |

## Cambios

1. **Permiso.** `accionCrearIncidencia` exige `puede(matriz, rol, 'incidencias', 'ver', rolCod)`, el
   mismo permiso que ya pide la pantalla para abrirse. Quien no lo tiene recibe «No tienes permiso
   para registrar incidencias.» Se usa `ver` y no `crear` porque los operativos solo tienen `ver` y
   el dueño pidió que puedan registrar (0065). Pregunta para el dueño en `docs/pendientes-negocio.md`.
2. **Puntos desde el catálogo.** Función pura `resolverIncidencia(tipos, tipo, nivel)`
   (`lib/incidencias-catalogo.ts`): el tipo debe existir en `incidencia_tipos` (activo); los puntos
   son siempre `puntosDefault` del catálogo; el nivel es el enviado solo si es `Bajo`, `Medio` o
   `Alto`, y si no, el `nivelDefault` del tipo. Un tipo desconocido se rechaza con «Ese tipo de
   incidencia no existe o está desactivado.»
3. Se aplica en las dos entradas: la acción de `/incidencias` y la de reportes (antes de crear el
   reporte, para que no quede nada a medio guardar). El valor `puntosPenalidad` que manda el
   navegador se ignora.

No cambia ningún parámetro de negocio: los puntos ya eran editables por tipo en `/configuracion`.
