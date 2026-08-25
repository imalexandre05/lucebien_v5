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
- ✅ **Ciclo por aniversario: se recorta en un mes corto — implementado el 24-ago-2026.**
  `calcularCiclo()` (`packages/core/src/evaluaciones.ts`) dejó de dejar que `Date.UTC` desborde
  silenciosamente al mes siguiente cuando `fecha_ingreso` cae en día 29, 30 o 31. Alexander confirmó
  la regla con ejemplos concretos — spec
  [2026-08-24-ciclo-aniversario-mes-corto-design.md](superpowers/specs/evaluaciones/2026-08-24-ciclo-aniversario-mes-corto-design.md):
  el ciclo se recorta al último día real del mes, nunca invade el mes siguiente ("entra el 31 de
  enero, se paga el 28 de febrero", no el 2 o 3 de marzo). El único test que existía sobre el
  comportamiento viejo (`evaluaciones.test.ts`, día 31) cambió de valor a propósito — es justo el
  caso que esta spec vino a corregir, no una regresión.

  ✅ **El caso de años bisiestos — CONFIRMADO el 24-ago-2026.** La fórmula exacta que dio Alexander
  (`hasta = mín(díaDeseado − 1, últimoDíaDelMes)`) no distinguía años bisiestos: alguien que entra
  el 29 de enero en un año bisiesto da `28-feb`, no `29-feb`, porque `díaDeseado − 1 = 28` sin
  importar si el febrero de destino tiene 28 o 29 días. Alexander confirmó, preguntado
  directamente: *"si tambien el 28 se paga"* — el mismo día en año bisiesto o no. La fórmula tal
  cual está implementada ya es la correcta; no hace falta ninguna rama especial. Cerrado, sin
  cambios de código.
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

- ✅ **Una falta cuesta 2 días, no 3 — ARREGLADO el 14-ago-2026, reconfirmado el 16-ago.** El
  hallazgo original: RN-09 descontaba 2 días y RN-06 ya había restado el día que no trabajó, así
  que costaba 3.
  **S4 respondida y precisada:** *"si trabaja 3 días y cobra 40, y falta uno recibe 80 de dos días,
  pero al faltar un día se le quita de uno más, entonces solo cobra 40"*. El día que no trabajó
  **más uno de castigo**; la justificada pierde **sólo** el día que no vino.
  **El motor ya lo hace así** (`diasCastigoPorFalta = max(0, diasDescuentoPorFalta − 1)`, y
  `horasFaltadas` sólo acumula las faltas sin justificar), con test de los dos casos.
  ~~Pendiente de arreglar.~~ **Esta línea quedó vieja dos días** y se leyó como si el error siguiera
  vivo: verificar contra el código, no contra el documento.
- **La meta semanal fija también aplica a periodos de menos de una semana.** Quien entra a mitad
  de semana tiene meta del periodo proporcional pero meta semanal completa: no puede cobrar el
  bono aunque venda bien.
- **Las dos decisiones de abajo las tomó Alexander en conversación, no el dueño.** Mueven S/25 por
  persona por mes. Quedan pendientes de confirmar con el dueño.

**Decisiones de negocio — tomadas por Alexander el 13-ago-2026 (spec §9), sin confirmar por el dueño:**

1. **¿Un día trabajado sin horario contratado puede generar tardanza?** → **No.** Textual:
   *"solo afecta en cuántas horas trabajó y eso en su pago del día"*. Ese día entra por la
   diferencia de horas (RN-06) y por nada más. RN-08 ya lo decía; se corrigió el caso de prueba.
2. **¿La semana que absorbe los días sobrantes del mes sube su meta?** → ~~**No**~~ → **SÍ,
   revertido el 16/17-ago-2026.** Preguntado de nuevo, Alexander respondió **«exacto, sube»**. El
   default de `metaSemanalFija` pasó a `false` (migración 0076, C-02). La conducta anterior sigue
   a un clic en /configuración → Sueldos → «Meta semanal fija».
   **Cuesta S/76,40 en el caso de prueba, no S/30:** la meta del mes es la suma de las semanales,
   así que subir la de la semana larga sube también el umbral de la comisión, y en ese caso la
   apaga entera. Sigue pendiente de confirmar con el dueño.

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

## Respuestas de Alexander del 16-ago-2026

Se contestaron 21 preguntas de una vez. Lo que sigue es qué cambia cada una. **Todo lo que toca
una regla de cálculo entra por spec primero** (Zone Guard): acá queda registrado, no implementado.

### Resueltas sin trabajo: el sistema ya hace lo que se pidió

- ✅ **La falta injustificada cuesta 2 días y la justificada 1.** *"una falta injustificada vale por
  dos días, una falta justificada solo descuenta un día"*. **El motor ya lo hace exactamente así**
  y tiene test de los dos casos (`sueldos.test.ts`: «cuesta 2 días de sueldo» y «una falta
  justificada cuesta 1 día»). `diasCastigoPorFalta = max(0, diasDescuentoPorFalta − 1)` da 1 día de
  castigo, y el día que no vino ya salió por RN-06; `horasFaltadas` sólo acumula las faltas **sin**
  justificar. ~~El motor descuenta un día de más.~~ **Esa afirmación era vieja**: se arregló el
  14-ago y quedó anotada como pendiente igual.
- ✅ **Modalidad «por día trabajado» — NO hace falta.** *"a veces hay personas que trabajan un día a
  la semana (solo domingos, es el caso de Daniel) pero se le paga mensualmente"*. Eso es un
  contrato **mensual** con un solo turno el domingo, que el modelo ya soporta. Pagar el mismo día
  de trabajo *"sería algo poco común"*. Se cierra sin cambios.
- ✅ **Sólo el administrador declara la asistencia.** Respuesta directa: *"no, solo admin"*. Es
  exactamente lo que hace hoy la policy `asist_admin_write`. Se cierra.
- ✅ **La comisión sí vive en este sistema.** *"la comisión se saca de las ventas, y el sistema de
  ventas e inventario es un sistema aparte"*. O sea: la **regla** es de sueldos, el **dato** viene
  de afuera. Es justo el diseño de `sueldo_ventas` (origen `'manual'` hoy, otro origen el día que
  exista la API). Lo que el dueño llamó *"aparte"* era el sistema de ventas, no la comisión.
- ✅ **Marcas en un día declarado como falta: se le pide explicación al colaborador.** Y una marca
  vale como prueba de presencia: *"si marcó su huella aunque sea solo una vez, implica que estuvo
  presente"*. También vale una foto como evidencia. En los dos casos **decide el administrador**, y
  el huellero no revierte nada solo.
- ✅ **Un contrato nuevo cuando cambia el horario a mitad de periodo.** *"claro, puede ser ese
  flujo, que se haga otro contrato"*. Es lo que el modelo ya obliga.
- ✅ **Los datos de las personas se cargan a mano.** No hace falta importarlos de ningún lado.
- ✅ **Los 54 identificadores del huellero:** *"seguramente sean exempleados en su mayoría y una que
  otra prueba"*. Se resuelve creando los usuarios en el sistema; los que no correspondan a nadie
  quedan ignorados.

### 🔴 Abren trabajo nuevo: cambian una regla de cálculo

- **La comisión se activa cuando TODAS las semanas llegaron a su meta.** Textual: *"hay bonos por
  semana completada y la comisión se activa cuando se llegan todas las semanas a la meta"*.
  **El motor hoy hace otra cosa**: `metaAlcanzada = ventasTotal >= metaPeriodo` (`sueldos.ts:734`),
  o sea compara el total del periodo contra la meta del periodo. Con 4 semanas de meta S/1.500,
  quien venda 3.000 la primera semana y 1.000 en cada una de las otras llega a los 6.000 del mes
  **sin haber cumplido tres semanas**, y hoy cobra comisión. Con la regla nueva, no.
  **Cambia RN-13. Va por spec, con test, antes de tocar el motor.**
- **El bono semanal se habilita por contrato.** *"los bonos de 30 soles deben ser editables, el
  administrador decide si habilitarlo o no en el contrato"*. La parte de «editable» ya está
  (`bonoMetaSemanal` es override por contrato, y ponerlo en 0 lo apaga). Falta decidir si alcanza
  con el 0 o si el administrador quiere un interruptor explícito que diga «sin bono» — no es lo
  mismo para quien lee el contrato.
- **La meta sugerida no es una fórmula fija.** *"la meta sugerida sale sola después de calcular
  varias cosas, no es como un parámetro predeterminado... depende la tienda, temporada, etc"*. Hoy
  se sugiere con `horas × metaPorHora` (S/45,4545). **Esa sugerencia no representa lo que él
  describe.** Hasta que se sepa de qué depende, conviene que la pantalla la muestre como lo que es:
  una cuenta de referencia, no una meta propuesta.
- **La escala salarial tiene que ser editable.** *"esas escalas pueden editarse también, a veces hay
  personas de confianza o que regresan al negocio y tienen una escala mayor"*. Hoy
  `ESCALAS_SUELDO_DEFAULT` vive en el core como constante. Hay que moverla a `config` o a su propia
  tabla, editable desde `/configuracion`.
- **Indicador de cuánto lleva ganado una persona, en tiempo real.** Pedido explícito: *"sería bueno
  también que haya un indicador de cuánto ya se le pagaría al colaborador, contando horas, metas,
  etc... permitiría ver el administrador cuánto máximo podría adelantarle y cuánto le cuesta cada
  trabajador en tiempo real"*. El motor ya sabe calcularlo; falta la pantalla y decidir si el corte
  es «hasta hoy» o «hasta el último día declarado».
- **La garantía del adelanto es una SUGERENCIA, no un bloqueo.** *"debería ser una sugerencia que
  mínimo debe pasar una semana para compensar el adelanto con el trabajo"*. Corrige lo que decía la
  spec, que lo trataba como impedimento.
- **Descuento por prenda perdida: se suspende, no se aplica de una.** *"lo que se hace en la vida
  real es que dejan pasar el tiempo sin pagar hasta que se recupere la prenda o devuelve; cuando ya
  se cree que se perdió totalmente se aplica el descuento"*. Y si ya se descontó y la prenda
  aparece, *"podría en un siguiente sueldo devolverse esa suma"*. Hoy `sueldo_movimientos` no tiene
  estado: un descuento se registra o no existe. Hace falta un flujo de **descuento en suspenso** →
  aplicado o anulado. Sin diseñar.
- **La justificación la escribe el colaborador.** *"se describe y justifica pero por parte del
  colaborador, el admin también puede pero no sería lo ideal"*. Hoy sólo el administrador escribe
  en `asistencias`. Un flujo donde el colaborador propone y el administrador aprueba **no existe** y
  no se puede improvisar: escribir su propia justificación es escribir sobre su propio pago.

### Preguntas que quedaron abiertas de vuelta

- **Las semanas del periodo** — hace falta confirmar cómo se arman exactamente. Ver la lista de
  preguntas en el hilo del 16-ago.
- **Marcaje astuto (regla)** — Alexander pidió propuestas: *"plantea reglas para ello"*. Su
  criterio: *"si alguien marca eso y solo es medio turno obviamente es falso, o tiene que
  evidenciar que sí estuvo todo el día"*. Sin definir.

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
  a **una sola fila por día** antes de escribir código.
- ⚠️ **`huellero_jornada_max_horas` = 14 y `huellero_jornada_min_horas` = 0.5 — DEFAULTS SIN
  CONFIRMAR.** (Corrige una afirmación anterior de este mismo documento que decía que el huellero
  no agregaba ningún parámetro: sí agrega estos dos, sembrados por la migración `0075`.) Una
  jornada derivada fuera de ese rango **no se declara `trabajado`**: se guardan las horas reales
  en `sin_dato` con el motivo en `obs`, para que la revise una persona. No recortan nada —recortar
  sería inventar una regla—, sólo deciden qué se paga solo y qué necesita una mirada. Los números
  salieron de los datos: las jornadas normales van de 4 a 13 horas, y las que se salen son las de
  JORDAN (22,6 h) y FERNANDO (0 h). **Confirmar con el dueño**, sobre todo el mínimo: media hora
  puede ser poco si hay gente que trabaja por horas.
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
- ✅ **JORDAN (identificador 2) y REMY (1) — RESUELTO el 17-ago-2026 por Alexander.** *"Es el
  admin, a veces marca por marcar, lo mismo con Remy; son personas parte de la familia y siempre
  marcan sin saber. No lo tomes en cuenta, a ellos no se les paga."* Sus identificadores van
  **ignorados** en el mapeo. Eso explica de paso los dos patrones que no cerraban: los días de 22
  horas y el 48% de marcas sueltas eran suyos.
- ✅ **La salida que vuelve el mismo día — RESUELTO el 17-ago-2026 por Alexander.** *"Si alguien
  marca su salida y vuelve a habilitarlo el mismo día se cuentan nuevamente las horas; no es que
  el sistema castigue, sencillamente no cuenta esas horas como trabajadas."* El huellero emite un
  tramo por par de marcas y el hueco no se paga, alineado con C-01 y la migración `0078`. En la
  práctica casi no ocurre: nadie marca "por un rato", la salida es la salida.
- ✅ **`sueldo_pausa_minima_minutos` = 15 — CONFIRMADO el 17-ago-2026** ("suena razonable"). Es el
  umbral que separa "se fue" de "apoyó el dedo dos veces". Sin él, dos marcas seguidas partirían
  el día y descontarían minutos todos los días.
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

## Defaults sembrados el 17-ago-2026 (SPEC-cambios-reglas-2026-08-17)

Los tres son **elegidos, no confirmados**. Ninguno sale de una regla que alguien haya dicho: salen
de reproducir la conducta acordada sin inventar un número. Todos editables desde /configuración.

| Parámetro | Default | Por qué ese, y qué pasa si está mal |
|---|---|---|
| `sueldo_meta_semanal_fija` | `false` (C-02) | Es la conducta que Alexander pidió. Si estuviera mal, la semana larga volvería a pedir la meta de siempre y se pagarían S/76,40 más por persona por mes |
| `sueldo_factor_hora_fuera_contrato` | `1` (C-03) | El único default que **no cambia ningún monto**: con 1 la hora fuera de contrato vale lo mismo que hoy. Elegido así a propósito para que agregar el parámetro no le mueva la plata a nadie |
| `sueldo_margen_horas_dia_minutos` | `120` (C-05 regla A) | Alexander avisó que quedarse dos horas terminando pendientes es normal. Con 60 la señal sonaría todos los días y se aprendería a ignorar. **No descuenta nada**: marca el día para que alguien lo mire |

**Falta confirmar con Alexander:** `pausaMinimaMinutos` para C-01 (propuesto 15) — cuántos minutos
entre una salida y la entrada siguiente cuentan como pausa de verdad. Sin umbral, dos marcas
seguidas por error (09:00 y 09:02) parten el día y le descuentan dos minutos a alguien.

---

## Preguntas abiertas del 20-ago-2026

### `sueldo_pausa_minima_minutos` existe en la base recién desde la 0079

Verificado contra producción: la fila **no existía**. La `0078` la inserta, pero esa migración no
está aplicada, así que el umbral corría por el default de quince minutos escrito dentro de la
función — es decir, hardcodeado y no editable, contra el no-negociable 5. La `0079` lo inserta con
`on conflict do nothing` para que exista aunque la `0078` nunca llegue.

Sigue **sin confirmar** el valor. Quince es la propuesta; el efecto de moverlo se ve en dos lugares:
qué cuenta como pausa (C-01) y con qué hora se cierra un tramo reabierto (regla 1 de la `0079`).

### Con qué hora cierra un tramo reabierto — **resuelto el 20-ago-2026**

Confirmado por Alexander: **con la última marca**. Si el hueco es más corto que la pausa mínima, por
definición no fue una pausa, así que las dos marcas son del mismo tramo y la última es su final.
Medido sobre el histórico: 38 días afectados, 1,7 minutos de separación promedio. La diferencia
contra la lectura alternativa está acotada por arriba al valor de la pausa mínima.

### Valores 360° ya no se puede enviar a medio contestar — **resuelto el 20-ago-2026**

Hasta el 20-ago-2026 los seis valores del peer review arrancaban en 3, así que abrir la ficha de un
compañero y tocar Guardar mandaba seis treses. Dos consecuencias, y las dos llegan a la nota: se
podía enviar sin evaluar, y un 3 puesto a propósito era indistinguible de uno que nadie tocó.

Ahora el formulario arranca vacío y exige las seis respuestas.

**No cambia ningún cálculo** —`notaValores360()` promedia lo que haya, igual que antes— y quitar un
default inventado no es inventar una regla. Pero **sí cambia cuántas evaluaciones se envían**: quien
antes despachaba una ficha de un toque ahora tiene que contestar seis. Si la participación baja, la
nota de Valores queda con menos datos y eso también se nota en la evaluación mensual.

**Confirmado por Alexander: se queda exigiendo las seis.** El atajo «Todos a N» sigue disponible
para quien de verdad puntúa igual en todo.

Lo que conviene mirar a fin de mes: cuántas evaluaciones llegaron contra el mes anterior. Si la
participación cae mucho, la nota queda con menos datos y hay que decidir de nuevo — pero esa es una
comparación, no una suposición.

### La liquidación dentro del módulo de colaboradores

El módulo trabaja sobre un rango libre de fechas; `sueldo_liquidaciones` trabaja sobre **un contrato
entero**. Antes de mudar la liquidación adentro del módulo hay que decidir qué se muestra cuando el
período elegido no coincide con ningún contrato: ¿el contrato que más se solapa, nada, o se recorta
el período al contrato? Es una decisión de negocio, no de pantalla. Mientras tanto Liquidaciones
sigue siendo una entrada propia del menú.

---

_Agregar aquí, por fase, cualquier parámetro nuevo que se sembró con un default sin confirmar._

---

## Decisiones del 20-ago-2026

| Decisión | Qué se hizo |
|---|---|
| **Valores 360° exige las seis respuestas** | Se queda. Revisar la participación a fin de mes |
| **Todo el módulo comercial sale del menú** | Pedidos, Caja, Inventario, Clientes, Finanzas, Estadísticas, Proveedores, Materiales y Compras. Las rutas siguen vivas: se ocultan, no se borran, porque hay datos detrás y el traspaso al otro sistema todavía no ocurrió |
| **Modo oscuro: no por ahora** | La adopción del ERP es 4,4%; el problema es que la gente lo use, no de qué color es |

---

## Huellero y plantilla (19-ago-2026)

Ninguno de estos es un default inventado en el código: son decisiones de negocio que quedaron
abiertas al reiniciar la plantilla, y cada una tiene consecuencia sobre a quién se le paga qué.

- **¿CÉSAR, RICARDO y NOHELY siguen trabajando?** Marcaron hasta el 31-jul, el 6-ago y el 7-ago
  respectivamente, y no se les creó cuenta. Si siguen, hay que crearlos y mapear sus 358 marcas;
  si no, conviene marcar sus identificadores como ignorados para que no ensucien la cola.
- **¿El identificador 13 es una persona o dos?** Fue JAZMIN hasta el 28-ene 08:45 y NICOL desde
  las 20:46 de ese día. Si es la misma persona renombrada, sus 128 marcas van completas a Nicol;
  si son dos, el mapeo se parte en esa fecha y el día 28 lo resuelve una persona. Hoy está sin
  mapear y Nicol figura con cero días.
- **No existe el rol "vendedor".** Los nueve colaboradores nuevos quedaron como `ventas_junior`,
  que es el rol más parecido de los siete que define `packages/core/src/permisos.ts`. Si el dueño
  quiere un rol propio de vendedor con otros permisos, es una decisión de negocio, no un ajuste.
- **La contraseña de las nueve cuentas nuevas es la misma** (`lucebien2026`), puesta al crearlas.
  Hay que cambiarla desde `/empleados` antes de que esas cuentas se usen de verdad.
- **Los horarios contratados no están cargados** (`sueldo_acuerdos` está vacía). Los turnos que se
  ven en las marcas reales son ~08:00–14:00, ~14:00–20:00 y jornada larga ~08:00–19:00, que no
  coinciden con el 09:00–13:00 más 13:00–20:00 que asume un comentario de `0073_sueldos_rpc.sql`.
  Cargar un horario que empieza más tarde que el real le inventa tardanza a la persona.

---

## Decisiones del 21-ago-2026 — Envío a Lavandería

Salieron de probar la pantalla con Alexander. Ninguna es un default inventado: las tomó él.

| Decisión | Qué se hizo | Dónde vive |
|---|---|---|
| **Camisa y corbata no son tipo de prenda** | Se cuentan a granel con los demás accesorios. La lista de tipos vuelve a ser la del sistema viejo: Terno completo, Saco, Pantalón, Chaleco, Blazer, Falda, Otros | `packages/adapter-lucebien/src/catalogos.ts` → `tiposPrenda` |
| **«Otros» obliga a decir qué prenda es** | El texto que se escribe viaja como el tipo de la prenda. Sin eso, la prenda entra al pipeline llamándose «Otros» y ahí se pierde | `app/envio-lavanderia/cliente.tsx` |
| **Un envío necesita al menos una prenda con código** | Antes se podía mandar una lista de puros accesorios. El código es lo que después permite seguir y reclamar una prenda | `app/envio-lavanderia/actions.ts` |
| **Las tallas se piensan en adulto y niño** | Mismas dieciocho del sistema viejo, partidas en dos escalas. **El 26 quedó del lado de adulto** por ser medida de pantalón: si no lo es, se mueve | `catalogos.ts` → `tallasPrendaAdulto` / `tallasPrendaNino` |
| **Elegir a un encargado lo pone como responsable de inventario** | Sólo si el campo está vacío: nunca pisa una elección hecha a mano | `app/envio-lavanderia/cliente.tsx` |
| **Elegir al encargado del turno lo marca como colaborador** | El RPC ya lo contaba; ahora también se ve marcado. Al cambiar de encargado, el anterior **no** se desmarca solo | `app/reportes/nuevo/form.tsx` |

**Queda sin decidir: qué es «tipo de envío» (general / refacción).** Lo único que cambia en la RPC
`lavanderia_enviar` (migración 0066) es que en `REF` **todas** las prendas entran al pipeline en
`compostura`, sin mirar el destino de cada una. Como ahora cada prenda elige su destino en la
pantalla, el selector dice dos veces lo mismo. Las salidas son: sacarlo y que decida cada prenda —
se pierde la etiqueta «refacción» en el historial de listas—, o dejarlo como está.

---

## Semáforo de `/sueldos/ventas` — de dónde sale la meta de referencia (22-ago-2026, Tarea 3 F1)

**No existe ningún parámetro de "meta semanal de toda la empresa".** RN-10 es explícita: la meta
semanal se pacta **por colaborador**, vive en `sueldo_acuerdos.parametros.metaSemanal` y varía por
tienda, temporada, experiencia y turno (habitual: S/3.000 tiempo completo, S/1.500 medio tiempo).
El motor tampoco tiene una noción agregada: `liquidarPeriodo()` calcula `metaPeriodo` por un único
acuerdo a la vez.

La Tarea 3 (pantalla `/sueldos/ventas`) necesita un semáforo semanal, pero esa pantalla lista
boletas de **toda la empresa**, no de una persona. La interfaz de la tarea no decía de dónde sacar
ese número — no era un olvido menor, es que no hay ningún dato de ese tipo en el esquema.

**Se implementó así (`apps/erp-web/app/sueldos/ventas/page.tsx`):** se suman las metas **ya
pactadas** de los contratos con `estado = 'vigente'` (`parametros.metaSemanal`, ignorando los que
la tienen en `null`, es decir "sugerila por horas"). No se inventa ningún número nuevo: es la suma
de acuerdos que el administrador ya negoció y cargó en Contratos. Los acuerdos sin meta pactada no
suman — reproducir la fórmula de sugerencia (`horas de la semana × metaPorHora`) en la pantalla
habría reimplementado el motor, que es justo lo que la Tarea 2 evitó al reusar `tramosSemanales()`.

**Por qué es un piso, no el total exacto.** Si hay contratos vigentes sin meta pactada, el semáforo
sub-representa la meta real de la empresa esa semana. La pantalla avisa cuando la suma da cero
("ningún contrato vigente tiene una meta semanal pactada todavía"), pero no avisa cuando la suma es
positiva y de todos modos incompleta.

**Es de PRESENTACIÓN.** No toca `liquidarPeriodo()`: el pago de cada persona lo sigue calculando
el motor con la meta de **su propio** contrato, nunca con este total agregado.

**Pendiente de confirmar con el dueño:** si el criterio correcto es "sumar lo pactado" (lo que se
implementó) o si conviene un parámetro nuevo de `/configuracion` con la meta semanal de referencia
de la empresa, editable a mano en vez de derivado de los contratos.

---

## Insignia "comisiona" de `/sueldos/ventas` — mismo tipo de referencia, no el cálculo real (22-ago-2026, revisión final F1)

El mínimo que se muestra y que decide si una boleta lleva la insignia "comisiona"
(`sueldo_monto_minimo_comision`) es el **default de toda la empresa**, leído de `/configuracion`.
RN-13 permite que cada contrato lo pacte distinto (`sueldo_acuerdos.parametros.montoMinimoComision`).
La pantalla no cruza boleta con el contrato de su vendedor para mostrar el mínimo real de esa
persona — mismo tipo de limitación que la meta semanal de arriba: es una referencia visual rápida,
**el motor (`liquidarPeriodo()`) sigue siendo quien decide la comisión real** con el mínimo del
contrato de cada quien. La insignia puede estar "mal" en pantalla sin que el pago esté mal.

**Pendiente de confirmar con el dueño:** si conviene cruzar la boleta con el contrato del vendedor
asignado para mostrar el mínimo correcto por persona, o si la referencia general alcanza.

---

## Sueldo único (R3/T7, 23-ago-2026) — `salario_base` queda huérfana de UI

**Decisión de Alexander** (spec `docs/superpowers/specs/sueldos/2026-08-23-personal-fusion-design.md`
§2.5): el sueldo real de una persona lo paga el contrato (`sueldo_acuerdos.sueldo_pactado`), nunca
`empleados.salario_base`. Desde hoy el ERP nuevo **ya no muestra ni edita** esa columna en ningún
formulario: la pestaña Datos del expediente (`app/personal/[id]/datos/cliente.tsx`) reemplazó el
input «Salario base» por una lectura de solo lectura del contrato vigente («Sueldo (contrato
vigente): S/ X · Ver contrato» / «Sin contrato — pactarlo»), y el alta (`app/personal/nuevo/
cliente.tsx`) nunca la capturó.

**La columna NO se borra ni se congela en la base.** `salario_base` sigue viva en `empleados`, y
`EditarEmpleadoInput.salarioBase` (`lib/empleados-repo.ts`) sigue siendo un parámetro obligatorio
de la RPC `empleado_actualizar` (migración `0050`, `coalesce(p_salario_base, 0)` — mandar null la
pondría en 0 en vez de dejarla como estaba). La ficha ahora manda el valor YA guardado de la
persona, sin pasar por ningún input, para que editar el resto de los datos no la altere.

**Quién sigue leyéndola (consumidores congelados, no tocados por esta tarea):**
- `sugerirMontoPago(salarioBase, …)` — `packages/core/src/pagos.ts:12` — alimenta la sugerencia de
  monto del panel de pagos viejo (`app/pagos/cliente.tsx`) y de evaluaciones
  (`app/evaluaciones/cliente.tsx`), incluidas sus versiones montadas por persona dentro del
  expediente (`app/personal/[id]/pago/page.tsx`, `app/personal/[id]/evaluacion/page.tsx`).
- Ambos paneles siguen leyendo `empleados.salario_base` (vía `lib/colaboradores-repo.ts`,
  `lib/pagos-repo.ts` y `lib/evaluaciones-repo.ts`) para mostrar «Salario base: S/ X» como
  referencia junto a la nota.

**Pendiente, con calma:** decidir si `salario_base` se retira de la base — para eso habría que
migrar antes esos dos consumidores a leer el sueldo del contrato vigente, con el mismo criterio de
«más reciente si hay varios» que ya usa la pestaña Datos — o si se queda como un campo histórico
sin UI. No es urgente: el módulo de Pagos viejo sale del menú en R4 (spec §2.7) y su reemplazo
(Liquidación y pago) no depende de esta columna.

---

## Pagos de liquidación (0080) — defaults tomados el 23-ago-2026, pendientes del dueño

Salieron del verificador adversarial de la migración 0080, antes de aplicarla. Ninguno altera un
cálculo de sueldo: son guardas sobre el registro de lo pagado.

**Actualización 23-ago-2026:** la migración 0080 ya quedó aplicada y verificada contra `scilb`
(26 aserciones en ok, ver §2.6 de
[2026-08-23-personal-fusion-design.md](superpowers/specs/sueldos/2026-08-23-personal-fusion-design.md)).
Los defaults de la tabla siguen exactamente igual — «aplicarla» dejó de ser el paso pendiente;
lo que sigue pendiente es que el dueño confirme cada default.

| Decisión | Default tomado | Por qué | Quién confirma |
|---|---|---|---|
| Anular una liquidación que ya tiene pagos vigentes | **Se bloquea**: primero se anula cada pago con su motivo, después la liquidación | Si no, los pagos quedan colgados de una anulada y la reemisión arranca en pagado=0 — se paga dos veces el mes | Dueño |
| Métodos de pago (`sueldo_metodos_pago`) | `Efectivo, Yape, Plin, Transferencia, Otro`, editable en /configuracion | Inventado: nadie dijo cuáles usa la empresa | Dueño |
| `metodo` como texto libre, sin validar contra el catálogo | Se acepta lo que venga | Editar el catálogo no debe invalidar pagos viejos; el costo es que «Otro» y «otro » convivan | Dueño |
| `fecha` del pago sin cota | Acepta cualquier fecha | Nadie definió un rango (¿puede registrarse un pago de hace dos meses?) | Dueño |
| Liquidación con `total ≤ 0` | No admite pagos; la pantalla la marca «sin monto a pagar», nunca «pagada» | Descuentos ≥ ingresos; «pagada» exige total > 0 y saldo 0 | — (técnica) |

---

## Auditoría del 23-ago-2026 — decisiones tomadas y preguntas abiertas

Salieron de una auditoría de punta a punta del sistema, hecha antes de ponerlo en manos del equipo:
nueve agentes mapearon los flujos por módulo, otros nueve intentaron refutar cada hallazgo contra la
base viva, y lo que sobrevivió se corrigió. El detalle está en
[docs/auditoria-2026-08-23.md](auditoria-2026-08-23.md).

### Defaults que hubo que elegir para poder arreglar

| Decisión | Qué se eligió | Por qué | Quién confirma |
|---|---|---|---|
| Un día con un tramo declarado y otro sin cerrar | **Se bloquea la liquidación** y se nombra la fecha (migración 0085) | Antes se pagaba sólo el tramo cerrado, en silencio: cuatro horas de un día de once. Todos los demás caminos del sistema cortan y nombran lo que falta; éste era el único que pagaba de menos sin avisar | Dueño |
| Una marca de entrada sin salida en un día **no contratado** | No bloquea nada; esas horas no se pagan | Es lo mismo que pasaba antes. Arreglarlo pide decidir primero si una marca sin salida en un día libre es trabajo o es un error de marcación | Dueño |
| Suspender a una persona | Además de la ficha, **se le banea el acceso** y se le corta la sesión abierta (migración 0083) | El diálogo ya prometía que «deja de poder entrar al sistema» y no era verdad | — (era una promesa rota, no una decisión) |
| Suspender al último administrador activo | **Se niega** | Nadie podría volver a reactivarlo desde la aplicación: la empresa quedaría afuera de su propio sistema | Dueño |
| Sede elegida al entrar que no es de esa persona | Se cae a su sede primaria en silencio | Antes se aceptaba y el turno no se podía registrar, con un error de Postgres en inglés. La alternativa —rechazar el ingreso— castiga a quien sólo se equivocó de botón | Dueño |
| Quien es evaluado en Valores 360° | Deja de poder leer las filas que lo nombran; recibe sus puntajes por una función que no devuelve la autoría (migración 0082) | El anonimato dependía de que la aplicación no pidiera una columna. Cualquiera con su sesión podía pedirla | — (es el no-negociable 3) |
| Edge Function `auto-cierre-reportes` | **Desactivada**: responde 410 y explica por qué | Seguía respondiendo, y la clave anónima que viaja en cada página del ERP alcanzaba para invocarla. CLAUDE.md dice que el auto-cierre está apagado a propósito | Dueño |

### Preguntas que el sistema no puede contestar solo

Ninguna de estas se inventó: quedan esperando respuesta y hasta entonces el sistema hace lo más
conservador.

1. **¿Una actividad no realizada cuenta como calificación 0, o no aplica ese día?** Hoy ni siquiera
   existe como fila, así que nunca entra al divisor.
2. **¿Cómo se paga un contrato que dura varios meses?** Ver más abajo, §«Contratos de varios
   meses» — es la más grande de todas y sigue en diseño.

### Preguntas contestadas el 24-ago-2026

| Pregunta | Respuesta de Alexander | Qué cambia |
|---|---|---|
| ¿Todo el equipo debe tener acceso a las cuatro sedes? | **Sí, a propósito.** No hay problema en que lo tengan; el horario de cada contrato dice en qué sede está cada quien. El acceso a varias sedes existe porque a veces rotan de imprevisto o por necesidad, pero es temporal | Ninguno. El aislamiento por sede no aísla nada hoy y **está bien que sea así** — no es un defecto, es cómo trabaja el equipo. Se cierra sin tocar código |
| ¿La nota mensual /20 debe modificar el monto de la liquidación? | **No.** Es un indicador de rendimiento. Cuando se mida el promedio de puntajes del equipo, se le pondrá un valor en soles a cada punto que lo supere — eso vendrá después, no hoy | Ninguno todavía. Queda anotada la idea futura (ver «Bono por rendimiento sobre el promedio del equipo» más abajo) |
| ¿El crédito de un turno es del encargado o de todo el equipo? | **De todo el equipo.** Sólo los puntos extras son individuales | Migración `0091_evaluacion_equipo_y_puntualidad` — spec en [2026-08-24-equipo-y-puntualidad-design.md](superpowers/specs/evaluaciones/2026-08-24-equipo-y-puntualidad-design.md) |
| ¿La puntualidad de la nota se deriva del horario o de la carga manual? | **Se calcula sola, del horario.** | Misma migración `0091` que el punto anterior |
| ¿Cuánto debe durar la reautenticación? | **15 minutos está bien**, sin cambios | Ninguno |
| ¿Los operativos deben ver el listado de incidencias de su sede? | **Sí, pero no quién la reportó — eso lo ve sólo el administrador** | Spec en [2026-08-24-incidencias-reportante-solo-admin-design.md](superpowers/specs/almacen/2026-08-24-incidencias-reportante-solo-admin-design.md) |
| El contrato viejo de Marylin (S/ 1.953 por tres meses) | **Fue un contrato mal cargado**, error de tipeo del propio Alexander, no un defecto del sistema | Ya corregido: contrato nuevo del 1-jul al 30-sep, S/ 1.800 (S/ 600/mes). Pero la pregunta abrió una más grande — ver abajo |

### Bono por rendimiento sobre el promedio del equipo — idea futura, no construir todavía

Cuando se tenga suficiente historial, se va a medir el promedio de puntajes del equipo y, a partir
de ahí, se le va a poner un valor en soles a cada punto de nota que lo supere — así la nota /20 deja
de ser sólo un indicador y empieza a pagar algo cuando el desempeño es alto. No hay fecha ni diseño
todavía. Queda anotado para no perderlo, no para empezarlo.

### Contratos de varios meses — la pregunta más grande, todavía en diseño

**Lo que dijo Alexander, textual:** *«un contrato no se hace solo por un mes, pero tampoco implica
que el admin paga cuando todo el contrato se termine»* y *«la idea es siempre verlo mensual o
semanal (según modalidad)»*.

**Lo que eso significa para el sistema, tal como está hoy.** Un contrato (`sueldo_acuerdos`) tiene
una fecha de inicio, una de fin, una `modalidad` (mensual o semanal) y un `sueldo_pactado`. Hoy el
motor trata esas tres cosas como una sola unidad: `sueldo_entrada(acuerdo)` siempre usa el rango
completo del contrato como el período a liquidar, y `sueldo_pactado` es literalmente «lo que se
paga por todo ese rango» — de ahí sale el valor de la hora (`sueldo_pactado ÷ horas del rango
completo`). Un contrato de tres meses sólo se puede liquidar **una vez, entero**, al final.

Eso es exactamente lo que Alexander dice que no quiere: el contrato puede —y a veces conviene que
dure varios meses, por estabilidad— pero el **pago** tiene que poder salir cada mes (o cada semana,
según la modalidad), sin esperar a que el contrato entero termine.

**Lo que cambiaría, en criollo:**
- `sueldo_pactado` dejaría de ser «el total del contrato» y pasaría a ser **la tarifa del período**:
  si la modalidad es mensual, es lo que se paga POR MES, sin importar cuántos meses dure el
  contrato completo. **Corrección sobre lo que decía antes este párrafo:** con el contrato de
  Marylin que cargamos (modalidad mensual, 1-jul a 30-sep) pusimos `sueldo_pactado = 1.800`, el
  TOTAL de los tres meses — verificado contra `scilb` el 24-ago-2026, no los S/ 600 mensuales que
  esta misma sección afirmaba antes por error (no-negociable 7: eso no se verificó contra la base
  cuando se escribió). Bajo la semántica nueva ese valor queda mal: hay que corregirlo a `600` antes
  de la primera liquidación real de Marylin — ver la tarea en la spec de abajo.
- Un contrato de tres meses pasaría a tener **hasta tres liquidaciones**, una por mes, en vez de
  una sola que cubra todo el rango.

**24-ago, dos aclaraciones de Alexander que cambian el tamaño del problema:**

1. **El límite entre períodos no es el mes calendario: es el ciclo por aniversario**, la misma
   regla que ya usan las evaluaciones (fecha de ingreso → un día antes del próximo aniversario,
   recortado al último día real cuando el mes siguiente es corto — ver
   [2026-08-24-ciclo-aniversario-mes-corto-design.md](superpowers/specs/evaluaciones/2026-08-24-ciclo-aniversario-mes-corto-design.md)).
   No hay «mes a medias» que prorratear: cada período, incluido el primero, es un ciclo completo
   por aniversario. La pregunta que se le hizo sobre prorrateo estaba mal planteada — no era eso lo
   que había que resolver.
2. **El administrador casi siempre elige el período a mano**, como ya hacía en su Excel: un
   calendario con una fecha de inicio y una de fin, con el que cuenta a la vez las horas trabajadas
   (para el pago) y el desempeño (para la evaluación) de ese tramo. El cálculo automático del ciclo
   por aniversario es sólo la **sugerencia** con la que arranca ese selector — el mismo patrón que
   ya usa `evaluacion_componentes(p_empleado, p_desde, p_hasta)`, que recibe el período como
   parámetro en vez de asumirlo. Esto simplifica bastante el diseño: `sueldo_entrada` necesitaría
   el mismo tipo de parámetro (`p_desde`, `p_hasta`) en vez de tomar siempre el rango completo del
   acuerdo, no un sistema nuevo de «el acuerdo genera N liquidaciones solo».

**✅ Spec completa escrita el 24-ago-2026:**
[2026-08-24-liquidacion-por-tramos-design.md](superpowers/specs/sueldos/2026-08-24-liquidacion-por-tramos-design.md).
El mapeo del código real (no memoria) que la precedió trajo una sorpresa: **el motor
(`packages/core/src/sueldos.ts`) no necesita ningún cambio** — `liquidarPeriodo()` ya recibe
`fechaInicio`/`fechaFin` como parámetros explícitos, nunca los derivó del acuerdo. Tampoco
`sueldo_liquidaciones` (ya tiene `periodo_desde`/`periodo_hasta` propios, separados del acuerdo,
desde la migración original `0072`) ni el trigger de coherencia ni el cierre. Lo único que fuerza
hoy «todo el acuerdo de una sola vez» son dos piezas puntuales: el índice único
`uq_sueldo_liq_acuerdo_vigente` (una sola liquidación viva POR ACUERDO, sin mirar fechas) y la
firma de la RPC `sueldo_entrada(p_acuerdo uuid)` (sin parámetro de rango). Este hallazgo no estaba
en este documento hasta hoy: lo que se pensaba «un cambio en el corazón del motor» resultó ser un
ajuste acotado a dos piezas de infraestructura que ya estaba pensada para esto.

✅ **La única decisión de negocio que hacía falta (spec §2) quedó confirmada el mismo 24-ago-2026.**
Alexander, textual: *«mi idea era que en los contratos se pone cuanto se le paga semanal o
mensual... la idea es que mensualmente se pague 600, eso es todo»*. `sueldo_pactado` es la cuota de
CADA liquidación (S/600 para Marylin), no el total del contrato — el 1.800 cargado en su acuerdo
real fue una traducción mía de su respuesta anterior a la única casilla que existía en ese momento,
no una decisión suya de cobrar por el total.

✅ **C-1 a C-4, C-6 y C-7 implementados y APLICADOS el 24-ago-2026.** Migración
`0093_liquidacion_por_tramos.sql` aplicada contra `scilb` y probada con los 12 casos de
`packages/db/pruebas/0093_liquidacion_por_tramos.prueba.sql` (§5 + addendum §7): los 12 dieron
`[ok]` contra la base real. Incluye: el índice → restricción de exclusión
`sueldo_liq_periodo_sin_solape`, `sueldo_entrada` con `p_desde`/`p_hasta`, y `sueldo_liquidacion_cerrar`
corregida (C-7) para que sólo marque el acuerdo `'liquidado'` cuando el tramo que se cierra llega al
final real del contrato — sin esto, cerrar el primer tramo de tres dejaba el acuerdo inoperable.

Un `verificador` adversarial encontró 6 fallos reales antes de aplicar (dos graves: la sugerencia de
fecha del selector podía terminar liquidando un contrato vencido de un solo tramo, y el problema de
C-7 recién descrito) — todos corregidos, ver el addendum §7 de la spec. Eso sí tocó
`packages/core/src/sueldos.ts` (nueva función `finDePeriodo()`, con test): la spec original decía
que el core no hacía falta tocarlo, y era cierto para el diseño original — dejó de serlo al corregir
la sugerencia de rango de la pantalla, que necesitaba su propia aritmética de fechas.

✅ **C-5 hecho el 24-ago-2026.** `sueldo_acuerdos.sueldo_pactado` del acuerdo real de Marylin
(`720e74f8-83e2-441f-ab89-16559776cbbd`) corregido de `1.800` a `600` contra `scilb`, con la
migración ya aplicada y probada y 0 liquidaciones todavía sobre ese acuerdo (verificado antes de
tocarlo). Liquidación por tramos: **cerrado de punta a punta**, spec §6 completa.

---

## Ola B de la auditoría (23-ago-2026) — decisiones tomadas al corregir

Diez lotes más. Ninguno inventó un parámetro de negocio: lo que sigue son las lecturas que hubo que
elegir para que un arreglo fuera posible, y que conviene que Alexander confirme.

| Decisión | Qué se eligió | Por qué | Quién confirma |
|---|---|---|---|
| Peso de la etapa **Recepción** en el pipeline | `pts_recepcion = 1`, sembrado y editable desde /configuración | **No es un número elegido**: es el que la RPC venía aplicando de hecho desde la 0009 porque la clave no existía y caía a su default. Sembrarlo no cambia ningún cálculo; lo vuelve visible y editable, que es lo que pide el no-negociable 5. Falta decir si 1 es el peso correcto frente a lavado (1), planchado (3) o compostura (5) | Dueño |
| Los filtros de Personal (**«Con algo pendiente», «Listos para pagar», «Todos»**) | Significan «entre los activos» | Una persona suspendida nunca completa los cinco pasos del período: mezclarla la dejaría clavada arriba de «Con algo pendiente» para siempre. Los suspendidos tienen su propio filtro | Dueño — por si esperaba que «Todos» fuera literal |
| Días sin declarar cuando **no hay calendario contratado legible** | Se cuenta como antes, por filas | Contar cero sería peor que contar de menos: diría «no falta nada» justo antes de pagar | — (técnica) |
| Un activo **dado de baja** en inventario | Deja de borrarse físicamente: pasa a estado `baja` y **se queda en la lista** | No se pierde el rastro de una prenda que existió. El costo es que la lista se va a ensuciar con el tiempo; agregar un filtro que los oculte es una pantalla, no una regla | Dueño |
| **Cambiar el responsable de una incidencia** | Se puede, y no pide confirmación | Mueve los puntos de penalidad de una evaluación a otra: el descuento se calcula en vivo sobre `incidencias.responsable_id`. Las evaluaciones ya cerradas conservan su nota. Es reversible desde el mismo selector | Dueño |
| **Validación del retorno de lavandería** | Todas las prendas arrancan en «Bien»; la observación **no** es obligatoria cuando hay una con problema | El arranque en «Bien» replica cómo la base ya lee un ítem sin estado. No obligar la observación es deliberado: dejar a la encargada sin forma de cerrar la lista un sábado es peor que una nota vacía | Dueño |
| Vocabulario del retorno | Dos valores: `bien` y `problema` | Es lo que entiende la RPC. Categorías intermedias («no volvió», «manchada», «rota») serían un catálogo nuevo | Dueño |
| **Las ocho competencias** de la evaluación mensual | Hay que responderlas antes de guardar | Antes el formulario arrancaba con el nivel 0 —el peor de la rúbrica— pintado como si alguien lo hubiera elegido. Es el mismo criterio que ya se aprobó para Valores 360° | — (ya decidido en Valores) |
| Que los **siete pesos de la nota sumen 1** | **No se fuerza** | Es la decisión 14, todavía abierta. El catálogo dice «deberían sumar 1» y nadie lo hace cumplir: hoy suman exactamente 1,00, pero nada impide que dejen de hacerlo | Dueño |
| Parámetros **personalizados** de /configuración | Siguen sin validarse | No declaran tipo ni rango. Validarlos exige decidir si eso se guarda en la tabla `config` | Dueño |

---

## Decisión 14 — CONTESTADA el 24-ago-2026

**Los siete pesos de la nota mensual y qué pasa si no suman 100 %.**

Alexander eligió: **avisar ahora, bloquear más adelante.**

| Etapa | Qué hace el sistema | Estado |
|---|---|---|
| Ahora | La pantalla avisa: «Los pesos suman 95 %: esta nota no está sobre 20 sino sobre 19». No bloquea nada; el administrador ve el número y decide | Construyéndose (spec [2026-08-24-nota-sin-ceros-silenciosos-design.md](superpowers/specs/evaluaciones/2026-08-24-nota-sin-ceros-silenciosos-design.md)) |
| Más adelante | Configuración deja de aceptar pesos que no sumen 100 % | **Tarea pendiente**, ya no una pregunta |

La segunda etapa no se construye sola: va **junto con el rediseño de la pantalla de pesos**, para
editar los siete a la vez con el total a la vista mientras se escribe. Bloquear el guardado sobre la
pantalla actual —donde se editan de a uno— obligaría a pasar por un estado inválido para llegar al
válido, y produce una pantalla que pelea con quien la usa.

**Se descartó** que el sistema los reescale solo. Nunca fallaría, pero el administrador escribiría
20 % y el motor usaría 21 %: la pantalla mostrando un número y el motor usando otro es justo lo que
esta auditoría vino a eliminar de un sistema que termina en un pago.

**Por qué importaba.** Hoy los siete suman exactamente 100 % y nada lo sostiene. Bajar Competencias
de 25 % a 20 % y no compensar hace que alguien perfecto saque 19 en vez de 20, y que quien estaba
en 17,5 («Excelente») pase a 16,6 («Buen desempeño»). Todo el equipo baja a la vez, sin que nadie
haya trabajado peor, y ninguna pantalla lo dice.

---

## Puntos como moneda (25-ago-2026) — parámetros provisionales y las dos preguntas abiertas

Spec completa: [2026-08-25-puntos-como-moneda-design.md](superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-design.md).
Implementado en la migración `0095_puntos_como_moneda.sql` (RPC `private.evaluacion_componentes_datos`)
y `packages/core/src/evaluaciones.ts` (`notaDesdePuntos`). Ninguno de los 7 parámetros de abajo está
confirmado por el administrador: son los ejemplos textuales que él mismo marcó como provisionales en
la reunión del 25-ago-2026 (*"una cierta cantidad de puntos aún no definida (por ejemplo: 5000)"*).

### Los 7 parámetros nuevos (`config-catalogo.ts`, sección "Evaluación mensual")

| Clave | Default | De dónde sale ese default |
|---|---|---|
| `eval_puntos_promedio` | `5000` | Ejemplo textual del administrador |
| `eval_nota_promedio` | `16` | Ídem |
| `eval_puntos_excelente` | `7500` | Ídem |
| `eval_banda_riesgo` | `13` | *«<13 riesgo de despido»* |
| `eval_banda_ideal` | `18` | *«>18 ideal»* |
| `pts_actividad_cumplida` | `1` | Elegido por el implementador — el más chico que hace que una actividad cuente algo sin inflar la nota de nadie (spec §5) |
| `pts_por_sol_vendido` | **vacío** | No se inventa — ver la pregunta 2 |

Ninguno se sembró como fila de `config`: viven sólo en el catálogo de código, con el mismo `coalesce`
al default que ya usan `eval_tardanza_min_por_punto`/`sueldo_tolerancia_minutos` en la misma función.

### 🔴 Pregunta 1 (spec §3) — el techo de `sugerirMontoPago()`

Con la nota nueva sin techo en 20, alguien "sobresaliente" con más de `eval_puntos_excelente` puntos
daría un factor mayor a 1 en `sugerirMontoPago(salarioBase, notaFinal, ...)`
(`packages/core/src/pagos.ts`) — la pantalla de pago sugeriría más del sueldo pactado, sin que nadie
lo haya decidido.

**Se implementó con el factor limitado a 1,00** (interpretación del implementador, no una decisión
del administrador): la nota puede pasar de 20 para *leerse*, pero no multiplica el sueldo sola. El
administrador dijo qué pasa con alguien sobresaliente y no es un aumento automático: *"se evalúa
poder mejorar sus condiciones laborales o línea de carrera"* — es una conversación, no una fórmula.
Con la nota vieja (tope 20 de hecho) este cambio no altera ningún monto ya sugerido.

**Falta confirmar con el administrador:** si el techo en 1,00 es lo correcto, o si en algún caso sí
quiere que una nota sobresaliente aumente el pago sugerido automáticamente.

### 🔴 Pregunta 2 (spec §4) — cuánto vale un sol vendido

Textual, en la reunión: *"considerar que a veces hay personas que no hacen pipeline y solo ventas,
tenemos que ver cómo equiparar; si planchar 100 prendas vale 1000, ¿cuánto vale una venta?"*.

Es la pregunta más cara de toda la reunión: sin ella, quien sólo vende no acumula casi ningún punto
y su nota sale baja aunque venda perfecto. El administrador ya dio media ancla (*"si planchar 100
prendas vale 1000"* → 10 puntos por prenda planchada — ojo: no coincide con el `pts_planchado = 3`
que hay hoy en config, otra cosa a confirmar de paso), pero no dio la otra mitad.

**Mientras tanto:** `pts_por_sol_vendido` queda vacía a propósito (sin fila en `config`). Con la
clave vacía, las ventas suman 0 puntos y `/evaluaciones` lo dice con todas las letras («Las ventas
todavía no suman puntos: falta definir cuántos puntos vale un sol vendido»), con enlace a
Configuración — y no deja guardar la evaluación de alguien que sí tuvo ventas en el período mientras
la tasa siga vacía (`ventasSinTasa` en el RPC `private.evaluacion_componentes_datos`). Es preferible
frenar a emitir una nota que calla que alguien vendió y el sistema no lo contó.

**Falta confirmar con el administrador:** cuántos puntos vale un sol vendido.

---

### 🔴🔴 LA ESCALA ESTÁ SIN CALIBRAR, Y CON LOS DEFAULTS TODO EL EQUIPO SALE EN «RIESGO DE DESPIDO»

**Esto no salió de las notas de la reunión. Salió de medir la base real el 25-ago-2026, después de
aplicar la migración `0095`.** Es el hallazgo más importante del trabajo de ese día y hay que
resolverlo **antes** de que el administrador mire una sola nota calculada por puntos.

**Los números, medidos contra `scilb`, no estimados:**

| Qué | Cuánto |
|---|---|
| Todo el histórico de `pipeline_puntos` | **323,40 puntos**, 179 eventos, del 14-abr al 30-jun-2026 |
| Cuántas personas registraron alguna vez un avance | **2** (de once activas) |
| El mejor mes-persona registrado | **126,45 puntos** (abril 2026) |
| Filas en `sueldo_ventas` | **0** |
| Filas en `reporte_extras` | 7 |

**Qué nota da eso con la escala que quedó sembrada (5000 → 16):**

```
nota = 126,45 / 5000 × 16 = 0,40 / 20
```

La persona **más productiva del mejor mes que existe en la base** sacaría **0,40 sobre 20**, o sea
muy por debajo del corte de 13 que el administrador definió como *«riesgo de despido»*. Con estos
parámetros, el sistema le diría que **las once personas están en riesgo de despido**, todos los
meses, para siempre.

**Por qué pasa, dicho con honestidad — son dos cosas distintas y conviene no confundirlas:**

1. **Los 5000 son hipotéticos.** El administrador los dio como ejemplo y lo dijo él mismo:
   *«una cierta cantidad de puntos aún no definida (por ejemplo: 5000)»*. Nunca fueron una medición.
2. **El pipeline casi no se usa.** Sólo 2 personas registraron avances, en 2 meses. Eso no dice que
   la gente trabaje poco: dice que el módulo todavía no se adoptó (la adopción del ERP se midió en
   4,4 % en agosto). Los puntos por actividades y extras, que la `0095` recién empieza a contar, van
   a subir el total — pero de cientos a algunos cientos más, no a miles.

**Lo que NO se hizo, a propósito.** No se bajaron los defaults a ~130 para que «los números den
lindo». Sería inventar, en silencio, la vara con la que se mide a once personas — y con dos meses de
datos de un módulo que casi nadie usa todavía, cualquier número que saliera de ahí sería igual de
arbitrario que el 5000, sólo que con aspecto de medido.

**Las dos salidas, para que el administrador elija:**

- **(a) Bajar la escala** a lo que la operación real produce hoy (`eval_puntos_promedio` en el orden
  de las centenas, no de los miles).
- **(b) Subir cuánto vale cada cosa** — `pts_actividad_cumplida`, los diez `pts_*` del pipeline —
  hasta que un mes normal de trabajo se acerque a los 5000 que él tenía en la cabeza.

**Son la misma decisión mirada desde dos lados, y es exactamente la misma pregunta que «cuánto vale
una venta»:** cuánto pesa cada tipo de trabajo, unos contra otros. Por eso las tres van juntas al
administrador y ninguna se decide sin él.

**Mientras tanto, la nota por puntos no se puede leer como un juicio sobre nadie.** El mecanismo
está construido, aplicado y probado; la vara con la que mide, no.

---

## Huellero decide por horario (25-ago-2026) — parámetros provisionales y el disparador sin decidir

Spec completa: [2026-08-25-huellero-decide-por-horario-design.md](superpowers/specs/asistencias/2026-08-25-huellero-decide-por-horario-design.md).
Implementado en las migraciones `0096_huellero_decide_por_horario.sql` (C-1 horario contratado,
C-2 doble marca, y las columnas `entrada_estimada`/`salida_estimada`) y
`0097_huellero_relleno_estimado_y_falta.sql` (C-3 relleno estimado, C-4 falta automática con
freno). `packages/core/src/huellero.ts` se borró en el mismo commit que la 0096 (C-5): no tenía
llamadores fuera de sus propios tests, verificado con grep en todo el repo antes de borrarlo.

### Los dos parámetros nuevos (`config-catalogo.ts`, sección "Sueldos")

| Clave | Default | De dónde sale ese default |
|---|---|---|
| `huellero_doble_marca_minutos` | `2` | Elegido por el implementador. Es el umbral más chico que resuelve el caso que nombró el administrador (*"8:00 y 8:01, se queda el más temprano"*) sin comerse la pausa real de 15 minutos (`sueldo_pausa_minima_minutos`, sin cambios) |
| `huellero_falta_auto_max_personas` | `2` | Elegido por el implementador. Las faltas reales son individuales; las caídas del equipo son colectivas — dos personas faltando el mismo día es normal, once no lo es nunca |

Ninguno de los dos está confirmado por el administrador. Los dos son editables desde
`/configuracion` sin volver a migrar.

### 🔴 Sin decidir — quién dispara `huellero_declarar_faltas_del_dia`

C-4 (cero marcas → falta, con freno) vive en una función NUEVA y separada,
`huellero_declarar_faltas_del_dia(p_fecha date)`, no dentro de `huellero_derivar_asistencia`. La
razón: esa función es por `(empleado, fecha)` y sólo se invoca —desde `huellero_registrar_marcas`—
para quien SÍ dejó alguna marca ese día. El freno necesita lo contrario: contar, para una fecha, a
cuántas personas con turno contratado no les llegó ni una marca. Ese conteo no cabe en una función
que arranca sabiendo el empleado.

**El problema real: un día sin ninguna marca no aparece en NINGÚN lote del colector** —no hay
ninguna marca que lo mencione—, así que no existe ninguna forma de disparar
`huellero_declarar_faltas_del_dia` desde el flujo de ingesta actual. Hace falta un disparador que
mire el calendario, no las marcas. Dos caminos, y ninguno se implementó:

- **(a) Un cron diario** que, ya pasado el día (hora Perú), llame a la función para "ayer". Este
  repo tiene precedente de **no** reactivar crones sin que la regla de negocio que los rodea esté
  cerrada (el cron de auto-cierre de reportes sigue desprogramado a propósito — ver
  `docs/mapa-verificado.md` §2 y el "No tocar" de `CLAUDE.md`). Antes de programar éste hace falta
  decidir a qué hora Perú se considera "cerrado" el día (¿medianoche? ¿una hora después del cierre
  de turno más tardío?), porque correrlo temprano declararía falta a alguien que todavía puede
  marcar más tarde.
- **(b) Un botón manual** en `/asistencias/huellero` para que el administrador lo dispare él mismo,
  fecha por fecha, cuando quiera revisar un día. Más lento, pero sin el riesgo de un cron mal
  calibrado declarando faltas de madrugada.

**Se dejó la función construida, probada y seguramente segura de invocar** (guard de administrador,
`revoke`/`grant` explícitos, nunca pisa una hora u otra declaración ya cargada — probado en
`packages/db/pruebas/0097_huellero_relleno_estimado_y_falta.prueba.sql`, caso 9), pero **sin
ningún disparador conectado**. No es código muerto —el administrador ya podría invocarla a mano
por RPC si hiciera falta hoy mismo— pero tampoco corre sola todavía. Falta que el administrador
elija (a) o (b), y con qué hora, antes de que esto reemplace en la práctica al `sin_dato` de hoy.

### Detalle honesto de la pantalla

Se hizo lo mínimo verificable: `apps/erp-web/lib/asistencias-repo.ts` expone
`entradaEstimada`/`salidaEstimada` (`Asistencia` y `AsistenciaDia`), y las dos pantallas que el
encargo señaló —`/asistencias` (lista general) y `/sueldos/asistencia` (declarar asistencia)—
muestran un badge "estimado" con tooltip al lado de la hora que el sistema propuso, y bajan la
bandera sola en cuanto una persona la corrige a mano (`crearAsistencia()`/`declararDia()`, mismo
lugar donde ya se bajaba `huellero_puso_entrada`/`huellero_puso_salida`).

**Lo que NO se tocó, a propósito (en esta tarea):** el detalle de una liquidación (el recibo que ve
quien firma el pago) no mostraba todavía qué horas fueron estimadas. La spec lo pide (*"el detalle
de la liquidación la nombra, para que quien firma el pago sepa qué se estimó"*) pero era una
pantalla distinta, de zona crítica de sueldos, que no se exploró en esa tarea — tocarla a ciegas
para agregar un aviso hubiera sido ampliar el alcance sin la spec ni la lectura previa que esa zona
exige. Quedó pendiente como una tarea de pantalla acotada, con la data ya disponible en la base.

✅ **RESUELTO el 25-ago-2026 — la pieza que frenaba la 0097.** Migración `0098` (nueva, todavía sin
aplicar junto con la 0097: ver el aviso de cabecera de esa migración) hace que `sueldo_entrada`
agregue `entradaEstimada`/`salidaEstimada` a cada día de `asistencia`/`horasFueraDeContrato`
(`bool_or` agrupado por fecha — un día con dos tramos donde sólo uno está estimado sale marcado
entero, no a medias). `packages/core/src/sueldos.ts`: `RegistroAsistencia` suma esos dos campos
opcionales (no rompen ningún snapshot congelado anterior, que nunca los tuvo) y `liquidarPeriodo()`
agrega **una advertencia** nombrando las fechas — con test (`sueldos.test.ts`, describe "aviso de
horas estimadas por el sistema") que fija además que el total NO cambia ni un céntimo: esto es
metadato, no cálculo.

**Las tres pantallas del encargo original (`/sueldos/liquidaciones` vista previa y detalle, y su
comprobante) NO necesitaron ningún cambio de código.** Ya renderizaban `advertencias`/
`resultado.advertencias` de forma genérica y sin filtrar (`cliente.tsx` en la vista previa —
bloque `otrasAdvertencias` — y en el modal de detalle; `comprobante/page.tsx` en su sección
"Observaciones"), el mismo mecanismo que ya muestra, por ejemplo, "No hay ninguna venta
registrada". La advertencia nueva aparece ahí solo con que `liquidarPeriodo()` la agregue: se
verificó leyendo las tres pantallas, no se dedujo. Es la aplicación literal de "mínimo honesto: que
se vea y se entienda, no hace falta rediseñar nada" — el mismo criterio con el que `/asistencias` y
`/sueldos/asistencia` ya venían mostrando el badge "estimado" por día (ver más arriba, "Detalle
honesto de la pantalla").

Sigue pendiente, sin cambios respecto de lo anotado arriba: aplicar 0096+0097+0098 juntas (no
aplicadas todavía) y decidir el disparador de `huellero_declarar_faltas_del_dia` (cron vs. botón
manual).
