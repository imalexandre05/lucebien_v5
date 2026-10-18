# Operador en PC compartida: sesión corta con código personal

Sesión 5A · Zona crítica (no-negociable 2 y 3) · Migración 0145 · Corrige lo pedido en el PR #70

## Problema
Varias personas usan la misma PC. El código personal (0112) y el token de operador ya existen y
las RPC del pipeline ya lo validan en el servidor (`private.actor_pipeline`). Lo que no cumple lo
que pidió el dueño:
- La ventana de inactividad por defecto es 10 min; el dueño pidió 5.
- El operador vive en el estado de cada pantalla: al pasar de Kanban a Registrar o a Envíos se
  pierde y el código se pide otra vez.
- El chip no dice cuánto falta para que se cierre, y el botón dice «cambiar», poco claro.

## Reglas
1. **R1 — Se reusa lo existente.** Equipo marcado como compartido en `/dispositivos`, usuario + PIN
   (`pipeline_validar_codigo`), token en `codigo_operadores`, `actor_pipeline` en cada RPC. No se
   crea otro mecanismo.
2. **R2 — Ventana de 5 minutos por defecto.** `config.codigo_operador_min`: si la fila tiene el
   valor provisional «10» (nadie lo cambió) pasa a «5»; si el administrador ya puso otro, no se
   toca. Sigue editable en `/configuracion`. El default de pantalla también baja a 5.
3. **R3 — Una sola sesión por pestaña.** El operador se guarda en un almacén de módulo (memoria de
   la pestaña, nunca localStorage ni cookie): sobrevive a la navegación entre pantallas del ERP y
   se pierde al recargar o cerrar la pestaña. El código se pide una vez, no en cada formulario.
4. **R4 — Siempre se ve quién opera.** Chip: «Operando: Leonel · se cierra en 4:12», con cuenta
   regresiva por segundo, y botón «Cambiar operador / Salir» (revoca el token en la base). Sin
   operador: «Nadie operando» + «Ingresar código».
5. **R5 — El servidor manda.** Sin token válido en un equipo compartido la acción se rechaza con
   `CODIGO:` (server action + RPC). Los movimientos y puntos quedan a nombre del dueño del token.

## Defaults inventados (editables, anotados en pendientes-negocio.md)
- `codigo_operador_min` = 5 (lo pidió el dueño; el resto de parámetros del código no cambia).

## Pruebas
- SQL `0145_operador_5_min.prueba.sql`: fila 10 → 5; fila ya personalizada (7) no se toca; fila
  ausente se crea en 5; un token nuevo vence a los 5 min; reaplicar es inocuo.
- TS `operador-activo.test.ts`: default 5; `formatoCuentaRegresiva` (4:12, 0:00, redondeo hacia
  arriba, negativos).
