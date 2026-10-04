# SPEC corta — Registrar un adelanto tiene que sentirse inmediato

> **Ticket:** imalexandre05/lucebien-tablero#2. **Zona:** spec corta (pantalla). Toca la LECTURA y
> el REFRESCO de `sueldo_movimientos`, que alimenta la liquidación: **no cambia qué se escribe**, ni
> ninguna regla de cálculo, ni el esquema.

## Qué se midió (regla 7: contra el código y la base, no contra el ticket)

- `sueldo_movimientos` en `scilb` (3-oct-2026): **4 filas**, 3 sin liquidar. El listado completo
  sin filtro todavía no pesa; va a pesar a medida que se acumulen meses, pero hoy no es la causa.
- No hay proyecto visible en Vercel desde la integración, así que no hay logs de tiempos. El
  razonamiento queda escrito abajo en vez de una medición.
- `getSesion()` y `directorio()` ya están envueltos en `cache()` de React: dentro de un mismo render
  se resuelven una sola vez (el ticket sugería lo contrario; verificado en `lib/auth.ts` y
  `lib/directorio.ts`).

## La causa: dos renders completos por alta

`accionCrearMovimiento` llama `revalidatePath('/sueldos/movimientos')`. En Next 14.2, cualquier
`revalidatePath` dentro de una Server Action marca `pathWasRevalidated` y la respuesta de la acción
**ya trae el árbol nuevo de la página actual** (`next/dist/server/app-render/action-handler.js`,
`skipFlight: !pathWasRevalidated`). Después el cliente hacía `router.refresh()`, que pide **otro**
render completo de una página `force-dynamic`.

Cada render son, en serie desde el navegador: `auth.getUser()` (ida a Supabase Auth) → 2 selects de
la sesión → `app_directorio` + `sueldo_movimientos`. La acción en sí suma otro `getUser()` + 2
selects + el insert. Con el `router.refresh()` la persona espera ≈ dos rondas completas, y recién
ahí el botón deja de girar y la fila aparece.

Además, la acción no revalidaba la ficha `/personal/[id]/movimientos`, que monta el mismo
componente: ahí sólo se refrescaba gracias al `router.refresh()`.

## Qué cambia

1. **Sin doble refresco.** El cliente deja de llamar `router.refresh()` tras crear o borrar: el
   árbol nuevo llega en la misma respuesta de la acción.
2. **La ficha también se revalida.** Las dos acciones revalidan `/sueldos/movimientos` y
   `/personal/[id]` (como `layout`, para cubrir la ficha y sus secciones). Como cualquier
   revalidación hace que la respuesta traiga la página actual, la ficha se actualiza en su sitio.
3. **Actualización optimista.** Al tocar «Registrar», la fila aparece al instante arriba de la
   tabla con la marca «guardando…» y el formulario se limpia. Cuando llega el árbol del servidor la
   fila provisoria se reemplaza por la real. Si la acción falla, la fila provisoria se quita, el
   formulario recupera lo que se había tipeado y se muestra el error. Borrar oculta la fila al
   instante y la restituye si la base corta (p. ej. `CONGELADA`).
   - **Regla: se restaura sólo lo que se sabe que no se escribió.** La acción marca
     `escrito: false` en los rechazos que corta ANTES de intentar el insert o el delete (sin
     permiso, motivo vacío, las validaciones de `validarMovimiento`). Sólo con esa marca lo
     tipeado vuelve al formulario.
   - **Todo otro fallo es incierto:** un corte de transporte (la promesa rechaza) o un `ok:false`
     que viene de Supabase después de intentar escribir (supabase-js devuelve `{error}` sin lanzar
     ante un `fetch failed` o un timeout servidor→base; el insert pudo hacerse y perderse sólo la
     respuesta). Se quita lo optimista, **no** se devuelve lo tipeado (un segundo clic crearía un
     segundo adelanto, descontado dos veces), se pide la lista real con `router.refresh()` y el
     mensaje avisa que puede haberse guardado y que revise la lista antes de volver a registrar.
   - Si el insert salió y lo que falla es la revalidación, la acción responde `ok: true` igual.
   - Lo tipeado vuelve al formulario sólo si la persona no tocó nada desde que registró: campos
     limpios y la misma persona, fecha y tipo.
   - Si la acción responde `ok`, nunca se deshace ni se devuelve al formulario.
4. **Listado acotado en `/sueldos/movimientos`.** Se muestra el período elegido con la barra de
   período (default: mes calendario en curso, `lib/periodo.ts`) **más todo lo que siga sin
   liquidar**, sea del mes que sea. Lo sin liquidar es lo que va a entrar en el próximo pago: no se
   esconde en silencio por cambiar de período (mismo criterio que la cola de ventas sin vendedor).
   Para ver lo ya liquidado de meses anteriores se cambia el período en la barra («ver más»).
   El subtítulo `N movimiento(s) sin liquidar` sigue siendo global.

## Qué NO cambia

- `crearMovimiento` / `eliminarMovimiento`: mismo insert, mismo delete, mismas validaciones.
- Las comprobaciones de rol de las acciones y las policies de la 0072.
- La liquidación lee sus movimientos por su cuenta (por rango, en el motor); `listarMovimientos`
  sólo lo usan las dos pantallas.
- Sin migración.

## Cómo se prueba

- Test de `listarMovimientos` con el filtro nuevo (`incluirSinLiquidar`): arma el `or` correcto y
  sin él la consulta es la de siempre.
- Manual: registrar un adelanto en `/sueldos/movimientos` y en `/personal/[id]/movimientos`; la
  fila aparece al instante y queda tras la respuesta; un error (motivo vacío forzado, o borrar una
  fila liquidada) restituye el estado.
