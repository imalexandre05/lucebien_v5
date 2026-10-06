# Código personal para atribuir acciones en equipos compartidos

> Spec completa (rigor nivel 3): toca la atribución de puntos del pipeline (cadena del sueldo,
> no-negociable 1), las RPC del pipeline (no-negociable 2) y la autenticación (no-negociable 3).
> Ticket: imalexandre05/lucebien-tablero (se crea con esta spec). Fecha: 04-oct-2026.

## 0. Enmienda del 06-oct-2026 (auditorías de pipeline y de seguridad)

> Fuente: `docs/auditorias/2026-10-06-pipeline.md` (H-1, H-3, H-10) y
> `docs/auditorias/2026-10-06-seguridad.md` (H2, H5), ramas `audit/2026-10-06-*`. Pedido por la
> sesión maestra del dueño el 06-oct-2026. **Esta sección manda sobre las de abajo cuando chocan.**
> Lo que aquí cambia quedó marcado en cada sección con «(enmienda 06-oct)».

**E-1. El código personal deja de ser `empleados.cod`.** Con 4 dígitos, ~18 códigos activos y un
límite sólo por sesión, la probabilidad de acertar el código de **alguien** en un día con una sola
cuenta era ≈ 56 % (auditoría de seguridad H2). Además `cod` es el usuario de login.

- Cada persona **define su propio PIN** desde su sesión personal (pantalla «Mi desempeño», que ya
  exige reautenticación). Para cambiarlo debe teclear el PIN actual. Si lo olvida, el
  administrador lo **borra** (no lo ve ni lo define) y la persona define uno nuevo.
- Sólo dígitos, **largo mínimo 6** (default provisional `codigo_pin_min_largo = 6`, comentado en la
  migración, editable en `/configuracion`, anotado en `docs/pendientes-negocio.md`). Se rechazan
  PIN triviales: todos los dígitos iguales, secuencias (`123456`, `654321`) y el propio `cod`.
- Se guarda **sólo el hash** (`crypt` + `gen_salt('bf')` de pgcrypto) en una tabla
  `codigo_pines (empleado_id pk, pin_hash, actualizado_en)` que nadie lee por PostgREST.
- En el equipo compartido se teclea **usuario (`cod`) + PIN**. El `cod` sólo identifica (no es
  secreto); el secreto es el PIN. Así el límite se puede contar **por persona** (E-2) y no hace
  falta que los PIN sean únicos (exigir unicidad revelaría el PIN de otra persona).
- Quien no definió PIN no puede operar en el equipo compartido: la base responde
  `motivo:'sin_pin'` (el intento cuenta como fallo, para que no sirva para enumerar usuarios).

**E-2. El límite de intentos vale por persona además de por sesión.** `pipeline_validar_codigo`
registra en `codigo_intentos` también el `empleado_id` al que se apuntó (el del usuario tecleado,
exista o no PIN). Responde bloqueado si en la ventana hay `codigo_max_intentos` fallos o más contra
**esa persona** (desde cualquier sesión o equipo) o desde **esa sesión** — aunque el PIN sea
correcto. Cambiar de cuenta o de equipo ya no da intentos nuevos contra la misma persona. Con PIN de
6 dígitos, 5 intentos cada 15 min por persona y 18 personas, acertar el PIN de **alguien** en un día
ronda el 0,9 % (antes ≈ 56 %). No se agrega un límite por equipo: en la PC compartida los errores de
tipeo de todos bloquearían a todos, y el límite por persona ya cubre al que prueba desde otro equipo.
Cuando una persona o una sesión quedan bloqueadas se avisa al administrador con **una** notificación
(tabla `notificaciones`; tipo `codigo_persona_bloqueada` si se bloqueó la persona, si no
`codigo_sesion_bloqueada`). Costo aceptado: alguien puede bloquear 15 minutos a otra persona
tecleando mal a propósito; el aviso al admin lo deja a la vista. Cambiar el PIN con un PIN actual
equivocado cuenta como fallo contra la propia persona (si no, sería un atajo para probar PIN sin
límite). La respuesta de fallo trae `intentos_restantes` y la pantalla los muestra (H-10).

