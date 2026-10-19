# SPEC — Reportes de tienda que se envían solos

> Spec completa (alimenta la evaluación /20) · sesión 10B · 19-oct-2026 · migración **0184**.
> Decisión del dueño: al llegar la hora límite del turno, el reporte se envía con lo que haya; antes
> hay recordatorios en la campana. Reemplaza el «no enviado» del auto-cierre (0052/0081).

## 1. Qué decidió el dueño

- A la **hora límite del turno**, el reporte de actividades se envía solo con una «foto» de todo lo
  marcado hasta ese momento, para saber al final del período cuántos reportes debía enviar cada
  persona y cuántos envió.
- Antes de la hora límite hay **recordatorios** en la campana (p. ej. 30 y 10 min antes). Editable.
- La **hora límite** es editable por el administrador, por turno y por sede.
- Los reportes automáticos quedan marcados **«enviado automáticamente»** y a nombre del **encargado del turno**.

## 2. Qué hay hoy (verificado en el código)

- `reportes_auto_cierre(text[])` (0081) existe pero su cron está **desprogramado** (0081, bloque final):
  dejaba cascarones vacíos por 4 sedes × 3 turnos cada noche. Si hay borrador con contenido deja el
  reporte en `estado_envio = 'no_enviado'`, `auto_enviado = true`.
- Hora límite global en `config`: `turno_m_cierre` (15:00), `turno_t_cierre` y `turno_c_cierre` (23:00).
- Borrador: `reporte_drafts` (sede, fecha, turno, encargado, payload). Hay exclusividad de turno (C vs M/T).
- No existe tabla de horarios por persona: **no se puede saber quién «debía» reportar sin borrador**.

## 3. Qué cambia

**3.1 Se actúa solo sobre turnos con borrador del día.** Sin borrador no se crea nada (no vuelven los
cascarones). Esto es un default: anotado en `docs/pendientes-negocio.md` hasta que exista el sistema de horarios.

**3.2 Envío automático** (`reportes_auto_enviar()`, security definer, solo `service_role`): para cada
borrador de hoy (hora Perú) cuyo turno ya pasó su hora límite y sin reporte real del turno:
- crea el reporte con `estado_envio = 'enviado'`, `auto_enviado = true`,
  `auto_enviado_razon = 'auto-envio-hora-limite'`, `encargado_id` = el del borrador (el encargado que ingresó su código); si el borrador no lo trae, el encargado
  de tienda activo de esa sede (el de menor código, si hubiera varios); si tampoco hay, queda sin encargado;
- copia trabajadores, actividades marcadas, limpieza y extras igual que el cierre actual
  (el encargado queda también como trabajador);
- borra el borrador; es idempotente (el id es `DD-MM-YY_TURNO-SEDE`).
Si el borrador no tiene encargado ni contenido, no se crea reporte y el borrador se borra.
El **puntaje no se toca**: nace sin evaluar (`puntaje 0`, `evaluado false`), igual que un envío manual;
lo evalúa SOLO el administrador (0183), como cualquier reporte. Esta spec no cambia fórmula alguna de puntos ni sueldo.

**3.3 Recordatorios** (`reportes_recordar()`): por cada borrador de hoy sin reporte, y por cada minuto
`m` de `reporte_recordatorios_min` (default `30,10`), cuando falta `<= m` min y todavía no pasó la hora,
inserta una notificación a la sede (`destinatario_sede`, rol encargado, tipo `reporte_por_vencer`) con
`dedup_key = 'rec-reporte:<sede>:<turno>:<fecha>:<m>'`: una sola por minuto-umbral, sin duplicar.

**3.4 Hora límite por sede.** Tabla `reporte_hora_limite (sede_cod, turno, hora)`. Se usa la de la
sede si existe; si no, la global de `config`. Solo el administrador escribe, vía
`reporte_hora_limite_guardar(sede, turno, hora)` (guard adentro; `hora` nula borra el ajuste). Todos
los autenticados leen (la pantalla la muestra). Se audita con el trigger genérico de `audit_log` (tabla con `id`).

**3.5 pg_cron.** Un solo job `reportes-auto-enviar`, cada 5 min, llama a ambas funciones. Se agenda con
`cron.unschedule` envuelto + `cron.schedule`: reaplicar la migración no duplica. Los tres jobs viejos
siguen desprogramados. **El job queda activo al aplicar la migración**: la reactivación del cron que el
CLAUDE.md protegía queda autorizada por esta decisión del dueño, con la salvaguarda de 3.1.

**3.6 Reloj.** Ambas funciones reciben `p_ahora timestamptz default now()` (el core nunca llama al reloj; las pruebas lo fijan).

## 4. Aislamiento

Sin cambios: ninguna lectura nueva de sueldo/nota. Las notificaciones usan la RLS existente (`notif_sel`).

## 5. Pantalla

En `/configuracion` (sección «Reportes de turno»): parámetro `reporte_recordatorios_min` y una tarjeta
«Hora límite por sede» con una tabla sede × turno editable. Los reportes automáticos se ven con la
etiqueta «Enviado automáticamente»; ya no «No enviado».

## 6. Pruebas (`0184_reportes_auto_envio.prueba.sql`)

1. Borrador con contenido, pasada la hora → 1 reporte `enviado`+`auto_enviado`, a nombre del encargado, borrador borrado.
2. Antes de la hora → no crea nada. 3. Segunda corrida → idempotente. 4. Sin borrador → nada.
5. Hora de la sede distinta de la global → manda la de la sede. 6. Recordatorio a 30 y 10 min, sin duplicar.
7. Un no-admin no puede guardar la hora; un admin sí, y queda auditado. 8. `anon`/`authenticated` no ejecutan las funciones automáticas.
