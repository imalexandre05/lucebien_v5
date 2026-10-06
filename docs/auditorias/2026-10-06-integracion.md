# Auditoría de integración, tests y E2E — 22 PRs en borrador (#36–#57)

**Fecha:** 6-oct-2026 · **Área:** integración + tests + E2E (seguridad, cadena del sueldo y pipeline/evaluaciones las cubren otras tres auditorías) · **Base:** `origin/main` (`8eb4465`, migraciones hasta 0109).

Método: todo se midió ejecutándolo en una rama local de trabajo (no se pushea) con los 22 PRs mergeados, contra Postgres 16 local. Ningún PR fue tocado, no se comentó en GitHub y no se tocó producción.

## 1. Veredicto por PR (desde integración + tests + E2E)

El veredicto sólo cubre mi área. Un «LISTO» aquí no sustituye las auditorías de seguridad, sueldo y pipeline.

| PR | Veredicto | Motivo |
|---|---|---|
| #41 CI tests erp-web | LISTO | Sin conflicto. Al combinarse con #55+#57 deja CI en rojo (ver H5), pero el fallo no es suyo. |
| #45 puntos hora Perú (0110) | LISTO | Prueba 0110 pasa; reaplica sin error. |
| #44 cierre exige entrada idéntica (0111) | LISTO | Prueba 0111 pasa (incluye el caso de la entrada recalculada); reaplica sin error. |
| #42 código personal (0112) | LISTO CON ARREGLOS MENORES | Prueba 0112 pasa. Debe entrar **antes** que #50 y #51; #50 le pisa el chequeo de operador al rebasar (H3). |
| #47 reportes_evaluar valida (0113) | LISTO | Prueba 0113 pasa 8/8. |
| #48 último admin (0114) | LISTO | Prueba 0114 pasa. |
| #51 puntos sólo por RPC (0115) | LISTO | Prueba 0115 pasa; depende de #42 (la rama ya lo incluye). Texto de las funciones `pipeline_*` verificado contra 0112: no pierde el operador. |
| #53 Valores 360° sólo admin (0116) | LISTO CON ARREGLOS MENORES | Deja obsoleta la prueba `0082` (H6). |
| #54 pago por puntos (0117) | LISTO CON ARREGLOS MENORES | N+1 al cargar `/configuracion` (H7). Rompe el build al combinarse con #39 (H1). |
| #55 valores pactados (0118) | LISTO CON ARREGLOS MENORES | Prueba 0118 pasa. Su test de repo falla una vez entra #57 (H5). |
| #56 Valores 360° base (0119) | LISTO | Prueba 0119 pasa (todos los casos «ok»). Los repos que leían `evaluaciones_mensuales` directo ya usan las RPC (verificado en el código). |
| #57 frecuencia de pago (0120) | LISTO CON ARREGLOS MENORES | Prueba 0120 pasa. Choca con #55 (conflicto resuelto a mano) y deja rojo un test de #55 (H5). |
| #36 incidencia en barra | LISTO | Sin conflicto con ningún otro. |
| #37 asistencia día/semana/mes | LISTO CON ARREGLOS MENORES | Conflicto lógico con #43 (H4). |
| #38 notificaciones → enlaces | LISTO | Conflicto trivial con #36 en `topbar.tsx`. |
| #39 comisión en porcentaje | **NO LISTO** | No se puede combinar con #55: el formulario de contrato se reescribió dos veces (H2). Hay que rebasarlo sobre #55. |
| #40 adelantos rendimiento | LISTO | Sin conflicto. |
| #43 declarar hasta hoy | LISTO CON ARREGLOS MENORES | Rebasar sobre #37 y conservar la intersección «rango visible ∩ hasta hoy» (H4). |
| #46 guardar evaluación recalculada | LISTO | Sin conflicto; tests del core en verde. |
| #49 docs principio de producto | LISTO | Sólo documentación. |
| #50 filtro de envíos | LISTO CON ARREGLOS MENORES | Rebasar sobre #42 y reponer el operador (H3). |
| #52 reserva de migraciones + Semgrep | LISTO | Conflicto trivial con #41 en `ci.yml`. Semgrep corre y no encuentra nada nuevo (H11). |

