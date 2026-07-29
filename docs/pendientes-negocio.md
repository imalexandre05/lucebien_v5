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

---

## Fase 7 — Inventario: despiece, tipos y estados

- **Reparto de precio del despiece** (`config.despiece_pct_saco`, migración `0055`): sembrado en
  `0.6` (60% del precio al saco, 40% al pantalón). Es un número de ejemplo elegido para que la
  suma cuadre exactamente al 100%, **no una proporción confirmada por el dueño**. Aplica a
  `precio_base`, `precio_alquiler` y `precio_venta` por igual. Pendiente: confirmar si el reparto
  real es 60/40, si varía por tipo de terno, o si en la práctica cada pieza se tasa a mano en vez
  de derivarse automáticamente del precio del set completo.
- **Estado `en_lavanderia` → `en_pipeline`.** El plan pide el set de estados
  `disponible/alquilado/vendido/en_pipeline/codificando/en_compostura/en_almacen/baja`, que ya no
  incluye `en_lavanderia` (nombre viejo, sugería que el pipeline es solo lavado). La migración
  `0055` migra las filas existentes (`update ... set estado='en_pipeline' where estado=
  'en_lavanderia'`) antes de agregar el check constraint. Verificado contra la base viva: solo
  afectaba 1 fila de datos de seed/demo, no hay impacto en datos reales.
- **Automatización parcial de estados.** Se conectaron solo los dos bordes del ciclo que son
  inequívocos: un activo nuevo entra "codificando" cuando se registra por primera vez en el
  pipeline (`registrarPasada`, `lib/pipeline-repo.ts`), y sale a `disponible` cuando `pipeline_
  enviar` lo despacha a una tienda (solo si estaba en un estado de proceso). Los estados
  `en_compostura`/`en_almacen` quedan disponibles en el selector pero **no se fijan automáticamente
  al entrar a la etapa de compostura del pipeline** — forzar esa transición hubiera significado
  inventar una regla no pedida explícitamente (¿debe pisar un estado que el admin fijó a mano?
  ¿qué pasa si el activo está simultáneamente "vendido" y en compostura por una reparación
  post-venta?). Pendiente: confirmar si se quiere esa automatización adicional y con qué reglas.
- **Catálogo `producto_tipos` (migración `0055`).** Se verificó la base viva antes de sembrar
  (lección de la Fase 5): `inventario_activo` solo tenía 4 filas de datos de seed/demo con tipos
  "SC"/"TN", sin catálogo real que preservar. Se sembró con la lista de 9 tipos que da el propio
  texto del plan (terno/saco/pantalón/camisa/corbata/chaleco/pañuelo/zapatos/correa), con prefijos
  de 2 letras elegidos por el asistente (TN/SC/PT/CM/CB/CH/PN/ZP/CR) y `atributos_sugeridos`
  también elegidos por el asistente como conveniencia de UI (no son una regla de negocio: solo
  pre-cargan claves vacías en el editor de atributos libres, que el admin puede ignorar o borrar).
  Pendiente: que el dueño revise/ajuste nombres, prefijos y atributos sugeridos desde
  `/configuracion/tipos-producto` — el catálogo es 100% editable ahí, nada quedó hardcodeado.

---

## Fase 12 — Evaluación mensual completa + Valores 360° + pagos

- **Migración `0057` sin aplicar.** El MCP de Supabase no estaba disponible en este entorno (igual
  que reportó la Fase 7/11 en momentos similares) y `SUPABASE_DB_URL` no existe en
  `apps/erp-web/.env.local` (confirmado, igual que documentó la Fase 11). La migración se escribió
  y quedó lista (`packages/db/migrations/0057_valores360_competencias_pagos.sql`), pero **nadie la
  aplicó contra `scilb`**. Hasta que se aplique: `/valores` muestra el aviso "Falta aplicar la
  migración 0057" en vez de un 500 (`ValoresNoMigradoError`, mismo patrón que
  `SolicitudesNoMigradoError` de la Fase 11); en `/evaluaciones` el catálogo de competencias
  aparece vacío con el mismo aviso inline, y "Registrar pago" del ciclo devuelve un mensaje claro
  (`PagosCicloNoMigradoError`) en vez de fallar en silencio — el resto de `/evaluaciones` y
  `/pagos` (que no dependen de columnas nuevas) sigue funcionando igual que antes de esta fase.
- **`bonusVentas` es SIEMPRE 0 en el autollenado — no hay fuente de datos.** El plan pedía que el
  RPC `evaluacion_componentes` devolviera también `bonusVentas`, pero el módulo que lo calculaba en
  el sistema viejo (`routes/ventas.js`, tabla `ventas_metas`, bonus por cumplimiento de meta de
  venta) **queda explícitamente fuera de alcance de este loop completo de 13 fases** (ver el plan,
  sección "Fuera de alcance" de la Fase 13: "Metas de venta (`routes/ventas.js`)"). No se migró su
  schema ni su lógica de `pct >= 120/100/80 → bonus`. La clave `bonusVentas` se agrega al RPC solo
  para que el autollenado tenga una forma consistente (no `undefined`); el campo sigue siendo
  100% manual/editable en `/evaluaciones`, exactamente como ya lo era antes de esta fase. Si se
  quiere el bonus real por metas de venta, hace falta un loop futuro que migre `ventas.js`.
