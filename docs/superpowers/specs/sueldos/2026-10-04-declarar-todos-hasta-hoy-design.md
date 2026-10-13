# SPEC — «Declarar todos como trabajados» sólo hasta hoy

> **Zona de rigor:** cadena del sueldo (no-negociable 1). Spec corta + test de la función que filtra.
> **Origen:** ticket imalexandre05/lucebien-tablero#31.

## 1. Lo que pasa hoy (verificado en código)

- `apps/erp-web/app/sueldos/asistencia/cliente.tsx`: `sinDeclarar` toma **todos** los días
  contratados del periodo sin declarar, incluidos los futuros. El contador, el texto del botón
  («Declarar los N como trabajados») y `hacerDeclararTodos` usan esa lista.
- `actions.ts` → `accionDeclararVarios(dias)` sólo comprueba el rol y llama `declararDia` por cada
  elemento que mande el cliente. No valida fechas.
- Lo declarado a mano es dato humano y el huellero ya no lo pisa (migraciones 0084/0097): una falta
  en un día futuro se pagaría como trabajada.
- `/personal/[id]/asistencias` reutiliza el mismo componente, así que el defecto está en ambas pantallas.

## 2. Cambio

1. Función pura en `packages/core/src/sueldos.ts`: `soloHastaHoy(items, hoy)` → conserva los
   elementos con `fecha <= hoy` (el día de hoy **entra**, mañana **no**). Recibe `hoy` desde quien
   invoca (no-negociable 4: el core no llama `new Date()`); valida el formato de ambas fechas.
2. Cliente: la acción masiva (contador, texto del botón, diálogo y lista enviada) usa sólo los días
   `<= hoyPeru()`. Texto: «Declarar los N días hasta hoy». `hoyPeru()` (`lib/fechas.ts`, zona `America/Lima` vía `Intl`, independiente de la TZ del navegador) se llama
   en el cliente; el cambio queda local al componente.
3. Servidor: `accionDeclararVarios` aplica el mismo filtro con `hoyPeru()` del servidor y descarta
   los días futuros aunque el cliente los mande.
4. Sin cambios: declarar un día futuro uno por uno (`accionDeclararDia`) sigue permitido. No se
   inventa regla nueva. Sin cambios de base ni de migraciones.

## 3. Pruebas

`packages/core/src/sueldos.test.ts`: hoy incluido, mañana excluido, ayer incluido, lista vacía,
fecha inválida lanza error, no muta la entrada.

## 4. Ajuste tras la verificación

- Si el servidor descarta días (reloj del dispositivo adelantado respecto del servidor), no responde
  `ok` en silencio: lo informa en `error` para que el administrador sepa que esos días siguen sin declarar.
- Una fecha mal formada en la lista no tumba la acción entera: se responde `{ ok: false, error }` sin declarar nada.
- Decisión abierta para Alexander: «hoy» entra en la acción masiva aunque la jornada no haya terminado.