**Orden de merge recomendado:** #41 → #45 → #44 → #42 → #47 → #48 → #51 → #53 → #56 → #54 → #55 → #57; luego #36 → #38; #37 → #43; #42 → #50; #41 → #52; #46, #40, #49 en cualquier punto; **#39 al final, rebasado**.

## 2. Hallazgos

Severidad: BLOQUEA / ALTA / MEDIA / BAJA. Ninguna corrección se aplicó a los PRs.

### H1 — BLOQUEA · #54 × #39 · el build no compila al combinarlos (sin conflicto textual)
- `apps/erp-web/app/configuracion/cliente.tsx` (tarjeta `TarjetaPagoPorPuntos`, la línea que renderiza `<ParametroFila …/>`).
- #39 hace obligatorias las props `invalido` y `onInvalido` de `ParametroFila`. #54 añade una tarjeta que usa `ParametroFila` sin ellas. Git mergea sin conflicto, pero el typecheck falla: `TS2739: … is missing the following properties … invalido, onInvalido`. `next build` hace typecheck, así que el deploy se cae.
- Verificado: `verificar-local.sh` paso 2/3 en rojo hasta pasar las props; luego «sin errores de tipos» y `pnpm build` OK.
- Arreglo: el PR que entre segundo pasa `invalido={i.clave in invalidos}` / `onInvalido` a la tarjeta (hay que subir `invalidos` y `marcarInvalido` como props). En la rama local puse `invalido={false} onInvalido={() => {}}`, que **desactiva** la validación numérica en esos dos campos: sirve para compilar, no como arreglo.

### H2 — ALTA · #39 × #55 · conflicto de lógica sin resolución mecánica
- `apps/erp-web/app/sueldos/acuerdos/cliente.tsx`: 6 hunks (lista `PARAMETROS`, `leerBorrador`/`borradorNuevo`, badges de «valores propios», el `<input>`, el botón «Volver a los globales/de Configuración»). #55 deja campos `type="number"` alimentados por `vigentes`; #39 los cambia a texto libre con `unidad: 'porcentaje'`.
- En la integración dejé la versión de #55: **se pierde la UI de comisión en porcentaje de #39**. Los demás archivos de #39 (`config-catalogo.ts`, `config-repo.ts`, `configuracion/cliente.tsx`) sí se combinaron.
- Riesgo de fondo (no verificado, por eso no es BLOQUEA): con #55 el contrato guarda **su propia copia** de `pctComision`. Si #39 se rebasa mal y el formulario escribe «1.5» en vez de la fracción 0.015, queda guardado un 150 % congelado en el contrato. Una vez guardado ya no sigue a Configuración.
- Arreglo: rebasar #39 sobre #55 (ya mergeado) conservando `parametrosDeContratoNuevo`/`vigentes` y aplicando la conversión `porcentajeAFraccion` en el punto donde #55 arma `parametros`. Añadir un test de repo: formulario «1,5» → contrato guarda `0.015`.

### H3 — ALTA · #42 × #50 · un merge «obvio» borra el control de operador en envíos
- `apps/erp-web/app/pipeline/envios/cliente.tsx` y `page.tsx`. #50 reescribe la pantalla; #42 le había añadido `useOperador`/`compartido` y el token en `calificarPrenda`.
- Si se resuelve con «la versión de #50», `calificarPrenda` se llama sin token. Según la prueba 0112 (caso 8) sin token el actor pasa a ser `auth.uid()`: en un equipo compartido los puntos de la recepción se atribuyen a la cuenta del equipo y no a quien recibió. Eso toca la cadena del sueldo.
- Resuelto en la integración reponiendo `useOperador`, `conOperador`, `operadorRechazado`, `renovar`, `chip`, `dialogo`, el aviso de error y `compartido` desde `page.tsx`. Typecheck y build pasan; **la pantalla no se ejercitó con un operador real** (ver §5).
- Arreglo: rebasar #50 sobre #42 con ese mismo resultado y añadir un test que falle si `calificarPrenda` se llama sin token cuando `compartido` es true.

