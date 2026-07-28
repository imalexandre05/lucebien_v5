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

## Fase 5 — Reportes de actividad II: layout de limpieza y extras

- **Dos catálogos de extras distintos, ninguno tocado.** El plan pedía portar el catálogo de 17
  extras de `database/seed.js:20-38` (códigos `XR01`/`XR02`/`XP01`..`XP15`) a `actividades_config`
  porque "hoy no hay ningún catálogo EXT". Al verificar contra la base real (`scilb`) antes de
  escribir la migración `0053`, resultó que **ya existe un catálogo EXT sembrado** — 17 filas en
  `LB`/`ST`/`TR` y 11 en `AL`, con códigos `XTR02`..`XTR18` — que **no viene de ningún archivo de
  este repo** (no está en ninguna migración ni en `seed.js`; probablemente se cargó a mano por
  SQL directo o en la migración inicial de datos del sistema viejo, antes de que este repo la
  trackeara). Sus valores **no coinciden** con `seed.js`: por ejemplo "Confección de michis" es
  `XR02` remunerada (S/ 3, 0 pts) en `seed.js`, pero `XTR02` por puntos (10 pts) en la base viva.
  `AL` además tiene un subconjunto de 11 (no los 17), que parece deliberado (el almacén no hace
  ciertos arreglos de sastrería) y no un catálogo incompleto.
  - **Decisión tomada:** no sembrar el catálogo de `seed.js` encima (crearía un catálogo
    duplicado y confuso — dos botones "Confección de michis" con puntajes distintos). La
    migración `0053` deja el schema (`reporte_extras.cod/peso_unitario/revisar/puntos_total`) y
    las funciones RPC agnósticas a qué códigos tenga `actividades_config` — funcionan igual con
    `XTR*` que con `XR*`/`XP*` — y agrega el seed de `seed.js` solo como red de seguridad para una
    sede que no tenga NINGÚN extra sembrado (hoy no aplica a ninguna de las 4 sedes reales).
  - **Pendiente de confirmar con el dueño:** ¿cuál catálogo es el vigente — el `XTR*` ya en la
    base, o el de `seed.js`? Si es el `XTR*`, valdría la pena actualizar `seed.js` para que deje
    de estar desactualizado como fuente de referencia.
- **Extras "libres" sin monto.** Antes tenían un input de monto libre; ahora, tanto los del
  catálogo como los libres solo piden cantidad + quién. Los libres (sin `cod` de catálogo) se
  guardan con `precio_unitario=0`/`peso_unitario=0`/`revisar=true` — no se les inventa un precio
  ni un puntaje; el admin los revisa a mano vía la columna "Puntos" + badge "A revisar" en
  `/reportes/[id]` (visible solo con permiso `reportes_admin`/`evaluar_reportes`).

---

_Agregar aquí, por fase, cualquier parámetro nuevo que se sembró con un default sin confirmar._