**E-3. La exigencia del token vive en la base, no sólo en la app** (seguridad H5). Columna nueva
`empleados.cuenta_compartida boolean not null default false`: la marca el administrador desde
`/dispositivos` para la cuenta con la que se abre el equipo compartido (RPC admin
`empleado_marcar_cuenta_compartida`). Si la sesión es una cuenta compartida:

- toda RPC del pipeline con `p_operador null` **lanza** `CODIGO: esta cuenta es de un equipo
  compartido, ingresa tu código` y no escribe nada (en `private.actor_pipeline`);
- la cuenta compartida no puede definir PIN ni recibir puntos por sí misma.

En una cuenta personal (no marcada) sigue el comportamiento de hoy. Lo que la base **no** puede
saber es desde qué equipo llega una llamada: si alguien abre una cuenta **personal** en la PC
compartida, el control sigue siendo el de la server action (cookie `sci_device`). §8 queda
reemplazado por esto.

**E-4. Deshacer quita los puntos del movimiento deshecho, no los del actor** (pipeline H-1).

- `pipeline_puntos` guarda `historial_id` (el `prenda_historial` que originó el punto).
- `pipeline_deshacer` toma el **último** `prenda_historial` de la prenda y exige que
  `etapa_nueva` sea la etapa actual y que `p_etapa_anterior` sea su `etapa_anterior`; si no →
  `TRANSICION:` y no escribe nada (cierra también pipeline H-2 dentro de esta RPC, compatible con
  la 0122 de `fix/seguridad-produccion`, que exige lo mismo).
- Borra los puntos con ese `historial_id`, **sean de quien sean** (quien avanzó, no quien deshace).
  Para puntos anteriores a esta columna (`historial_id` nulo), borra el último punto positivo de esa
  prenda con `etapa = etapa_anterior` del movimiento, también sin mirar el empleado.
- El historial del «Deshacer» se atribuye a quien deshace (actor), como hoy.

**E-5. Defaults nuevos (no-negociable 5):** `codigo_pin_min_largo = 6`. Los demás no cambian
(5 intentos / 15 min / 10 min de operador / 8 h de vida máxima), pero ahora cuentan por persona
y por sesión.

**Tests nuevos exigidos (antes del código):** PIN ≠ cod (el `cod` solo ya no da token); PIN corto o
trivial rechazado; el hash no es el PIN; cambiar PIN exige el actual; admin borra PIN y un no-admin
no; 5 fallos contra una persona desde dos sesiones distintas → la persona queda bloqueada y el PIN
correcto responde bloqueado; cuenta compartida sin token → `CODIGO:` en las RPC; cuenta personal
sin token → como hoy; A avanza y B deshace → A pierde ese punto y B no pierde nada; deshacer a una
etapa que no es la del último movimiento → `TRANSICION:`.

## 1. El problema

En el sistema viejo cada persona tenía un **código de 4 dígitos** (`empleados.cod`) y lo tecleaba
antes de actuar en un equipo compartido. Verificado en el código del viejo:

| Dónde | Archivo del viejo | Qué hacía el código |
|---|---|---|
| Kanban del almacén (pipeline) | `public/js/almacen-kanban.jsx:49,107,237` | Sin código no se movía una prenda; la acción y los puntos iban a quien tecleó |
| Envío del reporte FR-01 | `public/js/app.js:1034-1055` | Firma del encargado del turno |
| Evaluar un reporte | `public/js/patches-v4.js:236`, `app.js:1329-1345` | El evaluador no puede haber estado en el turno |
| Solicitudes | `public/js/solicitudes.js:198-207,320-419` | Aprobar, rechazar, entregar, confirmar recepción |