### H4 — ALTA · #37 × #43 · se puede perder la protección «sólo hasta hoy»
- `apps/erp-web/app/sueldos/asistencia/cliente.tsx`. #37 acota el botón «Declarar … como trabajados» a los días visibles; #43 lo acota a hoy. Quedarse con la versión de #37 reabre el hueco de #43: declarar como trabajado un día futuro, que se paga.
- Resuelto en la integración con la intersección `soloHastaHoy(sinDeclararVisibles, hoyPeru())`. En `packages/core/src/sueldos.test.ts` el merge también chocó (imports y bloques de tests al final): se conservaron ambos.
- Arreglo: rebasar #43 sobre #37 con esa intersección y un test del botón con rango que incluya días futuros.

### H5 — MEDIA · #55 × #57 · un test de #55 queda rojo tras #57 (CI rojo, verificado)
- `apps/erp-web/lib/__tests__/sueldos-repo.crear.test.ts` («actualizarAcuerdo — completa la clave que falta»): `TypeError: sb.from(...).select is not a function`.
- Causa: #57 hace que `actualizarAcuerdo` llame antes a `obtenerAcuerdo` (`sueldos-repo.ts:365`, lectura real de la fila), y el mock de #55 sólo soporta `update`. #41 corre estos tests en CI, así que el segundo en mergear lo verá rojo.
- Arreglo: el mock debe responder `select().eq().maybeSingle()` devolviendo un acuerdo sin cambios de frecuencia. Es un arreglo de test, no de código.

### H6 — MEDIA · #53 · prueba `0082` obsoleta
- `packages/db/pruebas/0082_aislamiento_notas_valores_respaldo.prueba.sql`: «[FALLA] la funcion le devolvio 0 puntaje(s) en vez de 1».
- Pasa en `main` y falla en la integración. La migración 0116 cambió a propósito la regla (mes en curso oculto, mínimo de 3 votos) y la prueba vieja sigue esperando el voto propio del mes en curso. La prueba nueva `0116` ya cubre la regla nueva, así que no es un bug de código sino un test sin actualizar.
- Por Zone Guard, primero la spec: confirmar con Alexander que la regla nueva reemplaza a la de 0082 y luego actualizar la prueba en un commit aparte.

### H7 — MEDIA · #54 · N+1 al abrir `/configuracion`
- `apps/erp-web/lib/evaluaciones-repo.ts:209`: `Promise.all(gente.map(e => componentesEvaluacion(e.id, desde, hoy)))`. Son una RPC `evaluacion_componentes` por persona (≈ 17 con 18 empleados), en paralelo, cada vez que el administrador abre la pantalla, sólo para mostrar un promedio informativo.
- No lo cronometré contra una base con datos reales. A esta escala no es un fallo, pero cada RPC hace varias consultas.
- Arreglo: una RPC de promedio por rango (admin-only) o cachear el cálculo (`unstable_cache`, 1 h).

### H8 — BAJA · `/configuracion` en 390 px
- Desborda horizontalmente: el texto `· default: efectivo:Efectivo,yape:Yape,…` mide 436 px (la página completa 483 px). Además 63 `<input type="number">` sin `<label>` ni `aria-label` (accesibilidad).
- **No comparé contra `main`**: lo más probable es que ya existiera (esa fila no la toca ningún PR), pero no lo verifiqué. Arreglo: `break-words` en el span de default y `aria-label={item.etiqueta}` en el input de `ParametroFila`.

### H9 — BAJA · #50 · intersección con el rango de fechas
- `listarEnviosRecibidos` filtra por `envios_prendas.fecha` pero ordena por `prenda_pasada.fecha_actualizado`. No es un fallo, sólo una asimetría que conviene entender: dentro del rango, el orden no es por fecha de envío. No se verificó con datos.

