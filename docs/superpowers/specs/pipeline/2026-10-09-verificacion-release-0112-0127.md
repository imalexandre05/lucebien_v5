# Verificación adversarial de la release 0110–0127 (PR #60) — 9-oct-2026

> **Corrección del 9-oct-2026 (verificada contra `supabase_migrations.schema_migrations` de producción,
> proyecto `scilb`).** Este registro y la conversación que lo produjo partieron de que las migraciones
> 0110–0127 estaban **sin aplicar**, porque así lo decía el checklist del PR #60. **Era falso:** en
> producción ya están registradas la 0110 (7-oct, 22:12 UTC) y de la 0111 a la 0127 (8-oct, ~00:55 UTC),
> salvo la 0123, que sigue sin aplicar a propósito (login seguro, se aplica el día del cambio de
> contraseñas). No existe 0124. Es el error que el no-negociable 7 describe: escribir «falta migrar»
> sin mirar la base. La verificación siguió siendo válida, pero se hizo **sobre código ya en producción**, y
> comprobado en vivo: `pipeline_avanzar`, `pipeline_dividir` y `pipeline_enviar` de producción
> tienen la firma con `p_operador`, son `security definer` y **no** tienen `for update`, así que la carrera
> del hallazgo 1 **existe hoy en producción**. Lo único pendiente de aplicar es la **0128**.

Qué se verificó, qué se encontró y qué decide cada hallazgo. **No es una spec de cambio**: es el
registro que pide la regla de cierre de `CLAUDE.md`, para que el resultado no viva sólo en una
conversación. Los arreglos que salgan de acá necesitan su propia spec (Zone Guard) y su número de
migración (`tools/reservar-migracion.sh`).

**Alcance:** las migraciones `0112_codigo_personal`, `0115_puntos_solo_rpc`,
`0122_seguridad_produccion` y `0127_pipeline_sin_sobrecargas`, sobre la rama `release/2026-10-07`
(commit `c9d629d`). Subagente `verificador` (Opus), sólo lectura sobre una copia de la rama.

**Cómo se probó:** Postgres 16 local con `tools/postgres-local.sh`, nunca una base remota. Base A:
0001→0127 completas y reaplicando 0112, 0115, 0122 y 0127. Base B: sobre la 0109, sólo las cuatro.
Pruebas SQL guardadas: 0112 → 52 ok, 0115 → 37, 0122 → 34, 0127 → 25, todas con 0 fallas. Las carreras
se reprodujeron con dos sesiones `psql` concurrentes. **No se corrió** `verificar-local.sh` ni los
tests de TypeScript. En el entorno local fallan 4 migraciones viejas (0022 y 0042 por `pg_cron`,
0045 y 0102) por piezas de Supabase que no se imitan; no son de esta release.

## Veredicto por migración

| Migración | Veredicto |
|---|---|
| 0112 código personal | **OK**: no se encontró cómo saltarse el token ni cómo atribuirse los puntos de otra persona |
| 0115 puntos sólo por RPC | **Con observaciones** (hallazgos 1, 2, 3, 7, 8) |
| 0122 seguridad producción | **Con observaciones** (hallazgos 4, 5) |
| 0127 pipeline sin sobrecargas | **Con observaciones** (hallazgos 5, 6). Los `DROP` coinciden uno a uno con el catálogo y deja una sola firma por RPC |

Ningún hallazgo es una regresión que bloquee en sentido estricto. **Decisión pendiente:** si la
carrera del hallazgo 1 y el borrado del hallazgo 2 —que afectan el pago— bloquean el despliegue.

## Hallazgos

«Comprobado por mí» = lo leí en el código de la copia de la rama (8-oct). Los demás los reprodujo el
verificador y no los repetí.

