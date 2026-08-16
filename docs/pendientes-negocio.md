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

- **✅ RESUELTA (decisión del dueño, 2026-07-29 — Fase 13): manda el catálogo `XTR02`-`XTR18`
  que ya vive en la base, no el de `database/seed.js`.** Quedaba pendiente desde la Fase 5 (y lo
  volvió a anotar la Fase 12) cuál de los dos catálogos de extras era el vigente. El dueño
  confirmó: el catálogo real es el que ya está sembrado en `scilb` (`XTR02`..`XTR18`, 17 filas en
  `LB`/`ST`/`TR` y 11 en `AL`). **No se migra ni se toca ningún dato por esta decisión** — el
  catálogo vivo se queda tal cual, tal como ya lo dejaba la migración `0053` (agnóstica a qué
  códigos tenga `actividades_config`). Queda pendiente, ahora como mejora menor no urgente,
  actualizar `database/seed.js` para que dibuje el catálogo `XTR*` en vez de `XR*`/`XP*` y deje de
  ser una fuente de referencia desactualizada — no bloquea nada del ERP nuevo.
- Contexto original del hallazgo (se conserva para quien retome el tema): el plan pedía portar el
  catálogo de 17 extras de `database/seed.js:20-38` (códigos `XR01`/`XR02`/`XP01`..`XP15`) a
  `actividades_config` porque "hoy no hay ningún catálogo EXT". Al verificar contra la base real
  (`scilb`) antes de escribir la migración `0053`, resultó que **ya existía un catálogo EXT
  sembrado** que no viene de ningún archivo de este repo (no está en ninguna migración ni en
  `seed.js`; probablemente se cargó a mano por SQL directo o en la migración inicial de datos del
  sistema viejo, antes de que este repo la trackeara). Sus valores no coinciden con `seed.js`: por
  ejemplo "Confección de michis" es `XR02` remunerada (S/ 3, 0 pts) en `seed.js`, pero `XTR02` por
  puntos (10 pts) en la base viva. `AL` además tiene un subconjunto de 11 (no los 17), que parece
  deliberado (el almacén no hace ciertos arreglos de sastrería) y no un catálogo incompleto. La
  Fase 5 ya había decidido no sembrar `seed.js` encima (crearía un catálogo duplicado y confuso) y
  dejar las funciones RPC agnósticas a qué códigos tenga `actividades_config` — eso sigue igual.
- **Extras "libres" sin monto.** Antes tenían un input de monto libre; ahora, tanto los del
  catálogo como los libres solo piden cantidad + quién. Los libres (sin `cod` de catálogo) se
  guardan con `precio_unitario=0`/`peso_unitario=0`/`revisar=true` — no se les inventa un precio
  ni un puntaje; el admin los revisa a mano vía la columna "Puntos" + badge "A revisar" en
  `/reportes/[id]` (visible solo con permiso `reportes_admin`/`evaluar_reportes`).

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

- ~~⚠️ **La base viva (`scilb`) está aplicada solo hasta la migración `0045`**~~ y
  ~~**la `0057` sin aplicar**~~ — **AMBAS FALSAS, corregidas el 13-ago-2026.** Se verificó objeto
  por objeto contra `scilb`: **las 66 migraciones están aplicadas**, y `SUPABASE_DB_URL` sí
  existía. Nada corre degradado. Es la misma afirmación falsa que se propagó entre las fases 11,
  12 y 13 copiándose entre sí — ver el bloque tachado al final de este archivo y
  `docs/mapa-verificado.md` §6. **Si encontrás otra copia de esta afirmación en cualquier
  documento, es falsa.**
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
  no confirmada — es la opción más permisiva, no la más parecida al original.
  **→ Actualización Fase 13:** el mecanismo ya se portó (`config.valores_habilitado`/
  `valores_modo`/`valores_dia_inicio`/`valores_dia_fin`, migración `0058`,
  `puedeEvaluarValoresHoy()` en `packages/core/src/valores360.ts` con test). Default = habilitado +
  modo `'siempre'`: sigue exactamente igual de abierto que antes. Lo que queda pendiente de
  confirmar con el dueño es solo **si quiere activar la ventana** y con qué días — ver la sección
  "Fase 13" más abajo.
- **Reautenticación en `/valores`: decisión de diseño, no del dueño.** "Evaluar compañeros" y "Mi
  resumen" quedaron SIN el gate de `sci_reauth` (a diferencia de `/evaluaciones`, `/pagos` y
  `/mi-desempeno`) porque dar tu opinión sobre un compañero — o ver el promedio que TE dieron, sin
  saber quién — no es tan sensible como ver salarios o notas ajenas. Solo el panel "Seguimiento"
  (agrega desempeño de TODO el equipo, visible solo para admin/dueño) pide reauth, sin bloquear el
  resto de la pantalla. Es una interpretación razonable del criterio de la Fase 1, no una regla que
  el dueño haya confirmado explícitamente para este caso puntual.