### H10 — Informativo · rendimiento SQL
- Con 20 000 prendas recibidas y 5 000 envíos: la consulta de recibidas con filtro de sede y rango tarda 5,6 ms (seq scan + top-N); la de «en camino» usa `idx_pasada_etapa` y 0,03 ms. Sin índice faltante a esta escala. Si el historial supera ~200 000 filas, añadir `(etapa, fecha_actualizado desc)` en `prenda_pasada`.
- 0110 sigue usando `(fecha at time zone 'America/Lima')::date`, que no usa índice sobre `fecha`; igual que antes con `fecha::date`. Sin regresión.
- Las tablas nuevas (`codigo_intentos`, `codigo_operadores`, `sueldo_acuerdo_cambios`) traen su índice.

### H11 — Semgrep (#52)
- Instalé Semgrep y corrí `.semgrep/sci-lb.yml` sobre la integración: 3 hallazgos, todos de la regla «el core no llama `new Date()`», en `packages/core/src/crm.ts` (líneas 23 y 42) y `estadisticas.ts` (línea 19). Ninguno es nuevo: con `--baseline-commit origin/main` sin diferencias. Es la deuda conocida, no una regresión.
- No corrí los paquetes `p/typescript`, `p/nextjs` y `p/secrets` del CI (necesitan descargar reglas de semgrep.dev).

## 3. Merges (paso 1)

Todos los PRs mergean; 6 tuvieron conflicto textual. «Resuelto» = resolución propuesta, aplicada sólo en la rama local.

| PR | Archivos en conflicto | Qué choca | Resolución |
|---|---|---|---|
| #54 (vs #42/#55) | `lib/config-catalogo.ts`, `app/configuracion/cliente.tsx`, `app/mi-desempeno/page.tsx`, `tools/postgres-local.sh` | #42 y #54 añaden claves al final del catálogo; #54 renderiza tarjeta propia mientras #55 añade una nota en «Sueldos»; en Mi desempeño, condición `enCalculo` (#56) frente al aviso de puntos (#54). `postgres-local.sh` es add/add idéntico, sólo cambia el modo. | Ambos en cada hunk; el aviso de #54 antes de la condición de #56. Resuelto. |
| #57 | `app/sueldos/acuerdos/cliente.tsx`, `lib/sueldos-repo.ts` | #55 añade `OPC_META_FIJA` y el borrador con `parametrosDeContratoNuevo`; #57 elimina `OPC_MODALIDAD` y añade `cadaDias` al borrador. Imports del repo. | `{ ...VACIO, ...b, parametros: … }`; imports de ambos. Resuelto. |
| #38 | `components/shell/topbar.tsx` | #36 añade el enlace de incidencia justo donde #38 cambia `NotificacionesBell`. | Ambos. Resuelto. |
| #39 | `app/sueldos/acuerdos/cliente.tsx` (6 hunks), `app/configuracion/cliente.tsx`, `lib/config-catalogo.ts`, `lib/config-repo.ts` | Ver H2. | Parcial: el formulario de contrato queda con la versión de #55. |
| #43 | `app/sueldos/asistencia/cliente.tsx`, `core/src/sueldos.test.ts` | Ver H4. | Intersección. Resuelto. |
| #50 | `app/pipeline/envios/cliente.tsx`, `page.tsx`, `core/src/index.ts` | Ver H3. `index.ts`: exports de `rangos-fecha` y `envios`. | Versión de #50 + operador de #42. Resuelto. |
| #52 | `.github/workflows/ci.yml` | #41 añade un paso de tests; #52 añade el job Semgrep. | Ambos; YAML válido. |