| # | Sev. | Dónde | Qué pasa | Estado | Arreglo propuesto |
|---|---|---|---|---|---|
| 1 | ALTA | `0115:230-232` (`pipeline_avanzar`), `:433` (`pipeline_dividir`), `:313` (`pipeline_enviar`) | La etapa se lee **sin `for update`**: dos sesiones avanzando la misma prenda a la vez dejan dos filas de historial y **un punto para cada una** por un solo movimiento real. En `dividir` salen 4 hijas y 2 huérfanas; en `enviar`, un envío fantasma. Viene de la 0086 | **Comprobado por mí**: `for update` sólo aparece en `:347`, `:392` y `:564` (rechazar, deshacer, calificar) | `for update` en esos `select`, en una migración nueva |
| 2 | MEDIA | `0115:167-174` (`pipeline_borrar_punto`, respaldo) | Al deshacer un movimiento sin puntos propios, el respaldo borra **un punto antiguo ajeno** (ej. 2 pts de hace 40 días, de un mes ya cerrado) | **Comprobado por mí**: el `delete` filtra por `historial_id is null`, etapa y `puntos > 0`, sin fecha ni dueño | Aplicar el respaldo sólo a movimientos anteriores a `historial_id`, o exigir que coincida la `fecha` |
| 3 | MEDIA | `0115` + prueba `0122` caso 6 | H-1 «sean de quien sean» más acceso por sede: un compañero deshace el último avance de otro y vuelve a avanzar la prenda, quedándose el punto; una encargada de tienda puede quitar o descontar puntos a quien procesó. **Es consecuencia de la spec, no del código** | Confirmado (código y prueba) | **Decide Alexander** (ver `pendientes-negocio.md`); luego spec |
| 4 | MEDIA | `0122:756` (`reportes_crear`) | Para quien no es admin, `p_extras` acepta un `registrado_por_id` libre; `evaluacion_componentes_datos` acredita los extras a ese id y entran a la nota /20. H14 cerró `p_encargado` pero no esto | Leí la expresión (`coalesce(nullif(e->>'registrado_por_id','')::uuid, v_actor)`); el resto de la guarda no lo releí | Para no admin, limitarlo al encargado o a los trabajadores del reporte |
| 5 | BAJA | `0122:399-401` vs `0127` | La 0127 pierde la validación de sede destino que la 0122 había agregado a `pipeline_enviar`: queda la versión de la 0115. Con una sede inexistente el usuario ve el error crudo de la clave foránea. Es la misma clase de error que la 0127 vino a corregir | **Comprobado por mí**: la validación está en `0122:399-401` y `0127` no recrea `pipeline_enviar` | Reponer la validación en la migración nueva |
| 6 | BAJA | `0122`, `0112` | Reaplicar la 0122 **sola** después de la 0127 recrea las 8 firmas viejas (la llamada sin operador queda ambigua y la vieja se salta el token); reaplicar la 0112 sola después de la 0115 desharía H-4. Sólo es idempotente reaplicando la secuencia entera 0110→0127 | Reproducido | Aplicar siempre la secuencia completa y en orden; no reaplicar una sola |
| 7 | BAJA | `hist_sel`/`hist_select`, `puntos_sel`/`puntos_select` | Quedan dos políticas de lectura por tabla; como se suman, endurecer una sola no cierra nada. Además cualquier persona de almacén lee los puntos de todos (viene de la 0006, pero con la 0117 los puntos son soles) | Confirmado | **Pregunta de aislamiento para Alexander**; después, spec |
| 8 | BAJA | `private.pipeline_registrar_punto`, `pipeline_borrar_punto`, `prenda_historial_registrar` | Tienen `grant execute to authenticated` aunque sus llamadoras son `security definer`. Si `private` llegara a exponerse por PostgREST, cualquiera podría acreditarse puntos | Confirmado | Quitar el grant en la migración nueva |

## Lo que se revisó y se descartó

