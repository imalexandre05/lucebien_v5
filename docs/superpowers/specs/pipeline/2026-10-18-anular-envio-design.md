# Anular un envío equivocado (lucebien-tablero #39, bloque «Envíos»)

Sesión 5A · Zona crítica (no-negociable 2) · Migración 0156

## Problema
Un envío a tienda equivocado (prenda mal elegida o tienda mal elegida) no se puede corregir: la
prenda queda en `enviado` hasta que la tienda la acepte u observe.

## Reglas
1. **R1 — `pipeline_anular_envio(p_id, p_motivo, p_operador default null)`** (por prenda; cada prenda
   tiene su propio envío). Solo si la prenda sigue en `enviado` (la tienda aún no la calificó): vuelve a
   `listo`, `envio_id = null`, queda `aprobada`. Otra etapa → `TRANSICION:`.
2. **R2 — Quién.** Solo quien tiene acceso a la prenda por su sede de origen (almacén/admin o la sede
   de origen), igual que el resto del pipeline. La tienda destino **no** puede anular.
3. **R3 — Motivo obligatorio** (3 a 500 letras, mismo criterio que rechazar, 0154) → `MOTIVO:`.
4. **R4 — Rastro.** El envío no se borra: `envios_prendas.estado = 'anulado'`. El historial de la
   prenda anota «Envío <id> anulado: <motivo>» con el actor del código personal (0112). No hay puntos
   en un envío, así que ningún punto cambia.
5. **R5 — Activo.** Si el activo ligado quedó `disponible` por el envío, vuelve a `en_pipeline`
   (la prenda está de nuevo en el taller); si ya tiene otro estado no se toca.
6. **R6 — Pantalla.** En la columna «Enviadas» del tablero cada prenda tiene «Anular envío», que pide
   el motivo y queda desactivado sin él.
7. `pipeline_deshacer` no puede deshacer un envío (ya era así); esta es la vía.

## Defaults inventados
- Largo del motivo 3–500 (igual que 0154).

## Pruebas (0156_anular_envio.prueba.sql)
1. Anular una prenda `enviado` con motivo → `listo`, sin `envio_id`, envío `anulado`, historial con el motivo.
2. Sin motivo / motivo corto → `MOTIVO:`; nada cambia.
3. Prenda ya `recibido` (o en otra etapa) → `TRANSICION:`; nada cambia.
4. La tienda destino no puede anular → "Prenda no encontrada"; sigue `enviado`.
5. El activo `disponible` vuelve a `en_pipeline`; uno `alquilado` no se toca.
6. Cuenta compartida sin token → `CODIGO:`. Una firma y sin anon.
7. Tras anular se puede volver a enviar a otra tienda con `pipeline_enviar`.
