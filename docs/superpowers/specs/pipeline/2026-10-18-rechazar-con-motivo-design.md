# Rechazar con motivo obligatorio (lucebien-tablero #39, bloque «Rechazar»)

Sesión 5A · Zona crítica (puntos y no-negociable 2) · Migración 0154

## Problema
Rechazar en control de calidad quita todos los puntos del trabajo (0140) pero no pide motivo y
`prenda_pasada.obs_calidad` nunca se escribe: nadie puede explicar después por qué se perdieron
los puntos. (La validación de etapa y el doble rechazo ya los cerró la 0122/0140.)

## Reglas
1. **R1 — Motivo obligatorio.** `pipeline_rechazar` recibe `p_motivo text` y lo exige: sin texto
   (vacío o solo espacios) o de menos de 3 letras → `MOTIVO:` y no se escribe nada. Decisión de la
   sesión 5A: mínimo 3 caracteres, para evitar «.»; el límite superior es 500.
2. **R2 — Se guarda.** El motivo queda en `prenda_pasada.obs_calidad` y en la observación del
   historial («Rechazado → lavado: <motivo>»), con el actor del código personal (0112).
3. **R3 — Firma.** `pipeline_rechazar(p_id, p_destino, p_operador default null, p_motivo default null)`;
   el motivo va al final para no romper las llamadas con el token en tercera posición. Una sola
   firma (sin sobrecargas, 0127); la vieja de tres argumentos se elimina. Un motivo nulo se trata
   como vacío: se rechaza.
4. **R4 — Todo lo demás igual.** Puntos (0140), transición (solo desde control de calidad),
   `for update`, código de movimiento y permisos no cambian.
5. **R5 — Pantalla.** Al elegir «Rechazar» se pide el motivo en un campo de texto (con aviso de qué
   pasa con los puntos); el botón queda desactivado hasta que haya motivo. Un `MOTIVO:` del servidor
   se muestra como aviso, no como pantalla de error.

## Defaults inventados
- Largo mínimo del motivo: 3 caracteres; máximo 500. Fijos en la RPC, a confirmar con Alexander.

## Pruebas (0154_rechazar_motivo.prueba.sql)
1. Sin motivo, vacío, con espacios o de 2 letras → `MOTIVO:` y la prenda sigue en control de calidad.
2. Con motivo válido → rechaza, `obs_calidad` y el historial llevan el motivo, y los puntos se
   descuentan como en la 0140.
3. Con código de operador: el motivo y el culpable no cambian; el actor es el operador.
4. Motivo de más de 500 caracteres → `MOTIVO:`.
5. Una sola firma y sin `execute` para anon.
Las pruebas 0112, 0115, 0122, 0130 y 0140 pasan un motivo en sus llamadas a la RPC.
