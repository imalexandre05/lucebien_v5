# Pendientes de negocio

Parámetros que el código necesitaba para funcionar pero que **nadie confirmó como regla de
negocio real**. Se sembraron con un default explícito (marcado como tal en el comentario de la
migración correspondiente) y quedan editables desde `/configuracion` sin volver a migrar. Este
documento es la lista de qué falta confirmar con el dueño — no se inventa nada nuevo aquí, solo
se registra.

## Fase 4 — Reportes de actividad: acceso, turnos y "no enviado"

- **Horas de cierre de turno** (`config.turno_m_cierre`, `turno_t_cierre`, `turno_c_cierre`,
  migración `0052`): sembradas en `15:00` / `23:00` / `23:00` — el MISMO valor que ya estaba
  hardcodeado en `packages/db/migrations/0021_reportes_auto_cierre.sql` (`v_hora < 15` /
  `v_hora < 23`) y en el cron de `0022`. No es una hora confirmada por el dueño, es el default
  heredado del sistema anterior. Pendiente: confirmar si 15:00/23:00 son las horas reales de
  cierre de cada turno en las 4 sedes, o si varían por sede/temporada.
- **Bloqueo por evaluación pendiente** (tarea 2 del plan): la regla implementada es "no se puede
  crear un reporte nuevo en una sede si el reporte anterior de esa sede (cualquier turno/fecha)
  sigue sin evaluar". No estaba escrita en ningún lado antes de este plan; se implementó tal cual
  la describe el plan, sin margen de días ni excepciones. Si en la práctica hace falta un margen
  (p. ej. permitir 1 turno de gracia), es una regla nueva a confirmar.

---

_Agregar aquí, por fase, cualquier parámetro nuevo que se sembró con un default sin confirmar._