---

## Fase 13 — Configuración integral + auditoría

- ~~⚠️ **Migración `0058` sin aplicar**~~ — **FALSO, corregido el 13-ago-2026.** Está aplicada,
  igual que las otras 65. La auditoría, `/configuracion` y sus triggers funcionan. Tercera copia
  de la misma afirmación falsa; ver el bloque tachado al final de este archivo.
- **`/configuracion` rediseñada con un catálogo tipado en CÓDIGO, no en la base.** Los
  22 parámetros conocidos (`pts_*`, `peso_*`/`eval_*`, `turno_*_cierre`, `despiece_pct_saco`,
  `valores_*`) tienen su tipo/descripción/sección/default en
  `apps/erp-web/lib/config-catalogo.ts`, no en columnas de `config`. Es una decisión deliberada
  (evita que la misma descripción viva duplicada en SQL y en TS y se desincronice) — las columnas
  nuevas de `config` (`tipo`/`descripcion`/`seccion`/`opciones`) solo se usan para parámetros que
  el admin cree desde la UI y que NO están en ese catálogo de código. Si se agrega un parámetro
  nuevo de negocio en una fase futura, el patrón a seguir es sumarlo al catálogo de código, no
  crear la fila directo en la base.
- **Auditoría: alcance deliberadamente acotado a 5 tablas, no "todo".** El plan pedía
  específicamente `pedidos`, `caja_movimientos`, `empleados`, `pagos`, `evaluaciones_mensuales` y
  excluía a propósito `prenda_pasada` (alta frecuencia — cada avance de una prenda en el pipeline
  generaría una fila de auditoría, volumen que no aporta valor de negocio proporcional). Si en el
  futuro se quiere auditar otra tabla (p. ej. `incidencias` o `solicitudes`), es tan simple como
  agregar dos líneas (`drop trigger if exists` + `create trigger`) apuntando a la misma función
  `private.audit_log_trigger()` — no hace falta reescribir nada, pero **es una decisión a
  confirmar con el dueño antes de sumar más tablas**, no algo que se debiera hacer por inercia.
- **`empleados.password_hash` nunca se registra en `antes`/`despues`**, ni siquiera el hash. No
  era un requisito explícito del plan (que solo pedía cuidar tamaño de columnas y frecuencia de
  tablas), pero es una precaución barata: reduce lo que habría que proteger si `audit_log` alguna
  vez se exporta o se comparte con alguien fuera del equipo técnico.
- **"Bloqueo por evaluación pendiente" (Fase 4) sigue sin un margen de gracia — no se agregó una
  clave de `config` para esto en esta fase.** Se revisó de nuevo en la Fase 13 (la tarea pedía
  "subir a config lo que quedó hardcodeado") pero se decidió NO inventar un parámetro para esto: a
  diferencia de `despiece_pct_saco` o de la ventana de Valores 360° (que son números/interruptores
  con una forma clara), acá lo que falta confirmar es si la REGLA en sí (cero margen) es la
  correcta o si hace falta un margen — y de qué tipo (¿turnos de gracia? ¿horas?). Inventar la
  forma del parámetro sin esa respuesta sería la misma clase de invención que la instrucción pide
  evitar. Sigue exactamente como lo dejó la Fase 4, sin cambios.
- **Catálogo de tipos de incidencia: ya tiene UI de administración
  (`/configuracion/tipos-incidencia`).** No hay pendiente de negocio nuevo aquí — la tabla
  `incidencia_tipos` (migración `0024`) ya estaba aplicada y con datos reales (21 tipos en 8
  categorías), la UI solo le puso una pantalla de administración encima. Verificado en vivo:
  crear, desactivar y eliminar un tipo contra la tabla real, sin dejar residuos.

---

## Fase 8 — Pedidos: modelo multi-línea + RPC atómicas

- **Numeración de `pedidos.numero`: correlativo GLOBAL, no por sede** (migración `0059`, columna
  `generated always as identity`). El plan solo dio un ejemplo de formato (`LB-00043`), sin decir
  si el número debía reiniciar por tienda. Se eligió global porque es más simple y no tiene
  condición de carrera (una identity nativa de Postgres, sin tabla de contadores propia), y el
  prefijo de sede en `codigo` (`sede_cod || '-' || numero`) ya distingue visualmente por tienda.
  No es una fórmula de negocio (no hay monto de por medio), pero si el dueño prefiere que cada
  sede arranque su propio correlativo en 1, es un cambio aislado a esa columna — avisar antes de
  tocarlo porque `codigo` es `unique` y lo consumen el contrato (`/pedidos/[id]/contrato`) y la
  lista.
