# Código personal siempre (spec corta)

**Decisión del dueño (19-oct-2026).** Para mover prendas del pipeline y para enviar reportes de turno
se pide **siempre** el código personal, en cualquier PC y cuenta. Hoy sólo se pedía en equipos o
cuentas marcados como «compartidos», y en producción no hay ninguno marcado (0 cuentas, 1 equipo).

## Reglas
1. Parámetro `codigo_siempre` (`/configuracion`, «Código personal»). Default **sí** (`true`).
2. Parámetro `codigo_exigir_admin`. Default **no**: el administrador que entró con su usuario puede
   mover prendas y enviar reportes sin código. Si se enciende, el admin también lo da.
3. La base lo valida (no la pantalla): `private.actor_pipeline` rechaza con `CODIGO:` toda llamada
   sin token cuando la regla aplica. Cubre las RPC del pipeline y `reportes_crear`.
4. `pipeline_validar_codigo` deja de exigir equipo compartido cuando `codigo_siempre` está en sí
   (si está en no, todo vuelve a ser como antes).
5. Los puntos y movimientos quedan a nombre del dueño del código (ya lo hace el token).
6. Sesión de 5 min con cuenta regresiva y «Cambiar operador / Salir»: no cambia.

## Casos de prueba
- Cuenta personal, sin token, `codigo_siempre` sí → `CODIGO:`.
- Cuenta personal, con token propio → pasa y el actor es el dueño del token.
- Admin sin token, `codigo_exigir_admin` no → pasa; con `codigo_exigir_admin` sí → `CODIGO:`.
- `codigo_siempre` no → comportamiento anterior (sólo cuenta compartida).
- `pipeline_validar_codigo` acepta un PIN correcto desde un equipo no compartido si `codigo_siempre` sí.

## Defaults inventados
`codigo_siempre = true` y `codigo_exigir_admin = false` los fijó el dueño; se anotan en
`docs/pendientes-negocio.md`.