- **`competencias` NO se autocompleta — nunca fue un dato con historial que recuperar.** A
  diferencia de `valores` (peer review, sí queda guardado por periodo y sí se promedia), las 8
  competencias del sistema viejo siempre las puntuaba el jefe **en vivo**, dentro de la misma
  sesión de evaluación (`public/js/admin.js:1554`, los botones `evalC-*` no se leían de ninguna
  tabla). No existe — ni existió — un `evaluaciones_competencias` con historial por empleado/mes
  del que "traer" una nota. Por eso el RPC `evaluacion_componentes` **no** incluye una clave
  `competencias`: lo único que se portó es el **catálogo** (`competencias_config`, tarea 2), para
  que la rúbrica ya no esté hardcodeada en el frontend — la nota en sí sigue siendo criterio del
  evaluador en cada cierre de ciclo, exactamente como en el sistema viejo.
- **El cálculo de puntos de extras sigue leyendo `actividades_config` tal cual está hoy, sin
  resolver el conflicto de catálogos que dejó la Fase 5** (`XTR02`-`XTR18` en la base viva vs.
  `XR01`/`XP01`-`XP15` en `database/seed.js` — ver sección "Fase 5" arriba, todavía sin decidir).
  Esta fase no tocó ese catálogo ni ese conflicto: `evaluacion_componentes` sigue sumando
  `reporte_extras.puntos_total`/`monto_total` de forma agnóstica (informativo, no entra a la
  fórmula de la nota — igual que desde la Fase 5). **Cualquier número de "extras" que el admin vea
  en `/evaluaciones` o `/mi-desempeño` depende de esa decisión pendiente**: si el dueño confirma que
  el catálogo vigente es el `XTR*` de la base o el `XR*`/`XP*` de `seed.js`, los puntos por extra
  (y por tanto esos totales informativos) pueden cambiar.
- **Ciclo por aniversario: hereda una rareza de bordes de mes del sistema viejo, sin corregirla.**
  `calcularCiclo()` (`packages/core/src/evaluaciones.ts`, puerto literal de
  `routes/evaluaciones.js:98-127`) usa aritmética de calendario estándar de JavaScript
  (`Date.UTC`), igual que el original. Para un empleado con `fecha_ingreso` en día 29, 30 o 31, si
  el mes de destino tiene menos días, la fecha "rueda" al mes siguiente (ej.: aniversario día 31,
  ciclo que cae en febrero de un año no bisiesto → arranca el 3 de marzo, no el 28 de febrero). Es
  el mismo comportamiento que ya tenía `routes/evaluaciones.js` en el sistema viejo (no es un bug
  nuevo de esta migración), pero **nadie confirmó si es el comportamiento deseado** o si el dueño
  prefiere que el ciclo se "recorte" al último día del mes en esos casos. Cubierto con test
  (`evaluaciones.test.ts`, caso "hereda el mismo rollover de calendario") para que cualquier cambio
  futuro de este comportamiento sea deliberado, no accidental.
- **Valores 360°: no se portó la ventana de habilitación por fecha del sistema viejo.**
  `routes/valores.js` tenía un interruptor `eval_valores_habilitado`/`eval_valores_modo`/
  `eval_valores_dias` (por defecto: solo días 25-28 de cada mes, o un flag manual on/off) que
  restringía CUÁNDO se podía evaluar a compañeros. El plan de esta fase no lo pidió explícitamente
  y se decidió dejarlo **siempre abierto** (cualquier día del mes) para no inventar una restricción
  no confirmada — es la opción más permisiva, no la más parecida al original. Si el dueño quiere
  recuperar la ventana de días, es una clave de `config` + una condición en
  `lib/valores-repo.ts` a agregar después, no algo que haya que migrar de nuevo.
- **Reautenticación en `/valores`: decisión de diseño, no del dueño.** "Evaluar compañeros" y "Mi
  resumen" quedaron SIN el gate de `sci_reauth` (a diferencia de `/evaluaciones`, `/pagos` y
  `/mi-desempeno`) porque dar tu opinión sobre un compañero — o ver el promedio que TE dieron, sin
  saber quién — no es tan sensible como ver salarios o notas ajenas. Solo el panel "Seguimiento"
  (agrega desempeño de TODO el equipo, visible solo para admin/dueño) pide reauth, sin bloquear el
  resto de la pantalla. Es una interpretación razonable del criterio de la Fase 1, no una regla que
  el dueño haya confirmado explícitamente para este caso puntual.

_Agregar aquí, por fase, cualquier parámetro nuevo que se sembró con un default sin confirmar._