En el sistema nuevo **el código ya no se pide en ninguna acción**. Todo se atribuye a la sesión:
`pipeline_avanzar` y sus hermanas usan `v_actor := auth.uid()` y con eso escriben
`prenda_historial.empleado_id` y **`pipeline_puntos.empleado_id`**
(`packages/db/migrations/0086_pipeline_transiciones_dividir.sql`).

Consecuencia real: en la PC del almacén, abierta con **una** cuenta, todas las prendas que mueven
varias personas suman puntos a la dueña de esa sesión. Los puntos alimentan reportes → nota /20 →
pago. **Hoy un equipo compartido le paga de más a una persona y de menos a las otras.**

Lo que el viejo hacía mal y no se copia (auditoría `docs/auditoria-legacy/03-frontend.md:371-377`,
H-05): los códigos de todos viajaban al navegador y se validaban en el cliente; no había límite de
intentos.

## 2. Alcance

**Fase 1 (esta spec, implementación ahora): pipeline.** Es donde el código decide plata.
Todas las RPC que hoy atribuyen a `auth.uid()`: `pipeline_avanzar`, `pipeline_avanzar_tanda`,
`pipeline_rechazar`, `pipeline_enviar`, `pipeline_deshacer`, `pipeline_dividir`,
`pipeline_deshacer_division`, `pipeline_calificar` (verificar la lista contra la última definición
de cada una antes de tocar).

**Fase 2 (spec aparte, después de confirmar con el dueño):** firma del reporte FR-01, evaluación
de reportes y solicitudes. Se deja fuera para que el PR sea revisable y porque el alcance exacto
es una pregunta de negocio (§7).

## 3. Cuándo se pide el código

- **Sólo en equipos marcados como compartidos.** Columna nueva `dispositivos.compartido boolean
  not null default false`. El admin la activa desde `/dispositivos` (el módulo de equipos
  autorizados ya existe, migración 0036).
- En un equipo no compartido (o sin `DEVICE_GATE`) **no cambia nada**: se atribuye a la sesión como
  hoy. Así el cambio no rompe a nadie el día que se despliega.
- Quién decide que se pide: la server action, que lee la cookie `sci_device` y consulta si el
  equipo es compartido. La base sólo valida el código que le llega (§4).

## 4. Verificación — siempre en el servidor

- El código **nunca** se descarga al navegador. Se teclea **una vez** y viaja sólo a la función
  de validación; las acciones del pipeline reciben un **token de operador**, no el código.
  (Corregido el 04-oct-2026 tras la revisión de la sesión de implementación, PR #42: la versión
  anterior permitía probar códigos llamando directo a las RPC del pipeline, porque cada fallo hacía
  `raise` y el `rollback` borraba el rastro; y el helper sin `grant` no era invocable desde RPC
  `security invoker`.)
- (enmienda 06-oct: el código pasa a ser `cod` + PIN propio con hash; ver §0 E-1/E-2.)
- `private.empleado_por_codigo(p_codigo text) returns uuid`, `security definer`,
  `set search_path = public`, **sin** `grant` (sólo la usa la función de validación, que también es
  definer). Devuelve el `empleados.id` si el código existe y el empleado está **activo**; si no,
  `null`.
- Tabla `codigo_operadores (token uuid pk default gen_random_uuid(), sesion_uid uuid not null,
  empleado_id uuid not null, device_id text, creado_en timestamptz default now(),
  expira_en timestamptz not null)`. RLS activa sin policies para `authenticated` (nadie la lee por
  PostgREST); la escriben y leen sólo funciones definer.
