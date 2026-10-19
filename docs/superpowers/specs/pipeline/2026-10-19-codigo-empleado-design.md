# Código de empleado como código del operador (spec corta)

**Decisión del dueño (19-oct-2026), textual:** «el código de empleado (`empleados.cod`, 4 dígitos,
p. ej. 8686) es el código del operador para pipeline y reportes; entiendo que no es secreto».

Hoy `codigo_siempre = true` pero nadie tiene PIN (`codigo_pines` vacía), así que nadie puede
identificarse. Esta spec reemplaza el PIN por el código de empleado, sin tocar el resto del circuito
(rate limit, token de operador, atribución de puntos).

## Reglas
1. Parámetro `codigo_modo` (`/configuracion`, «Código personal»), valores `cod` | `pin`. Default
   **`cod`** (fijado por el dueño). Con `pin` todo vuelve a ser como en la 0177.
2. En modo `cod`, `pipeline_validar_codigo(p_usuario, p_pin, p_device)` recibe el código de empleado
   en `p_pin`; `p_usuario` puede venir vacío y se ignora. Busca empleados **activos**, que no sean
   cuenta compartida, con `cod = btrim(p_pin)`. Debe haber **exactamente uno**.
3. Mismo circuito de hoy: bloqueo por intentos fallidos (sesión, `codigo_max_intentos` en
   `codigo_ventana_intentos_min`), notificación al admin al bloquear, y token de operador de
   `codigo_operador_min` minutos (5) que renueva cada acción. Los puntos y movimientos quedan a
   nombre del dueño del token (`private.actor_pipeline`, no cambia).
4. Respuestas: acierto `{ok, token, nombre, expira_en, ventana_min}`; fallo
   `{ok:false, motivo:'codigo_no_encontrado', intentos_restantes}`; código repetido (dos
   empleados activos con el mismo `cod`) `{ok:false, motivo:'codigo_repetido'}` sin emitir token;
   bloqueo `{ok:false, bloqueado_min}`. Todo fallo cuenta como intento.
5. `codigo_exigir_admin` pasa a **`true`**: el administrador también pone su código (decisión del
   dueño, editable). La migración lo actualiza aunque ya exista la fila.
6. Pantalla (pipeline, registrar, envíos, lavandería y «Enviar reporte»): campo siempre visible
   «Tu código» (numérico, botón «Entrar»). Al validar: «Operando: <nombre> · se cierra en m:ss» y
   «Cambiar operador». En modo `cod` no se pide usuario. La pantalla consulta el modo con
   `public.codigo_modo()`; si la función no existe se comporta como `pin`.
7. En «Enviar reporte» con código, el encargado es el dueño del código (la base ya lo exige,
   `reportes_crear`); el selector de encargado del admin deja de ofrecerse.

## Casos de prueba
- Código correcto, modo `cod`, `p_usuario` vacío → ok, token, nombre; el token resuelve al dueño.
- Código inexistente → `codigo_no_encontrado`; con 5 fallos → `bloqueado_min` aunque el siguiente sea correcto.
- Empleado suspendido o cuenta compartida → `codigo_no_encontrado`.
- Dos activos con el mismo `cod` → `codigo_repetido`, sin token.
- Modo `pin` → el código de empleado ya no sirve como PIN; usuario + PIN siguen funcionando.
- Admin: `codigo_exigir_admin` queda en `true` tras la migración.
- Idempotencia: reaplicar no rompe ni pisa un `codigo_modo` ya editado.

## Riesgo aceptado por el dueño
El código de 4 dígitos no es secreto: quien lo conozca puede operar a nombre de otra persona.
Mitigaciones que quedan: bloqueo por intentos de sesión (adivinar 10 000 códigos es inviable),
token de 5 min, y rastro en `codigo_intentos` y en el historial de cada prenda.

## Defaults inventados
`codigo_modo = cod` y `codigo_exigir_admin = true` los fijó el dueño; se anotan en
`docs/pendientes-negocio.md`.
