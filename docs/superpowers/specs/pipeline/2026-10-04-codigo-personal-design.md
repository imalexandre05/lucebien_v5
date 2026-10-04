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

- El código **nunca** se descarga al navegador. Se teclea, viaja en la llamada y se compara en la
  base.
- Función nueva `private.empleado_por_codigo(p_codigo text) returns uuid`, `security definer`,
  `set search_path = public`, sin `grant` a `anon`/`authenticated` (sólo la llaman las RPC).
  Devuelve el `empleados.id` si el código existe y el empleado está **activo**; si no, `null`.
  (Si además conviene exigir acceso a la sede de la prenda, se decide en el plan mirando cómo
  resuelve hoy `app_sedes()` las sedes de un empleado; no inventar otra fuente.)
- RPC nueva `pipeline_validar_codigo(p_codigo text) returns jsonb`, `security definer`, con
  `grant execute to authenticated`. Es **la única que registra intentos**: inserta en
  `codigo_intentos`, aplica el límite y devuelve `{ok, nombre, bloqueado_min}`. Nunca lanza
  excepción por código malo. Motivo: si el registro del intento viviera dentro de una RPC que
  después hace `raise`, el `rollback` borraría el intento y el límite nunca se alcanzaría.
- Flujo de la server action: primero `pipeline_validar_codigo`; si `ok`, llama la RPC del pipeline
  con el mismo `p_codigo`, que **vuelve a resolverlo** (no confía en el cliente ni en la llamada
  anterior) pero no registra intentos.
- Cada RPC del pipeline de §2 suma un parámetro **opcional** `p_codigo text default null`:
  - `null` → actor = `auth.uid()` (comportamiento actual, sin cambios).
  - no nulo → actor = `private.empleado_por_codigo(p_codigo)`; si da `null` →
    `raise exception 'CODIGO: código incorrecto'` y no se escribe nada.
  - El actor resuelto es quien recibe `prenda_historial.empleado_id` y `pipeline_puntos.empleado_id`.
  - Se guarda además **quién tenía la sesión**: columna nueva
    `prenda_historial.registrado_por uuid` (= `auth.uid()`), para auditoría.
- **Límite de intentos:** tabla `codigo_intentos (id, sesion_uid, device_id, ok, creado_en)`.
  Tras **5** fallos en **15** minutos desde la misma sesión, las RPC rechazan con
  `CODIGO: demasiados intentos, espera N minutos` aunque el código sea correcto. Los dos números
  son **defaults** (no-negociable 5): editables en `/configuracion`, comentados como default en la
  migración y anotados en `docs/pendientes-negocio.md`.
- RLS: `codigo_intentos` sin lectura para nadie salvo admin; la escriben sólo las funciones.
- Fechas: `creado_en timestamptz default now()`; la ventana se calcula en la base (no hay fechas de
  negocio en hora Perú aquí, sólo intervalos).

## 5. Interfaz (pipeline en equipo compartido)

- Encima del tablero: chip **«Operando: — · Ingresar código»**. Se teclea el código (4 dígitos,
  enmascarado, teclado numérico en móvil). La primera acción lo valida; si es correcto el chip
  muestra **«Operando: Nombre · cambiar»**.
- El operador queda activo en esa pestaña hasta **10 minutos sin actividad** (default de pantalla,
  editable) o hasta que toque «cambiar». No se guarda en `localStorage`: sólo en memoria.
- Sin operador activo, los botones de mover piden el código antes de ejecutar.
- Errores en español neutral: «Código incorrecto», «Demasiados intentos. Espera 12 minutos».
- El nombre que muestra el chip lo devuelve la RPC (no se busca en una lista local de códigos).

## 6. Tests exigidos (antes del código)

1. SQL/integración (`tools/probar-migracion.sh` o el patrón vigente): código válido → puntos al
   dueño del código y `registrado_por` = sesión; código inválido → excepción y cero filas nuevas;
   empleado suspendido → rechazado; 6.º intento fallido en 15 min → bloqueado aun con código bueno;
   `p_codigo null` → idéntico al comportamiento actual.
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