- RPC `pipeline_validar_codigo(p_codigo text, p_device text default null) returns jsonb`,
  `security definer`, `grant execute to authenticated`. **Es la única puerta del código:**
  0. **Equipo.** Si `p_device` no corresponde a un `dispositivos_autorizados` con estado
     `'aprobado'` y `compartido = true` (se compara en la base contra el token real del equipo, no
     contra lo que diga la app) → `{ok:false, motivo:'equipo_no_compartido'}` **sin registrar
     intento**. Así nadie puede probar códigos desde su celular ni desde un equipo personal.
     (Decidido por la sesión maestra el 04-oct-2026 tras la revisión del PR #42; a confirmar por
     Alexander.)
  1. Si la sesión (`auth.uid()`) está bloqueada por intentos → `{ok:false, bloqueado_min:N}`.
  2. Registra el intento en `codigo_intentos` (siempre, ok o no; **nunca** hace `raise` por código
     malo, así el intento queda escrito).
  2b. **Aviso al administrador.** Cuando un fallo deja a la sesión bloqueada (el que completa el
     máximo de intentos), se inserta una notificación para el rol `admin` en la tabla
     `notificaciones` del motor existente (0041/0109), tipo `codigo_sesion_bloqueada`, severidad
     `warn`, sin crear un motor nuevo ni tocar `generar_alertas()`. (Misma decisión, mismo estado.)
  3. Si el código es válido → crea fila en `codigo_operadores` con `expira_en = now() + ventana`
     y devuelve `{ok:true, token, nombre, expira_en}`; si no → `{ok:false, intentos_restantes}`.
- `private.operador_de_token(p_token uuid) returns uuid`, `security definer`, `stable`,
  `grant execute to authenticated` (mismo patrón que `app_es_admin`/`app_sedes`, migración 0037;
  el schema `private` no lo expone PostgREST). Devuelve el `empleado_id` sólo si el token existe,
  **pertenece a la sesión que llama** (`sesion_uid = auth.uid()`), no expiró y el empleado sigue
  activo; si no, `null`. Al usarlo con éxito extiende `expira_en` (ventana por inactividad).
  Como es `stable` no puede escribir: la extensión la hace la RPC del pipeline vía otra función
  definer `private.tocar_operador(p_token)`, o se descarta la extensión y el operador expira a los
  10 min del ingreso (decidir en el plan; ambas cumplen la spec).
- Cada RPC del pipeline de §2 suma un parámetro **opcional** `p_operador uuid default null`
  (el token):
  - `null` → actor = `auth.uid()` (comportamiento actual, sin cambios).
  - no nulo → actor = `private.operador_de_token(p_operador)`; si da `null` →
    `raise exception 'CODIGO: operador vencido, vuelve a ingresar tu código'`. Este `raise` ya no
    abre un ataque: sin un token emitido por la validación (que cuenta intentos) no hay forma de
    llegar aquí con un actor ajeno.
  - `pipeline_avanzar_tanda`: resuelve el token **antes** del bucle y aborta todo si es inválido
    (hoy el bucle traga excepciones por prenda; un token malo no debe convertirse en «no movió
    nada» silencioso).
  - El actor resuelto es quien recibe `prenda_historial.empleado_id` y `pipeline_puntos.empleado_id`.
  - Se guarda además **quién tenía la sesión**: columna nueva
    `prenda_historial.registrado_por uuid` (= `auth.uid()`), para auditoría.
- **Límite de intentos:** tabla `codigo_intentos (id, sesion_uid, device_id, ok, creado_en)`.
  Tras **5** fallos en **15** minutos desde la misma sesión, `pipeline_validar_codigo` responde
  bloqueado aunque el código sea correcto. Ventana de operador: **10** minutos. Los tres números
  son **defaults** (no-negociable 5): editables en `/configuracion`, comentados como default en la
  migración y anotados en `docs/pendientes-negocio.md`.
- RLS: `codigo_intentos` y `codigo_operadores` sin lectura para nadie salvo admin (intentos); la
  escriben sólo las funciones.
- Fechas: `timestamptz default now()`; las ventanas se calculan en la base (sólo intervalos, sin
  fechas de negocio en hora Perú).

## 5. Interfaz (pipeline en equipo compartido)

- (enmienda 06-oct) El diálogo pide **usuario + PIN** y muestra los intentos que quedan. El chip
  tiene área táctil de 44 px y el PIN se enmascara también en Firefox.
