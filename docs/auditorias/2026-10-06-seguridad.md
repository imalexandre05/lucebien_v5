# Auditoría de seguridad — 22 PRs en borrador (#36–#57) y estado de `main`

**Fecha:** 6-oct-2026 · **Alcance:** seguridad (RLS, SECURITY DEFINER, grants, los 4 aislamientos,
server actions, subidas, dependencias) · **Base:** `origin/main` @ `8eb4465` (producción = main +
migraciones hasta 0109).

**Método.** Sólo lectura sobre los PRs. Se armó una integración local (main + las 22 ramas, con las
migraciones 0117/0118 tomadas de su rama porque sus apps chocan) y se aplicó 0001→0120 en el
Postgres local de `tools/postgres-local.sh` (PR #44). 0110–0120 aplican **sin error**. Cada hallazgo
marcado *ejecutado* se reprodujo con `set role authenticated|anon` + `request.jwt.claims` simulado,
con personas sembradas (admin, encargado de tienda S1, dos confeccionistas de almacén, una vendedora
de S2). Nada se corrió contra producción. Lo que no se pudo ejecutar está marcado *por lectura*.

---

## Veredicto por PR

| PR | Tema | Veredicto | Motivo de seguridad |
|---|---|---|---|
| #36 | incidencias, acceso rápido | **LISTO** | Sin superficie nueva |
| #37 | asistencia día/semana/mes | **LISTO** | Sólo lectura con la RLS existente |
| #38 | enlaces de notificaciones | **LISTO** | Sin superficie nueva |
| #39 | comisión en porcentaje | **LISTO** | La acción conserva el chequeo de admin |
| #40 | adelantos al instante | **LISTO** | Chequeo de admin intacto (`NEGADO`) |
| #41 | CI de erp-web | **LISTO** | — |
| #42 | código personal (0112) | **NO LISTO** | H2 (fuerza bruta viable) y H5 (la exigencia del token vive sólo en la app) |
| #43 | declarar hasta hoy | **LISTO** | — |
| #44 | cierre exige datos actuales (0111) | **LISTO** | `sueldo_liquidacion_cerrar` exige admin (*ejecutado*) |
| #45 | puntos en día Perú (0110) | **LISTO** | — |
| #46 | evaluación recalculada en servidor | **LISTO** | Acción con `esAdmin()` |
| #47 | `reportes_evaluar` valida (0113) | **LISTO** | Definer con `search_path` fijo, sin grant a anon. No empeora H14, pero es el lugar natural para cerrarlo |
| #48 | último admin, borrar Auth, subida | **LISTO CON ARREGLOS MENORES** | H7 (guard sólo en la RPC), H11 (límite de 11 MB global) |
| #49 | docs | **LISTO** | — |
| #50 | filtro de envíos por tienda | **LISTO** | — |
| #51 | sólo RPC escriben puntos (0115) | **NO LISTO** | Trae dentro la 0112 de #42 (va apilado). Lo suyo es correcto, pero no alcanza su objetivo: H1 |
| #52 | reserva de migraciones + Semgrep | **LISTO** | Reglas propias corren limpias en la integración (3 avisos en core comercial, BAJA) |
| #53 | 360: sólo admin ve quién puntuó (0116) | **LISTO CON ARREGLOS MENORES** | H6 (despeje con k=3) |
| #54 | pago por puntos (0117) | **NO LISTO** | Convierte en soles los puntos que H1 deja fabricar. Requiere cerrar H1 antes |
| #55 | valores pactados por contrato (0118) | **LISTO** | Funciones admin-only (*ejecutado*) |
| #56 | 360 base (0119) | **LISTO CON ARREGLOS MENORES** | Va apilado sobre #53; arrastra H4 (datos_personas sin sede) |
| #57 | frecuencia de pago flexible (0120) | **LISTO CON ARREGLOS MENORES** | H12 (tabla nueva con grants por defecto a anon; la RLS la cubre) |

**Lo que está bien y conviene decirlo:** ninguna función SECURITY DEFINER de `public`/`private`
quedó sin `search_path` fijo; ninguna tabla de `public` sin RLS; ninguna RPC nueva ejecutable por
`anon` (probado: `valores_mis_puntajes`, `mi_evaluacion_mensual`, `evaluaciones_mensuales_visibles`,
`pipeline_validar_codigo`, `dispositivo_compartido`, `sueldo_parametros_vigentes` → `permission
denied`); los tokens de operador no sirven desde otra sesión ni después de cerrarlos; un empleado no
lee sueldo, nota ni votos ajenos por tabla, vista ni RPC (H4 es la excepción configurable); las RPC de
sueldo rechazan a no-admin; `getAdminClient()` sigue en los 6 archivos permitidos (las menciones en
`colaboradores/documentos/huellero/sueldos-repo` son comentarios) y #48 lo usa sólo dentro de
`empleados-repo.ts`, que está en la lista.

---

## Hallazgos

### H0 — ALTA · `main` (ningún PR lo toca) — en el ERP, la contraseña es el mismo código de 4 dígitos
**Dónde:** `apps/erp-web/lib/auth.ts:58-62`: `signInWithPassword({ email: `${cod}@…`, password: cod })`.
**Por lectura** (no se probó contra GoTrue de producción). Quien sepa o adivine el código de 4 dígitos
de otra persona entra al ERP como ella, y los cuatro aislamientos dejan de existir. Si es el código del
admin, entra con todos los permisos. El único freno es el rate limit por IP de Supabase Auth, que no
se verificó. Además, H2 y H3 giran sobre este mismo secreto. **Arreglo:** contraseña propia (o PIN de
≥ 6 dígitos) distinta del código, cambio obligatorio en el primer ingreso y revisar el rate limit de
Auth en el panel de Supabase. Es lo primero de la lista.

### H14 — ALTA · `main` (#47 reescribe `reportes_evaluar` pero no lo cierra) — reporte fabricado a nombre de otra persona
**Dónde:** `0081_reportes_escritura_directa.sql:57-62` (`reportes_crear` acepta `p_encargado`
libre y la sede que se le pase; quien llama no queda como trabajador) y `0113_evaluar_reporte_validado.sql:40-47`
(sólo excluye a quien figura en `reporte_trabajadores`).
**Ataque (*ejecutado*, con rollback):** el confeccionista c1, que es almacén y por eso escribe en
cualquier sede, llama `reportes_crear('02-09-26_S2_M','S2','M',…, p_trabajadores => [f2], p_encargado => f2)`
y después `reportes_evaluar(…, [{cod:A1, cal:0}])`. Resultado: reporte de S2 a nombre de la
vendedora f2, evaluado por c1, puntaje 0. El verificador midió además el efecto en la nota:
`evaluacion_componentes(f2)->>'operaciones'` = 0,00. Funciona al revés: dos compañeros se fabrican
reportes con nota 1 el uno al otro. Es la cadena del sueldo (no-negociable 1).
**Arreglo:** `p_encargado` sólo para admin (si no, `auth.uid()`); quien crea queda en
`reporte_trabajadores` o se guarda `creado_por` y se le impide evaluar; `app_es_almacen()` no debería
crear reportes de tiendas.

### H1 — ALTA · `main` (ningún PR lo cierra; #51 lo deja abierto, #54 lo monetiza) — fabricar puntos con dos llamadas
**Dónde:** `packages/db/migrations/0006_pipeline_rls.sql:32` (`pasada_rw` FOR ALL con
`app_es_almacen()`, que es true para `confeccionista`) + las RPC del pipeline son `security invoker`.
**Ataque (*ejecutado* en la integración, con 0115 aplicada):** como confeccionista,
`update prenda_pasada set etapa='recepcion' where id=X` (directo por PostgREST; no deja historial) y
luego `select pipeline_avanzar(X,'lavado')`. Repetido 5 veces → 5 filas en `pipeline_puntos`,
5,00 puntos. También: `insert into prenda_pasada(codigo,etapa,sede_origen_cod) values
('FAKE-1','control_calidad','AL')` y `pipeline_avanzar(…,'listo')` puntúa una prenda que no existe.
0115 sí cierra el insert directo a `pipeline_puntos`/`prenda_historial` (*ejecutado*: `permission
denied`), pero la prenda sigue siendo editable. Con #54, esos puntos entran a la liquidación vía
`private.sueldo_puntos_periodo` → `evaluacion_componentes_datos` (0117:113).
El verificador repitió el ataque y midió el efecto en el pago: `private.sueldo_puntos_periodo(c1)`
pasó de 6,00 a 8,00. Agregó una variante condicional: `private.pipeline_registrar_punto(auth.uid(), X, 'x', 999, …)`
acepta empleado y puntos libres. Sólo es explotable si `private` está expuesto en PostgREST, cosa que
no se pudo verificar en producción (ver H9).
**Arreglo propuesto (migración nueva, no aplicada):** revocar `insert/update/delete` de
`prenda_pasada` a `authenticated` y reemplazar `pasada_rw` por `pasada_sel` (FOR SELECT); mover las
escrituras de las RPC a un helper `private` definer con `pipeline_exigir_derecho` (mismo patrón que
0115), y revisar quién crea prendas hoy (`lavanderia_enviar`, inventario) para darles su RPC. Es
exactamente el no-negociable 2.

### H2 — ALTA · PR #42 / #51 (0112) — el código personal se adivina en horas
**Dónde:** `0112_codigo_personal.sql:138-143` (`empleado_por_codigo` compara contra
`empleados.cod`) y `:230-299` (límite por `sesion_uid`).
**Ataque (*ejecutado*):** 5 fallos → `bloqueado_min: 15`; la sesión de otra persona en el mismo
equipo arranca con 5 intentos nuevos (el límite es por sesión, no por equipo ni global). El código
es `empleados.cod`: 4 dígitos (`elegirCodigoLibre`, core/empleados.ts:34) y además es el usuario de
login (`{cod}@lucebien.local`) y la credencial del kanban viejo. Con 5 intentos cada 15 min = 480
por día por sesión y ~18 códigos activos en 10 000, la probabilidad de acertar **algún** código en un
día con una sola cuenta es ≈ 1 − (1 − 17/10 000)^480 ≈ **56 %** (en promedio, el primer acierto
llega en ~28 h; cada cuenta que coopere suma su propio cupo). El acierto no reinicia el contador, la
respuesta distingue acierto de fallo y devuelve el nombre de la persona. `p_device` es un texto: quien
conozca el `device_id` del equipo compartido (está en su cookie) prueba códigos desde su propio
teléfono. Con el código ajeno se le atribuyen
movimientos (y rechazos) a otra persona; el admin recibe una alerta por bloqueo, pero no por acierto.
También se acepta el código del administrador (*ejecutado*: el punto quedó a nombre del admin).
**Arreglo propuesto:** un PIN propio (no `cod`), guardado con hash, de 6 dígitos; límite también por
`device_id` y uno global por ventana; notificar al admin los aciertos tras fallos; excluir roles
admin/dueño del código.

### H3 — ALTA · `main`, sistema viejo — `/api/auth/login-code` sin límite de intentos
**Dónde:** `routes/auth.js:65-82`; `server.js` no tiene rate limit. **Por lectura** (sistema
congelado con base viva: no se ejecutó). El código de 4 dígitos es usuario y contraseña a la vez:
10 000 peticiones dan un JWT de 12 h de cualquier persona, incluido admin. Y H2 reutiliza ese mismo
secreto. **Arreglo:** pedido explícito para tocar el legacy: rate limit por IP y por código, o
retirar `/login-code`.

### H4 — MEDIA · `main` + #56 — `datos_personas` ignora la sede
**Dónde:** `0067_aislamiento_datos_personas.sql:74` (`pago_select`), la misma condición en
`asist_select`, y `0119_valores360_base.sql:158` (`evaluaciones_mensuales_publicas`).
**Ataque (*ejecutado*):** con `permisos_modulos.datos_personas = {ver}` para `encargado_tienda`, el
encargado de S1 leyó `pagos.monto = 1500` de la vendedora de S2 y la `nota_final` de dos personas de
otras sedes. Hoy el permiso viene vacío (`{}`) para todos los roles locales: es latente, pero un clic
en `/configuracion/permisos` rompe los aislamientos 1, 2 y 4. **Verificar en producción** (sólo
lectura): `select rol, acciones from permisos_modulos where modulo='datos_personas'`.
**Arreglo:** condicionar `app_ve_datos_personas()` a `empleado.sede_cod in (select private.app_sedes())`
en esas policies/funciones, y que `pagos` (sueldo) sea sólo admin o propio.

### H5 — MEDIA · PR #42 — la exigencia del token en el equipo compartido vive sólo en la app
**Dónde:** `apps/erp-web/lib/pipeline-operador.ts` (rama #42) decide «equipo compartido → exigir
token»; las RPC aceptan `p_operador = null` y entonces el actor es la sesión (*ejecutado*). Quien use
la PC compartida puede llamar a PostgREST con el JWT de la sesión abierta (o borrar la cookie
`sci_device`) y todo se acredita a la dueña de la sesión, como antes del PR. **Arreglo:** marcar en
la base la cuenta del equipo compartido (p. ej. `empleados.cuenta_compartida`) y que
`private.actor_pipeline` lance si `p_operador is null` y la sesión es esa cuenta.

### H6 — MEDIA · PR #53 / #56 — despeje de votos 360 con k = 3
**Ataque (*ejecutado*):** 3 votos (1, 5, 5) → la evaluada ve 3,67 en `valores_mis_puntajes`. Con
escala 1–5 y k=3, un promedio de 1,00 o 5,00 revela los tres votos, y basta que un votante cuente el
suyo para despejar la suma de los otros dos (aquí, 10 = 5+5). El admin puede bajar
`valores_min_evaluaciones` a 1 (0116:45 acepta ≥ 1). **Arreglo:** piso duro (≥ 3, o mejor 5) que la
configuración no pueda bajar; mostrar rangos en vez de promedio exacto cuando k sea chico. Decisión
de negocio: anotar en `docs/pendientes-negocio.md`.

### H7 — BAJA · PR #48 (0114) — el guard del último admin se salta por la API
**Ataque (*ejecutado*, con rollback):** como el único admin,
`update empleados set rol='confeccionista'` (o `activo=false`) por PostgREST pasa: `emp_admin_write`
es FOR ALL (`0002_rls.sql:36`). Quedan 0 admins. **Arreglo:** mover la regla a un trigger
`before update` en `empleados`.

### H8 — BAJA · `main` — puntos y reportes de todas las sedes visibles al almacén
`puntos_sel`/`hist_sel` (0115:58-75) y `rep_select` incluyen `app_es_almacen()`: cualquier
confeccionista lee los puntos de todos. Los puntos son insumo del pago (más aún con #54). La propia
cabecera de 0112 advierte no usar `app_es_almacen()` sobre datos de personas.

### H9 — BAJA · 0112/0115 — helpers `private` que confían en parámetros
`private.pipeline_registrar_punto(p_empleado, …)` y `prenda_historial_registrar(…, p_empleado, …)`
son definer con `grant execute to authenticated` y reciben el empleado del llamador. Hoy no son
alcanzables (PostgREST no expone `private`), pero es la única barrera. Preferible que reciban el
token y resuelvan el actor adentro.

### H10 — BAJA · `main` — funciones `private` ejecutables por `anon`/`public`
`private.pedido_garantia_resolver` y `private.tmp_fusionar_identidad` conservan EXECUTE para
`public`; `private` tiene USAGE para `anon`. No alcanzables por la API; revocar por higiene (y borrar
`tmp_fusionar_identidad` si ya cumplió).

### H11 — BAJA · PR #48 — `bodySizeLimit: '11mb'` aplica a TODAS las server actions
Sube 11× el tamaño aceptado en cualquier acción (superficie de DoS). El tipo de archivo se valida
con `archivo.type` declarado por el cliente (documentos-repo.ts:60) sin mirar los bytes. Preferible
URL firmada de subida directa (ya está en la spec) y volver al límite por defecto.

### H12 — BAJA · PR #57 (0120) — tabla nueva sin revoke explícito
`sueldo_acuerdo_cambios` hereda los grants por defecto a `anon`. La RLS la cubre (*ejecutado*: anon
lee 0 filas e insertar viola la policy), pero falta el `revoke all … from anon` del patrón 0112.
`sueldo_cambio_coherente()` (trigger) quedó en `public` y ejecutable por `authenticated`; moverla a
`private`.

### H13 — ALTA · `main` (ningún PR lo toca) — dependencias
`pnpm audit --prod` en la integración: 3 críticas, 13 altas. Las que importan: `next 14.2.35`
(erp-web) con avisos de RCE en Image Optimization (< 15.5.24), SSRF en Server Actions y DoS en App
Router; `proxy-addr` (crítica) en el Express viejo. **Por lectura**: no se probó la explotación. El
ERP usa `next/image` sólo con imágenes locales (sin `remotePatterns`), lo que reduce la de Image
Optimization. **Arreglo:** plan de subida de Next a 15.5.x (cambio mayor, spec aparte).

---

## Herramientas

- **Semgrep (reglas de PR #52)** sobre la integración: 3 hallazgos, `new Date()` en
  `packages/core/src/crm.ts:23,42` y `estadisticas.ts:19` (módulo comercial, fuera de alcance). BAJA.
- **`semgrep --config auto`**: no corrió — el proxy de la sesión devuelve 403 a `semgrep.dev`. Pendiente
  en un entorno con salida.
- **Pruebas propias de las migraciones** en la integración: 0110, 0113, 0114, 0116, 0119 pasan; 0111,
  0112, 0115 y 0120 no llegaron al final porque piden datos semilla (sedes/admin) que el script local
  no siembra — no son fallas de las migraciones.
- **Integración:** al mergear las 22 ramas chocan en app (no en SQL) #38, #43, #50, #52, #54 y #55;
  hay que resolverlas en orden.

## Orden sugerido

0. H0: separar la contraseña del código. Hasta entonces, todo aislamiento depende de que nadie
   sepa el código de 4 dígitos de otra persona.
1. Migración nueva que cierre H1 y H14 **antes** de mergear #54.
2. Rediseñar el secreto de #42 (H2, H5) antes de mergearlo; #51 va detrás.
3. H4: decidir si `datos_personas` debe existir para no-admins; si sí, con sede.
4. El resto (H6–H12) cabe en los PRs como arreglos menores o en un lote de endurecimiento.