Dos errores míos al mergear, ya corregidos: un bloque sin cerrar en `sueldos.test.ts` (#43) y la props de `ParametroFila` (H1). Aparecieron en `verificar-local.sh` y los resolví en la rama local.

## 4. Funciones SQL redefinidas (paso 2)

Tabla función → migraciones que la redefinen, sólo las que tocan 0110–0120. Para cada par consecutivo comparé el cuerpo línea a línea (qué se quitó y qué se añadió) y corrí las pruebas sobre la integración.

| Función | Migraciones | ¿Se pierde algo? |
|---|---|---|
| `pipeline_avanzar`, `_dividir`, `_enviar`, `_rechazar`, `_calificar`, `_deshacer`, `_deshacer_division` | …, **0112**, **0115** | No. 0115 reemplaza los `insert`/`delete` directos de 0112 por `private.prenda_historial_registrar` / `pipeline_registrar_punto` / `pipeline_borrar_punto` y **conserva** `private.actor_pipeline(p_operador)` y `registrado_por`. Pruebas 0112 y 0115 en verde. |
| `pipeline_avanzar_tanda` | 0011, 0112, 0115 | No (0115 no cambia el cuerpo). |
| `lavanderia_enviar` | 0066, 0115 | No: el historial pasa por el helper. |
| `evaluacion_componentes` | …0067, **0116** | No: 0116 envuelve el resultado y oculta `valores`; 0119 no la redefine. |
| `valores_mis_puntajes` | 0082, 0116 | Cambia a propósito (promedio de ≥ 3 votos, mes cerrado). Deja obsoleta la prueba 0082 (H6). |
| `sueldo_entrada` | …0093, 0098, **0117** | No: 0117 sólo añade `puntosPeriodo` y lee la configuración. 0118 y 0120 **no** la redefinen. |
| `sueldo_liquidacion_cerrar` | 0073, 0093, **0111** | No. |
| `reportes_evaluar` | …0081, **0113** | No: sólo añade validaciones. |
| `empleado_actualizar` | 0050, **0114** | No: sólo añade la guarda del último admin. |
| `est_productividad` | 0040, **0110** | Una línea cambia a propósito (día de Perú). |
| `evaluaciones_mensuales_visibles`, `mi_evaluacion_mensual`, `sueldo_parametros_vigentes`, `sueldo_cambio_coherente`, `dispositivo_compartido`, `pipeline_cerrar_operador`, `pipeline_validar_codigo` | una sola | — |

Resultado: **ninguna migración posterior pisa el cambio de una anterior.** Las únicas funciones con dos redefiniciones dentro del lote son las `pipeline_*` (0112 → 0115), y la segunda parte de la primera. Limitación: la comparación es textual de funciones `create [or replace] function`; no cubre políticas, triggers ni `grant`/`revoke` (esas se ejercitan en las pruebas, que pasan).

Los números 0110–0120 son únicos entre las ramas (el guard «Migraciones — números únicos» pasa).

## 5. Base de datos (paso 3)

- **0001→0120 sobre Postgres 16 limpio:** 7,5 s. 5 migraciones con error, **las mismas 5 que en `main`** (verificado en un clúster aparte con 0001→0109): `0022` y `0042` (`pg_cron` no existe en el clúster local), `0045` y `0049` (falta el esquema `auth` real) y `0102` (espera datos de producción). Ninguna es del lote 0110–0120 y ninguna la tocó un PR.
- **Idempotencia:** 0110–0120 se reaplican sin error (11/11).
- **Pruebas de los PRs** (0110 a 0120): **11/11 pasan** una vez cargados los datos mínimos (sedes y 4 empleados; sin ellos 5 se detienen con «necesita al menos…», que es de la prueba, no del PR).
- **Todas las pruebas del repo** (32 archivos), comparadas con `main`: el conjunto de rojos de la integración está contenido en el de `main` salvo `0082` (H6). Los rojos de `main` (`0085`, `0102`, `0105` y varios «no llegó al final») dependen de datos/auth del entorno local: `0085` llama a `sueldo_entrada(uuid)`, firma que ya no existe desde 0093, por lo que está obsoleta desde antes.

## 6. Tests, typecheck y build (paso 4)

| Paso | Resultado | Tiempo |
|---|---|---|
| `pnpm install --frozen-lockfile --force` | OK (ensucia 104 archivos del `node_modules` versionado; ya documentado en `verificar-local.sh`) | 15 s |
| `bash tools/verificar-local.sh` completo | guard: «Sin violaciones nuevas»; typecheck OK (tras H1); core 25 archivos / **484 tests OK**; erp-web 12 archivos / **91 de 92 OK** | 22 s |
| Rojo | `sueldos-repo.crear.test.ts` (H5) | |
| `pnpm build` (erp-web, env ficticio) | OK, sin errores; «First Load JS shared» 87,5 kB; rutas nuevas `/sueldos/acuerdos` 136 kB, `/sueldos/asistencia` 131 kB, `/pipeline/envios` 119 kB | 2 min 07 s |
| Semgrep | 3 hallazgos preexistentes (H11) | ~1 min |

No construí `main` para comparar el tamaño del bundle: **no puedo decir si cambió mucho**; el absoluto es razonable.

## 7. E2E / QA (paso 5)

**Lo que no se pudo hacer.** No hay Supabase local con auth (ni `supabase` CLI ni Docker en este entorno). Por eso no se probó ningún flujo con datos reales: entrar con usuario, guardar un contrato, liquidar, cerrar, calificar un envío, el código personal. Las pruebas de `apps/erp-web/e2e/*.spec.ts` que necesitan sesión real tampoco corrieron.

**Lo que sí.** Levanté `next start` con un mock mínimo de GoTrue/PostgREST (`/auth/v1/user` devuelve un administrador; las consultas devuelven vacío) y una cookie de sesión falsa. Chromium + Playwright, 14 rutas × 2 tamaños (1280 px y 390 px):

- Las 14 rutas responden 200 y dibujan su `<h1>` (Contratos, Declarar asistencia, Liquidaciones, Incidencias, Asistencias, Envíos a tienda, Pipeline, Configuración, Mi desempeño, Evaluaciones, Personal). Sin imágenes sin `alt`, sin botones sin nombre.
- Errores de consola: sólo respuestas 400 de mi mock y el WebSocket de realtime (no existe en el mock). Ningún `pageerror` de la aplicación.
- Sin desborde horizontal en 390 px salvo `/configuracion` (H8).
- `/incidencias?nueva=1` (#36): carga y quita el parámetro; 2 campos sin etiqueta. **Con el mock vacío no pude comprobar que el formulario se abra.**
- `/sueldos`, `/mi-desempeno`, `/evaluaciones` y `/personal` muestran «Verificación requerida / Confirma que eres tú»: es la reautenticación, no un fallo.
- El menú lateral sale casi vacío porque el mock no devuelve permisos; no es un defecto de la app.

Capturas (24) en `docs/auditorias/capturas/` (`<ruta>-pc.png` y `<ruta>-cel.png`): contratos, asistencia, liquidaciones, incidencias, envíos, pipeline, evaluaciones, mi desempeño, personal y asistencias. Muestran estados vacíos, no datos. Quité `/configuracion` (imágenes de 20 000 px de alto) y `/login` (con sesión falsa redirige al dashboard).

**Cómo cubrir lo que falta:** una rama de Supabase (`create_branch`) sólo para E2E, con las migraciones hasta 0120, un administrador y un colaborador con contraseña conocida (`auth.setup.ts` ya espera esas credenciales), y datos mínimos (3 empleados, 1 contrato con turnos, 2 prendas enviadas). Con eso, `pnpm --filter erp-web test:e2e` cubriría los 4 flujos críticos de esta tanda: contrato con valores pactados (#55+#39), cambio de frecuencia (#57), declarar asistencia con rango (#37+#43) y envíos con operador (#42+#50). Alternativa sin red: el CLI de Supabase en una máquina con Docker.

## 8. Qué no verifiqué

- Seguridad, cadena del sueldo y lógica de pipeline/evaluaciones más allá de lo que ejercitan las pruebas SQL existentes (otras auditorías).
- Cualquier flujo autenticado con datos reales (§7).
- El comportamiento de la UI de comisión en porcentaje (#39) integrada con #55 (H2): quedó fuera de la rama local.
- Comparación con `main` de bundle y accesibilidad (H8).
- Tiempos con volumen real de datos (H7, H10 son a escala de 20 000 filas).