- Encima del tablero: chip **«Operando: — · Ingresar código»**. Se teclea el código (4 dígitos,
  enmascarado, teclado numérico en móvil). Se valida al confirmar (llama `pipeline_validar_codigo`); si es correcto el
  chip muestra **«Operando: Nombre · cambiar»** y la página guarda el token en memoria.
- El operador queda activo en esa pestaña hasta **10 minutos sin actividad** (default de pantalla,
  editable) o hasta que toque «cambiar». No se guarda en `localStorage`: sólo en memoria.
- Sin operador activo, los botones de mover piden el código antes de ejecutar.
- Errores en español neutral: «Código incorrecto», «Demasiados intentos. Espera 12 minutos».
- El nombre que muestra el chip lo devuelve la RPC (no se busca en una lista local de códigos).

## 6. Tests exigidos (antes del código)

1. SQL/integración (`tools/probar-migracion.sh` o el patrón vigente): código válido → token, y con
   ese token los puntos van al dueño del código y `registrado_por` = sesión; código inválido →
   `ok:false` y el intento **queda registrado**; empleado suspendido → rechazado (y su token deja de
   valer); 6.º intento fallido en 15 min → bloqueado aun con código bueno; token de **otra sesión**
   → rechazado; token vencido → rechazado; `pipeline_avanzar_tanda` con token malo → no mueve
   ninguna prenda y lanza error; `p_operador null` → idéntico al comportamiento actual; código
   desde un equipo no aprobado/compartido → `motivo:'equipo_no_compartido'` y sin intento
   registrado; el bloqueo de una sesión genera la notificación para el admin.
2. Unitarios del cliente: expiración del operador por inactividad, «cambiar» limpia el operador.
3. Guard: ninguna lectura nueva de `empleados.cod` desde `apps/erp-web` (agregar regla al guard si
   es viable).

## 7. Preguntas para el dueño (no bloquean la fase 1)

1. ¿La fase 2 debe pedir código en los mismos cuatro lugares que el viejo (FR-01, evaluar,
   solicitudes) o en menos?
2. ¿En un equipo **no** compartido también quieren el código (doble confirmación), o basta la
   sesión? (Esta spec asume que basta la sesión.)
3. ¿5 intentos / 15 minutos y 10 minutos de operador activo les parecen bien?

## 8. Límite conocido: la base no exige el código (reemplazado por §0 E-3, enmienda 06-oct)

Esta spec **no** obliga a nadie a usar el código. En la PC compartida, quien tenga el JWT de la
sesión puede llamar `pipeline_avanzar` y las demás RPC **sin** `p_operador` (el camino «`null` →
actor = `auth.uid()`», que existe a propósito para no romper los equipos no compartidos) y la acción
se atribuye a la dueña de la sesión. La server action sí lo exige leyendo la cookie `sci_device`,
pero esa cookie es visible en el navegador y la base no la comprueba. El código ordena el uso
honesto del equipo compartido; no es una barrera contra alguien que se salte la pantalla.

**Propuesta (no implementada; la decide el dueño):** marcar en la base la CUENTA que se usa en el
equipo compartido (p. ej. `empleados.cuenta_compartida boolean`) y que las RPC del pipeline exijan
`p_operador` no nulo cuando `auth.uid()` sea esa cuenta. Así, para esa cuenta, ya no existe el camino
sin código. (Pedido por la sesión maestra el 04-oct-2026, a confirmar por Alexander.)

También, decidido el mismo día y a confirmar por Alexander: «cambiar» **revoca** el token en la base
(`pipeline_cerrar_operador`, sólo tokens de la propia sesión) y la renovación por actividad tiene una
**vida máxima** desde la emisión del token (`codigo_operador_max_h`, default 8 h, un turno), para que
una renovación continua no deje vivo un token indefinidamente.

## 9. Fuera de alcance

- Cambiar el login (sigue usuario + contraseña con `LOGIN_V2`).
- Mostrar o editar el código desde la UI (sigue siendo dato de admin).
- Recalcular puntos ya atribuidos mal en el pasado.