- **Contra-asiento de `pedido_anular`: un movimiento de caja POR MÉTODO de pago, no uno solo.**
  Si un pedido se cobró parte en efectivo y parte en Yape, anular genera dos egresos (uno por
  método) en vez de un único lump-sum — así el arqueo de caja por método sigue cuadrando tras la
  anulación. No estaba especificado así en el plan (que solo decía "contra-asientos"); se decidió
  por corrección contable, no por pedido explícito.
- **Garantía "parcial": no es un tercer estado.** El ciclo de `pedido_garantias` (migración `0060`)
  define exactamente 2 estados terminales (`devuelta` | `ejecutada`), tal como pide el plan.
  "Devolver una parte y quedarse con el resto" se modela como `pedido_garantia_resolver(...,
  'devolver', p_monto=<parte a devolver>, ...)`: el estado final queda `devuelta` con un egreso por
  el monto parcial indicado, no un estado nuevo "parcial". Si el dueño quiere distinguir
  explícitamente una devolución parcial de una total en el estado (no solo en el monto del
  movimiento), es un cambio de schema a confirmar.
- **Cortesía tipo "camisa que debe volver": modelada como línea `tipo='alquiler'`, no `'venta'`.**
  El plan dice literalmente "la camisa gratis... sale de la tienda y debe volver" — de los 4 tipos
  de línea, `alquiler` es el único con ciclo de devolución (`pedido_devolver` solo opera sobre
  líneas `alquiler`). Si en la práctica una cortesía de este tipo NO se espera que vuelva (ej. un
  llavero de regalo), esa línea debería ser `tipo='venta'` con `precio_unitario=0` en su lugar — es
  una decisión que toma quien arma el pedido línea por línea (Fase 9), esta fase solo deja ambos
  caminos disponibles sin forzar uno.
- **El modal de "Nuevo pedido" (`app/pedidos/cliente.tsx`) sigue siendo de UN SOLO ítem.** Fuera de
  alcance de esta fase a propósito (el plan reserva el constructor multi-línea real para la
  Fase 9) — se ajustó lo mínimo para seguir funcionando contra el modelo nuevo: crea un pedido de
  1 línea vía `pedido_crear`, con la garantía derivada de `garantiaMonto` (efectivo si > 0, si no
  'ninguna') y sin cobro inicial (el cobro se sigue registrando aparte en `/caja`, como ya
  funcionaba). El picker de "+ Cliente nuevo" y el de garantía por documento tampoco existen
  todavía en este modal — ambos son parte del constructor de la Fase 9.
- **`pedidosRepo.cambiarEstado()` se mantiene como método de compatibilidad**, pero ya no hace un
  `update` plano para `'devuelto'`/`'cancelado'` (esos ahora delegan en `devolver()`/`anular()`,
  que mueven dinero/inventario) — solo `'entregado'`/`'cerrado'` siguen como marca simple sin
  efecto de caja/inventario, igual que antes de esta fase.

---

## Fase 10 — Caja integrada + configuración del POS (última fase del plan)

