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

1. **Permiso.** `accionCrearIncidencia` exige `puede(matriz, rol, 'incidencias', 'crear', rolCod)`
   (decisión del dueño, 18-oct: `ver` es solo lectura). Quien no lo tiene recibe «No tienes permiso
   para registrar incidencias.» Los operativos, que solo tienen `ver` (0065), siguen registrando
   desde su reporte de turno, que no pasa por esta acción. El permiso `crear` se otorga desde
   Configuración → Permisos.
2. **Puntos desde el catálogo.** Función pura `resolverIncidencia(tipos, tipo, nivel)`
   (`lib/incidencias-catalogo.ts`): el tipo debe existir en `incidencia_tipos` (activo); los puntos
   son siempre `puntosDefault` del catálogo; el nivel es el enviado solo si es `Bajo`, `Medio` o
   `Alto`, y si no, el `nivelDefault` del tipo. Un tipo desconocido se rechaza con «Ese tipo de
   incidencia no existe o está desactivado.»
3. Se aplica en las dos entradas: la acción de `/incidencias` y la de reportes (antes de crear el
   reporte, para que no quede nada a medio guardar). El valor `puntosPenalidad` que manda el
   navegador se ignora.

No cambia ningún parámetro de negocio: los puntos ya eran editables por tipo en `/configuracion`.

## Addendum (verificador, 18-oct-2026): la base también cierra la puerta

La policy `inc_insert` (0046) deja insertar cualquier `puntos_penalidad` a quien llame directo a
PostgREST (cualquier usuario de la sede, o quien cumpla `app_es_almacen()`). Cerrar solo la acción del
servidor no basta. **Migración 0150:** trigger `before insert` sobre `incidencias` que, para quien no
es administrador, fija `puntos_penalidad` al `puntos_default` del tipo activo y rechaza un tipo que no
exista. El administrador conserva su valor (carga manual o corrección). No se cambia la policy: se
evita romper el reporte de turno de los operativos. 

## Responsable validado (hallazgo del verificador)
El `responsable_id` debe ser una persona activa de la sede de la incidencia (su `sede_cod` o una
sede de `empleado_tiendas`). Se comprueba en las dos entradas con `responsableValido()`. Sin
responsable (null) sigue permitido.
