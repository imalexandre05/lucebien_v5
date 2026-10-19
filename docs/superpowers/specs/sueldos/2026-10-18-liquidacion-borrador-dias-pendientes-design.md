# SPEC corta — Liquidación como borrador aunque falten días por declarar (6A-4 / tablero #19)

## Estado hoy (verificado)
- `public.sueldo_entrada` (0144) corta con `DATO:falta declarar la asistencia de …` si un día
  contratado del tramo está en `sin_dato`, y con `DATO:hay tramos sin cerrar en …` si un día tiene
  tramos a medias. El core (`liquidarPeriodo`, sueldos.ts) lo repite: «Faltan N día(s) contratado(s)».
- Resultado: no se puede ni ver el cálculo mientras falte un solo día. La razón del corte es válida
  (un día sin cargar NO es una falta: costaría dos días de sueldo), pero no hace falta ocultar todo lo demás.

## Regla nueva
1. **Borrador provisional.** Se puede calcular y guardar un borrador aunque falten días. Cada día
   pendiente **no se castiga ni se compensa** (no es falta, no es tardanza, no suma ni resta horas): el
   sueldo pactado queda sin tocar por ese día, así que el monto es el máximo posible y es
   provisional; la liquidación avisa con una advertencia que nombra los días.
2. **Cerrar sigue exigiendo todo declarado.** El cierre vuelve a leer `sueldo_entrada` en modo
   estricto (0111): con un día pendiente corta con `DATO`, igual que hoy. Nadie paga un sueldo con
   días sin declarar.
3. Pendiente = día contratado en `sin_dato` (sin fila declarada) **o** día con tramos a medias
   (0085). Un día pendiente nunca entra a la asistencia que se manda al motor.

## Diseño
- DB (0160): `public.sueldo_entrada(uuid, date, date, boolean p_permitir_pendientes)`; la de tres
  argumentos queda como envoltorio estricto (`false`), así el cierre y todo lo existente no cambian.
  En modo permisivo agrega `diasSinDeclarar` a la entrada **solo si hay pendientes** (la entrada
  estricta es idéntica a la de hoy: no rompe la comparación del cierre).
- Core: `EntradaLiquidacion.diasSinDeclarar?: string[]`. Un día así, sin registro, se salta;
  `Liquidacion.diasSinDeclarar?` y una advertencia lo devuelven. Sin el campo, el comportamiento es
  idéntico (el test «un día contratado sin registro corta el cálculo» se mantiene).
- App: `calcularPreview` y `crearBorrador` piden el modo permisivo; el cierre no.

## Pruebas (antes del código)
- `packages/core/src/sueldos-pendientes.test.ts`: con días pendientes no lanza, no los paga ni los
  castiga, advierte; sin el campo lanza como antes; un pendiente que sí tiene registro no se salta.
- `packages/db/pruebas/0160_entrada_dias_pendientes.prueba.sql`: estricto corta; permisivo lista los
  días (sin declarar y a medias) y no los incluye en `asistencia`; estricto sin pendientes == permisivo.

## Defaults
Ninguno de negocio nuevo: el pendiente no cuesta ni paga (lo contrario inventaría una falta). Se
anota en `docs/pendientes-negocio.md`.