- **`pos_garantia_regla` — sin definir, sin default numérico.** El plan pide la clave marcando
  "default pendiente de confirmar" para la regla de negocio que decidiría cuándo la garantía es
  obligatoria o cuál sería su monto sugerido según el pedido (ej. "obligatoria si el total supera
  S/ X", "sugerir el Y% del total en alquileres"). No existe ningún cálculo así hoy en el sistema
  viejo ni en el nuevo — inventar la fórmula sería la misma clase de invención que la instrucción
  pide evitar. Se creó la clave en `config` (sección "Caja y POS") con valor por defecto **vacío**
  y **sin ningún wiring** al constructor de pedidos: el cajero sigue decidiendo tipo/monto de
  garantía a mano en cada pedido, exactamente como antes de esta fase. Cuando el dueño confirme la
  regla, se implementa como validación/sugerencia en `garantia-panel.tsx` leyendo esta clave.
- **`pos_metodos_pago` / `pos_doc_garantia` / `pos_fechas_rapidas` — formato de texto, no un tipo
  "lista múltiple" nuevo en `ConfigTipo`.** El catálogo tipado de `/configuracion` (Fase 13) no
  tiene un control para "lista de pares editable" — agregar uno sería una pieza de UI nueva fuera
  del alcance de esta fase. Se optó por texto con un formato simple y documentado en la propia
  descripción del parámetro (`valor:Etiqueta` separado por comas; JSON para las fechas, que tienen
  2 sub-listas con offset numérico) — editable desde `/configuracion` como cualquier otro
  parámetro de texto, con parseo defensivo en `lib/pos-config.ts` (un valor mal escrito cae al
  default, nunca tumba `/caja` ni `/pedidos`). Los 3 defaults son EXACTAMENTE los que ya usaban
  las pantallas antes de esta fase (no son valores nuevos inventados).
- **"Opera caja" en `/empleados` es un permiso POR ROL, no por persona.** `pos_cobro` sigue
  viviendo en `permisos_modulos`, clave por rol base o rol derivado (mismo mecanismo que toda la
  matriz de permisos desde la Fase 1) — no existe una capa de permisos por-empleado en el sistema.
  El toggle nuevo en `/empleados` es honesto al respecto: togglear "Opera caja" mientras se edita
  un colaborador cambia el permiso del ROL que tiene seleccionado en ese momento, y por lo tanto
  afecta a TODOS los colaboradores con ese mismo rol (o rol derivado), no solo al que se está
  editando — el propio texto de la UI lo advierte. Si el dueño quiere que la caja se autorice
  persona por persona independientemente del rol, hace falta una tabla nueva (ej.
  `empleado_permisos_extra`) — cambio de schema a confirmar, no se inventó aquí.
- **Limpieza de columnas viejas de cabecera (migración `0062`): las 5 se pudieron borrar.**
  `pedidos.garantia_monto`, `tela`, `fecha_prueba`, `fecha_segunda_prueba` y `etapa_confeccion`
  quedaron sin ningún `.ts` de `apps/erp-web` leyéndolas del lado cabecera (verificado por grep
  antes de escribir la migración — todo el código vivo ya leía/escribía la columna homónima de
  `pedido_items`, la línea, desde la Fase 8). Se aplicó contra `scilb` con `pedidos` en 2 filas
  antes y después (no se tocó ningún dato, solo columnas). El único resto en TypeScript es
  `pedidoSchema.garantiaMonto` en `packages/core/src/pedidos.ts` — un schema Zod ya marcado como
  "compat retro" del modal de un solo ítem que la Fase 9 borró; queda como código muerto sin uso,
  no se tocó en esta fase por no ser parte del punto 6 del plan (limpieza de columnas de BASE DE
  DATOS, no de TypeScript).

---

## Fuera de alcance del plan de 13 fases (registrado al cierre — Fase 13)

El plan explícito de 13 fases marcaba estos módulos del sistema viejo como backlog, "para que la
decisión quede escrita en vez de olvidada" (texto literal del plan). Ninguno se ejecutó en este
loop; se registran aquí para que quien retome el proyecto los vea juntos con el resto de
pendientes, no perdidos en el texto del plan:

- **Horarios v2** (periodos + slots + importador XLSX, `routes/horarios.js`, ~22 KB) — módulo
  grande, hoy nadie lo pidió activamente.
- **Préstamos por lote** (`routes/prestamos.js`) — no migrado.
- **Metas de venta** (`routes/ventas.js`, tabla `ventas_metas`) — es la pieza que le falta a
  `bonusVentas` en la evaluación mensual (ver Fase 12 arriba: hoy `bonusVentas` es siempre 0 en el
  autollenado, 100% manual). Migrarlo destrabaría ese bono.
- **Listas de lavandería legacy** (`routes/lavanderia.js`) — cubierto en parte por el pipeline
  nuevo; lo que no se migró explícitamente no se evaluó a detalle en este loop.
- **Activar `DEVICE_GATE`** (paso manual, no de código): el mecanismo está implementado y
  verificado (Fase 2), pero requiere aprobar los 4 equipos reales en `/dispositivos` primero. El
  flag sigue en `false`; ninguna fase de este loop lo activó ni debía hacerlo.

## ~~Estado de las migraciones al cierre de la Fase 13~~ — AFIRMACIÓN FALSA, corregida el 13-ago-2026

> Esta sección decía que `scilb` estaba aplicada sólo hasta la `0049` y que faltaba el hueco
> `0050`–`0058`. **Es falso.** Se verificó objeto por objeto contra la base el 13-ago-2026: las
> **66** migraciones están aplicadas. La afirmación se propagó porque las fases 11, 12 y 13 la
> copiaron entre sí sin volver a comprobarla, y durante meses se creyó que producción corría
> degradada. Ver `docs/mapa-verificado.md` §6. Se conserva tachada porque es el ejemplo vivo del
> no-negociable 7: lo que se escribe se verifica contra la base, nunca contra otro documento.

---

## Sistema de sueldos — defaults tomados el 13-ago-2026

De `docs/superpowers/specs/sueldos/SPEC-sistema-sueldos.md`, implementada en
`packages/core/src/sueldos.ts`. Todos son parámetros de `ParametrosSueldo`, editables; ninguno
está quemado en el código. **Ninguno está confirmado por el dueño.**

**🔴 Lo más urgente que salió del verificador (spec §9.5):**

- **Una falta cuesta TRES días de sueldo, no dos.** RN-09 descuenta 2 días, y RN-06 ya había
  restado el día de horas que no trabajó. Con S/120 de sueldo y 3 días contratados, una sola falta
  deja el pago del periodo en S/16.
  **→ S4 respondida y precisada el 14-ago-2026.** Son **2 días en total**, no 3: *"si trabaja 3
  días y cobra 40, y falta uno recibe 80 de dos días, pero al faltar un día se le quita de uno
  más, entonces solo cobra 40"*. O sea, el día que no trabajó **más uno de castigo**. La falta
  justificada pierde **1 día en total**: sólo el que no trabajó, sin castigo encima.
  **El motor descuenta hoy un día de más.** Pendiente de arreglar con spec primero.
- **La meta semanal fija también aplica a periodos de menos de una semana.** Quien entra a mitad
  de semana tiene meta del periodo proporcional pero meta semanal completa: no puede cobrar el
  bono aunque venda bien.
- **Las dos decisiones de abajo las tomó Alexander en conversación, no el dueño.** Mueven S/25 por
  persona por mes. Quedan pendientes de confirmar con el dueño.

**Decisiones de negocio — tomadas por Alexander el 13-ago-2026 (spec §9), sin confirmar por el dueño:**

1. **¿Un día trabajado sin horario contratado puede generar tardanza?** → **No.** Textual:
   *"solo afecta en cuántas horas trabajó y eso en su pago del día"*. Ese día entra por la
   diferencia de horas (RN-06) y por nada más. RN-08 ya lo decía; se corrigió el caso de prueba.
2. **¿La semana que absorbe los días sobrantes del mes sube su meta?** → **No.** La meta semanal
   es fija: horas de la plantilla semanal × meta_por_hora × factor, igual todas las semanas.
   RN-12 se reescribió. La otra opción sigue disponible con `metaSemanalFija: false`.

Con ambas, el caso de prueba daba **S/705.30**; con las reglas del 14-ago quedó en **S/751.70**. Los S/700.30 que declaraba la spec original no
correspondían a ninguna combinación coherente de reglas: mezclaban la tardanza del Excel con la
meta semanal corregida a medias.

**Confirmado el 14-ago-2026 — RN-12 y RN-13 quedan como estaban:**

El bono de S/30 por semana cumplida **sí existe** y es editable. La comisión del 2% se habilita
**sólo al llegar a la meta mensual**. Son dos premios distintos por dos metas distintas, no uno
que reemplazó al otro. El motor ya lo hacía así: no hay que tocar nada.

Se confirman también: las horas extra valen lo mismo que la hora normal; los bonos extras los
escribe el administrador a mano con su motivo y no salen de las actividades extra de los reportes;
y las ventas que cuentan para la meta son **las de cada persona sumadas entre todas las tiendas
por las que rotó**, no las de la tienda.

**Lo que sí hay que cambiar (spec primero):**

- **La meta de venta se acuerda en el contrato, no se calcula.** Hoy el motor la deriva de
  `horas_contratadas × S/45,4545`. El dueño la fija por persona y varía por tienda, temporada,
  experiencia y turno. La fórmula por horas pasa a ser una **sugerencia**, como la escala salarial
  de RN-14.
- ~~**El almuerzo es sólo para tiempo completo.**~~ **Implementado el 14-ago:**
  `horasMinimasAlmuerzo` pasó de 0 a 12 h y se mira día por día, con
  `almuerzoHabilitadoPorAdmin` para que el administrador se saltee el umbral.

**✅ Resuelto en la segunda ronda del verificador (14-ago-2026, spec §9.6):**

- **Cuánto cuesta una falta cuando las jornadas duran distinto.** El castigo se cobraba en días
  promedio y el día no trabajado en horas reales; con jornadas desiguales la falta dejaba de
  costar los 2 días de la regla. **Decisión del dueño: la unidad es el día real que faltó.**
  Faltar a un sábado de 1 hora cuesta dos sábados; faltar a un lunes de 11 horas cuesta dos lunes.
  Consecuencia: `sueldo_por_dia` (RN-04) queda **sólo informativo** y ningún descuento cuelga de
  él.

**Para preguntarle al administrador (14-ago-2026):**

- **Cuánta tardanza se tolera dentro de los 3 días de gracia.** Los 3 días existen y están
  confirmados, pero nadie definió si son 3 tardanzas de cualquier tamaño o hay un tope de minutos.
- **Las metas de los contratos de pocos días.** Si alguien viene sólo los domingos, ¿qué meta de
  venta se le pacta? La regla actual no distingue.
- **La escala salarial.** Las cinco tarifas (S/2,90 · 3,20 · 3,50 · 3,80 · 5,00 por hora) salen
  del Excel y nadie las confirmó. Suben con experiencia, confiabilidad y responsabilidad en
  tienda; el administrador ve la sugerencia y decide, aunque lo ideal es seguirla por
  transparencia con la persona. **Volver a preguntar.**
- **Turno partido con hueco.** ¿Existe o va a existir alguno? El colapso de la asistencia pagaría
  el hueco entre turnos.
- **Tolerancia de tardanza.** Habitualmente 10 minutos, pero depende del contrato: tiene que ser
  editable **por acuerdo**, no sólo global.

**Ya no son valores fijos (14-ago-2026):**

- **`valorCapacitacion` (S/25).** No es un monto fijo: depende de qué tan bien se capacite. Queda
  pendiente un **módulo de capacitación** —con exámenes, que la evaluación mensual ya contempla—
  antes de poder pagar por esto.
- **`metaPorHora` (S/45,4545).** No es un parámetro de negocio sino una **métrica derivada**: es
  la meta dividida entre las horas de trabajo. Sirve como indicativo, no como valor a configurar.

**Defaults que hubo que elegir porque la spec no los fija:**

| Parámetro | Default | Por qué |
|---|---|---|
| `horasMinimasAlmuerzo` | `12` | Confirmado el 14-ago: tiempo completo ≈ 12 h, medio tiempo ≈ 6 h. Se mira día por día. ~~Antes estaba en 0.~~ |
| `metaPorHora` | `1500 / 33` exacto | La spec muestra `45,4545`, que es ese número redondeado. Con el redondeado la meta del periodo daría 7.499,99 en vez de 7.500,00 |
| Redondeo | Cada línea del desglose a 2 decimales; los totales suman líneas ya redondeadas | Así el desglose que se le enseña al colaborador suma exactamente el total. `valorPorHora` es la única cifra sin redondear: llevarla a 3,64 movería el total unos S/0,06 |
| Comparación de meta semanal | `ventas > meta`, estricto | Es lo que dice RN-12. Empatar la meta no la cumple |
| Justificaciones | Por día (`tardanzaJustificada` en el registro), no por contador | El Excel sólo guarda el número total. Por día es lo que pide PEND-06 y deja rastro de qué día y por qué |
| Hueco entre turnos del mismo día, al **pactar** el contrato | La pantalla **avisa**, no bloquea (15-ago-2026) | Un horario `09:00–13:00` + `15:00–20:00` es insertable: la 0072 impide que dos turnos se pisen, no que dejen hueco. Y la liquidación paga de la primera entrada a la última salida, así que ese hueco se paga. Rechazarlo sería inventar una regla que nadie decidió; callarlo sería que alguien pacte un horario sin saber qué va a pagar. **Distinto del hueco del almuerzo, que ya está resuelto** — este entra por el contrato, no por las marcas, así que la respuesta del dueño sobre el huellero no lo cubre |

**Huecos que abrieron las respuestas del dueño del 13-ago-2026** (`docs/respuestas-dueno-2.md`):

- ✅ **S4 — RESPONDIDA el 14-ago-2026.** *"¿qué se le descuenta a alguien del sueldo?"*. La
  respuesta está más arriba, en el bloque del verificador: una falta cuesta **2 días en total**, no
  3. ~~Volver a preguntarla.~~ Lo que sigue abierto no es la pregunta sino el arreglo: **el motor
  descuenta un día de más** y hay que corregir la spec antes que el código (Zone Guard).
- **Modalidad "por día trabajado"** (S1): existe y la spec sólo contempla mensual y semanal.
- **Garantía del adelanto** (S9): hace falta mínimo una semana trabajada ese mes. **Especificada el
  14-ago en `SPEC-esquema-sueldos.md`, todavía sin implementar**: `sueldos.ts` no la comprueba y
  `sueldo_movimientos` acepta hoy cualquier adelanto.
- **Sanciones revocables** (N2, N3): si la prenda perdida aparece, la sanción se revoca. Hoy un
  descuento sólo se registra, no se puede deshacer.
- **¿La comisión va en este sistema o aparte?** (N1): el dueño dijo *"aparte"* pero la describió
  igual que RN-13. Preguntar antes de construir la pantalla de ventas.
- **Meta de puntos que paga dinero** (N4): sin definir. El dueño quiere medir primero cuántos
  puntos junta la gente. Sabe dos cosas: el valor del punto debe ser editable, y la meta cambia
  por puesto y por tienda.

**Parámetros con default tomado de la spec §3.3** (ya escritos ahí, se repiten para que el
administrador los revise de una): tolerancia 10 min · 3 tardanzas libres · S/5 por tardanza ·
S/8 el almuerzo · 12 h para ganarlo · S/25 la capacitación · S/30 el bono semanal · factor de
meta 1,00 · 2% de comisión sobre boletas mayores a S/120 · una falta cuesta 2 días de sueldo en
total · meta semanal pactada en el contrato (sin pactar, se sugiere por horas a S/45,4545).

**Desde la migración `0072` (14-ago-2026) los 13 primeros son filas de `config`**, con las claves
`sueldo_*`, y desde el 14-ago están en `config-catalogo.ts`: **el administrador ya los edita desde
`/configuracion`**. La meta semanal no va ahí: vive en el contrato, porque su
"sin valor" significa *sugerila* y una fila de texto no puede decir eso. La tolerancia se puede
pisar **por contrato**, como pidió Alexander.

### Lo que la capa de datos dejó abierto (14-ago-2026)

- ✅ **Cómo se registra una licencia — RESUELTO el 14-ago-2026.** Una licencia **es una falta que el
  administrador marca como justificada**: *"se justifican, y se evidencian con pruebas del
  colaborador, es un acuerdo entre el colaborador y administrador; el administrador solo colocaría
  que ese día fue justificado, y si lo deja, pues no fue justificado"*. O sea `condicion = 'falta'`
  con `falta_justificada = true`, que pierde sólo el día que no vino y ningún castigo. **El esquema
  ya lo soporta tal cual** y el default `false` es justamente lo que él describe: justificar es un
  acto del administrador, y no hacer nada deja la falta como injustificada. El día de descanso
  semanal no necesita fila: no es un día contratado.
- **La evidencia de la justificación no se adjunta, se describe.** Hoy sólo hay
  `motivo_justificacion` (texto). Si el administrador quiere guardar la constancia médica o el
  mensaje, hace falta un adjunto — se puede resolver con el mismo storage de Supabase que usa
  `mt_*`. Preguntar si lo quiere antes de construir la pantalla de asistencia.
- **Turno partido con hueco.** La asistencia se colapsa con `min(entrada)` / `max(salida)` por día,
  así que un turno con hueco al mediodía pagaría el hueco. Hoy no existe ninguno; si aparece, hay
  que decidir antes de liquidarlo.
- **Trabajo fuera del horario pactado (RN-17).** El motor lo recibe aparte. El esquema no lo marca:
  se deriva de que ese día no tenga turno en la plantilla. Confirmar que ese criterio alcanza.
- **Quién declara la asistencia.** Hoy sólo el administrador (verificado en `pg_policies`). Falta
  decidir si el encargado debe poder declarar la de su sede; si la respuesta es sí, va por RPC con
  guard, nunca ampliando la policy.

---

## Huellero Hikvision (spec del 15-ago-2026, sin implementar)

- ✅ **El almuerzo — RESUELTO el 15-ago-2026 por Alexander.** *"Los colaboradores almuerzan en la
  misma empresa, no salen"*, y el almuerzo **se paga**: a los de tiempo completo se les agrega S/8
  (RN-11), que es un ingreso y no un descuento de horas. El tiempo de almuerzo cuenta como
  trabajado, que es justo lo que ya hace el colapso `min(entrada)`/`max(salida)` de la
  liquidación. **El pendiente del turno partido anotado más arriba no se materializa por esta
  vía**: sin salida al mediodía no hay hueco que pagar. Nada que cambiar en el motor.
- ✅ **`huellero_corte_turno` — ELIMINADO, no llegó a existir.** El primer diseño partía las marcas
  del día en turno M y T por una hora de corte. Con dos marcas por día (entrada 09:00, salida
  20:00) cada turno se quedaba sin salida y la liquidación leía cero horas trabajadas. Se corrigió
  a **una sola fila por día** antes de escribir código. El huellero no agrega ningún parámetro de
  negocio y por lo tanto no inventa ningún default.
- **Qué hacer cuando hay marcas en un día declarado como falta.** La derivación no toca esa fila
  por diseño, y el caso se muestra en la pantalla de administración para que decida una persona.
  Falta definir qué se espera que haga: ¿revertir la falta, ignorar las marcas, pedir explicación?
- **El hueco largo del mediodía — PREGUNTA ABIERTA PARA EL DUEÑO.** No confundir con el almuerzo,
  que ya está resuelto. Es la persona que se va dos horas por un trámite y vuelve. El colapso
  `min(entrada)`/`max(salida)` le paga esas dos horas. Hoy el caso es invisible porque nadie lo
  carga; el huellero lo va a volver visible por primera vez. **¿El hueco del mediodía se paga
  siempre, o solo hasta cierta cantidad de minutos?** Se puede decidir después sin perder nada: las
  marcas crudas quedan guardadas en `marcas_huellero`, así que la regla se aplica hacia atrás.
- **Los tres parámetros de tardanza, antes de la primera liquidación con datos del huellero.**
  `sueldo_tolerancia_minutos`, `sueldo_tardanzas_libres` y `sueldo_penalidad_tardanza` se eligieron
  para un mundo donde la tardanza se cargaba a ojo y nadie anotaba tres minutos. Van a empezar a
  aplicarse a un mundo donde se mide al minuto, y la cuenta de tardanzas del periodo va a subir.
  No están mal; hay que revisarlos con el dueño. **Que la primera persona se entere por su recibo
  sería la peor manera.**
- **Los 54 identificadores del equipo contra los 18 empleados activos.** Los que no correspondan a
  nadie se marcan como ignorados. Falta saber de quiénes son: ex-empleados, personal de otra
  empresa, pruebas. No bloquea, pero conviene saberlo antes de ignorar en masa.
- ✅ **Días con entrada y sin marca de salida — MEDIDO el 15-ago-2026: 268 de 1.571 jornadas
  (17%).** Ocho meses de histórico, 3.058 marcas, 23 personas. (Una primera estimación del 41% era
  inválida por un defecto de paginación del script y quedó descartada.) **No está repartido
  parejo**: la gente de turno fijo marca bien (YESSICA 8%, MARYLIN 4%, JAEROCK 3%, SHEYLA 4%) y el
  problema se concentra en casos con explicación propia — GUILLERMO 100% porque solo abre las
  puertas, JORDAN 48% porque entra y sale todo el día, ELTHOM 51% que es nuevo. **No es un
  problema general de disciplina**, así que la conversación con el dueño es sobre tres personas,
  no sobre toda la empresa. Un día sin salida queda en `condicion='sin_dato'` y corta la
  liquidación del periodo (`0073_sueldos_rpc.sql:128-145`); el sistema los lista para que el
  administrador los complete antes de liquidar.
- 🔴 **El huellero reutiliza identificadores — comprobado.** El `00000013` marcó como **JAZMIN**
  hasta el 28-ene-2026 08:45 y como **NICOL** desde las 20:46 de ese mismo día. Un mapeo sin
  fechas le adjudicaría a NICOL los 27 días de JAZMIN, y el día del cambio juntaría la entrada de
  una con la salida de la otra en una jornada de doce horas que no trabajó ninguna. Por eso
  `huellero_mapeos` lleva `vigente_desde`/`vigente_hasta`. **Hay que preguntar al administrador si
  hubo otras reasignaciones** que el histórico no alcance a mostrar.
- **Jornadas implausibles que el colapso no puede resolver.** JORDAN tiene días de 00:22 a 23:01
  (22,6 horas) y FERNANDO un día con dos marcas en el mismo minuto (0 horas). No son jornadas
  reales. El sistema no las corrige —poner un tope sería inventar una regla— pero las lista aparte
  para revisión. **Falta definir el rango de horas que se considera razonable** para esa alerta;
  va como fila de `config`.
- **Solo 23 de las 54 personas inscritas marcaron este año, y varias dejaron hace meses** (REMY en
  mayo, MARITZA en abril, JEFFREY en febrero, ALEXANDER en mayo). El dato dice solo quién sigue
  activo, así que el mapeo inicial no hay que adivinarlo: los que nunca aparecen o desaparecieron
  hace tiempo son los candidatos a ignorar. Confirmar con el administrador antes de ignorar en
  masa.
- **ELTHOM (identificador 61) es personal nuevo y su acuerdo con el administrador no se conoce.**
  Marca entrada alrededor de las 09:35. Antes de mapearlo hay que saber qué se pactó con él: si es
  jornada completa, medio turno o algo por horas, porque de eso depende su `sueldo_acuerdo_turnos`
  y por lo tanto su tardanza y su liquidación.
- ✅ **GUILLERMO (identificador 25) — RESUELTO el 15-ago-2026 por Alexander.** *"Solo entra para
  abrir las puertas pero igual marca su huella"*. Su marca única **no es una jornada incompleta**,
  es correcta. Se marca su identificador como ignorado en la pantalla del huellero, para que no
  genere días de asistencia que nadie va a completar. Confirmar antes si además tiene jornada
  propia en algún momento.
- **Todos deberían marcar, y no todos aparecen.** Alexander confirma que el huellero **cubre a la
  empresa en general**, no solo al almacén, y que se supone que todos marcan. En la primera
  lectura aparecieron 7 personas de 18. Parte de la diferencia la explica el defecto de
  paginación; el resto hay que averiguarlo con el histórico completo: si hay gente que no marca
  nunca, esa es una conversación con el dueño antes de encender el colector.
- **Los turnos reales no son los que asume el comentario de la `0073`.** Ese comentario habla de
  09:00–13:00 + 13:00–20:00 como si todos hicieran jornada completa. Lo observado: turno de mañana
  ~08:00–14:00 (YESSICA, JAEROCK), turno de tarde ~14:00–20:00 (JANET, MARYLIN) y jornada larga
  ~08:00–19:00 (SHEYLA). Importa para `sueldo_acuerdo_turnos`: si a alguien de turno mañana se le
  carga un horario contratado que empieza 09:00, la tardanza sale mal. Revisar los acuerdos contra
  estos horarios antes de la primera liquidación.

---

_Agregar aquí, por fase, cualquier parámetro nuevo que se sembró con un default sin confirmar._