- Los `DROP` de la 0127: una sola firma por RPC tras 0001→0127; ninguna llamada del ERP usa una firma borrada.
- Las RPC finales: `security definer`, `search_path = public, pg_temp`, sin ejecución para `anon` ni `public`.
- Sin escrituras directas a `prenda_pasada`, `prenda_historial` ni `pipeline_puntos` (queda sólo el insert acotado a `recepcion` de `pasada_insert`).
- `actor_pipeline` rechaza un `p_operador` nulo en una cuenta compartida; el token está atado a la sesión, vence y no se acepta a una cuenta compartida; el PIN tiene límite de intentos por persona y por sesión.
- Sin parámetros inventados en silencio: las 5 claves `codigo_*` son provisionales y están en `pendientes-negocio.md`.
- Las cuatro migraciones no tocan `packages/core`.
- `app_ve_datos_personas` (0122): las encargadas ven vacía la asistencia de otros en `/personal`; sin efecto en el pago.

## Lo que quedó fuera

- No se verificó qué devuelve `app_sedes()` para el encargado de almacén con datos reales, así que no se sabe si H14 bloquea un turno legítimo.
- De `docs/aprendizajes.md` sólo se buscaron palabras clave; no se leyó entero. De `app/**/pipeline` sólo se revisaron `actions.ts` y `pipeline-operador.ts`.
- La 0123 (login seguro) no tiene prueba SQL y **no estaba en este alcance**.

## Estado de los hallazgos tras la 0128 (actualizado el 9-oct-2026)

La migración **0128** (PR #63, rama `fix/pipeline-0128`, hacia `release/2026-10-07`) pasó dos
verificaciones y **no está aplicada en ningún lado**.

| # | Estado |
|---|---|
| 1 carrera sin `for update` | **Arreglado en la 0128** (avanzar, dividir, enviar). Carrera reproducida con dos sesiones: antes 2 movimientos y 2 puntos, ahora 1 y 1 |
| 2 respaldo de deshacer | **Arreglado en la 0128**: sólo toca puntos del mismo día de Perú. Límite aceptado y escrito en la spec |
| 3 deshacer el avance de otra persona | **Sin decidir** (pregunta 1 de `pendientes-negocio.md`) |
| 4 `registrado_por_id` de los extras | **Aplazado**: la pantalla ofrece a todo el directorio; es decisión de negocio (sección «Pregunta de la 0128» de `pendientes-negocio.md` en el PR #63) |
| 5 validación de sede destino | **Arreglado en la 0128** |
| 6 reaplicar una migración sola | **Cuidado de despliegue**, no cambia: no reaplicar una sola migración vieja; la 0128 sí se aplica sola (sólo recrea cuatro funciones) |
| 7 políticas duplicadas y lectura de puntos | **Sin decidir** (pregunta 2 de `pendientes-negocio.md`) |
| 8 grants de las funciones internas | **Aplazado**: quitarlos rompe tres casos de la prueba 0115; no empeora nada dejarlos |

La segunda verificación encontró además dos defectos que ya existían y no bloquean (interbloqueo de
`pipeline_avanzar_tanda` con ids en distinto orden; `pipeline_deshacer_division` sin `for update`),
anotados en la spec de la 0128 como «para una spec futura».

## Qué sigue

1. Alexander contesta las dos preguntas de `pendientes-negocio.md` (hallazgos 3 y 7).
2. Los hallazgos 1, 2 y 5 los arregla la 0128 (PR #63); el 4 y el 8 quedaron aplazados. Como la release ya está en producción, el hallazgo 1 (carrera que da puntos de más) **sigue activo hasta que se aplique la 0128**.
3. Aplicar **sólo la 0128** (la 0110–0127 ya están en producción, salvo la 0123), con backup previo y confirmación explícita. La 0123 sólo el día del cambio de contraseñas. Antes, comprobar qué versión del ERP está desplegada: la base ya tiene las RPC con `p_operador` y un ERP anterior las llamaría sin operador.