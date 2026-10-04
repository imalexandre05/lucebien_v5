# Código personal para atribuir acciones en equipos compartidos

> Spec completa (rigor nivel 3): toca la atribución de puntos del pipeline (cadena del sueldo,
> no-negociable 1), las RPC del pipeline (no-negociable 2) y la autenticación (no-negociable 3).
> Ticket: imalexandre05/lucebien-tablero (se crea con esta spec). Fecha: 04-oct-2026.

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

## 8. Fuera de alcance

- Cambiar el login (sigue usuario + contraseña con `LOGIN_V2`).
- Mostrar o editar el código desde la UI (sigue siendo dato de admin).
- Recalcular puntos ya atribuidos mal en el pasado.
