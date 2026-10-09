# Spec 0128 — carrera en el avance, puntos ajenos al deshacer y tres cierres menores

> Escrita el 9-oct-2026, **antes** del código (Zone Guard). Sale de la verificación adversarial de
> la release 0110–0127: [registro](2026-10-09-verificacion-release-0112-0127.md), hallazgos 1, 2, 4,
> 5 y 8. Zona crítica: pipeline → puntos → nota → pago. Va con prueba SQL y subagente verificador
> antes de mergear.

## Qué NO decide esta spec

Los hallazgos 3 y 7 del registro (quién puede deshacer el avance de otra persona, quién lee los
puntos de los demás) son **decisiones de negocio de Alexander**, anotadas en
`pendientes-negocio.md`. Esta migración **no cambia** esas reglas: H-1 («deshacer borra los puntos
del movimiento, sean de quien sean») queda tal cual. Tampoco toca la 0123 ni `packages/core`.

## Reglas de la migración

- `create or replace` con **exactamente** las firmas finales que dejó la 0127 (las de `p_operador`).
  **Prohibido crear una firma nueva**: es el error que la 0127 vino a corregir. La prueba de la 0127
  («una sola firma por RPC del pipeline») debe seguir pasando.
- Cada función recreada conserva **todo** lo que ya tenía la versión final (0112, 0115, 0122, 0127):
  `security definer`, `search_path`, grants, `private.pipeline_exigir_acceso`, token de operador, H-4,
  H-7, historial por prenda. Se parte de la definición vigente, no de una anterior.
- Reaplicable: reaplicar sola la 0128 no debe fallar ni alterar nada más.

## F1 — Las lecturas de etapa se bloquean (hallazgo 1, ALTA)

`pipeline_avanzar`, `pipeline_dividir` y `pipeline_enviar` leen `prenda_pasada` **sin `for update`**
(`0115:232`, `:433`, `:313`). Dos sesiones sobre la misma prenda ven la misma etapa y las dos avanzan:
dos filas de historial y **un punto para cada una** por un solo movimiento real; en `dividir`, 2 hijas
huérfanas; en `enviar`, un envío fantasma. Rechazar, deshacer y calificar ya bloquean (`:347`,
`:392`, `:564`).

**Regla:** esas tres lecturas pasan a `... where id = p_id for update`. La segunda sesión espera a
la primera, ve la etapa nueva y falla con la validación que ya existe (etapa no permitida), sin
punto, sin historial y sin envío. Nada más cambia en estas tres funciones salvo F5 en `enviar`.

## F2 — El respaldo de deshacer no borra puntos de otro mes (hallazgo 2, MEDIA)

`private.pipeline_borrar_punto` (`0115:151-182`) tiene un respaldo **a propósito** para puntos
anteriores a `historial_id`: si el movimiento no tiene puntos ligados, borra «el último positivo de
esa prenda en la etapa de origen». Falla cuando el movimiento **no tenía puntos por diseño** (la
tienda no cobra, H-4, o la clave `pts_*` de la etapa vale 0): el respaldo borra entonces un punto
antiguo y ajeno, incluso de un mes ya cerrado (reproducido: 2 pts de hace 40 días).

**Regla:** el respaldo sólo puede borrar un punto sin `historial_id` cuya `fecha` caiga en el **mismo
día calendario de Perú (UTC−5)** que la fecha del movimiento que se deshace, además de la misma
prenda y la etapa de origen que ya exige. La conversión a hora Perú se hace en SQL
(`at time zone 'America/Lima'`); no se hardcodea ninguna fecha de corte. Un punto de otro día **no se
toca**. El comportamiento para movimientos con puntos ligados (`historial_id`) no cambia.
*Límite que se acepta y queda escrito:* un punto antiguo sin ligar, de la misma prenda, etapa y día
que un movimiento sin puntos propios seguiría siendo candidato; con esos tres datos iguales se
considera el mismo hecho.

## F4 — Un extra no se acredita a cualquiera (hallazgo 4, MEDIA) — **APLAZADO el 9-oct-2026**

> **Estado:** no se implementa en la 0128. Al implementar se comprobó (la propia spec lo mandaba)
> que la pantalla `/reportes/nuevo` (`form.tsx:907-919`) ofrece en «¿Quién lo hizo?» a **todo el
> directorio** (`app_directorio()`: todas las sedes, incluidos inactivos), también a quien no es
> administrador. La regla de abajo rechazaría ids que el ERP manda hoy y rompería ese flujo. Es una
> **decisión de negocio** —¿una encargada puede atribuir un extra a alguien que no es del equipo del
> reporte?— anotada en `pendientes-negocio.md`. Si la respuesta es no, hace falta además limitar el
> selector al equipo. El texto de abajo se conserva como propuesta.

`reportes_crear` (`0122:756`) toma `registrado_por_id` del JSON de `p_extras` sin límite para quien no
es administrador, y `evaluacion_componentes_datos` acredita ese extra a ese id: entra en la nota /20
de otra persona. H14 cerró `p_encargado` pero no esto.

**Regla:** para quien **no** es administrador, `registrado_por_id` de cada extra sólo puede ser el
propio actor, el encargado del reporte o uno de los trabajadores que el mismo reporte registra. Otro
valor → la función **rechaza** con un mensaje claro (`PERMISO: ...`), sin crear nada. El
administrador conserva su libertad actual. Si no se envía, sigue siendo el actor.
**Antes de escribirla**, quien implemente comprueba en el ERP (`apps/erp-web`) qué ids manda la
pantalla de reportes; si la pantalla manda legítimamente otros, **se detiene y lo reporta** en vez de
adivinar.

## F5 — Se repone la validación de la sede destino (hallazgo 5, BAJA)

La 0122 (`:399-401`) validaba en `pipeline_enviar` que la sede destino exista; la 0127 dejó la versión
de la 0115, que no. **Regla:** `pipeline_enviar` vuelve a rechazar una sede vacía o inexistente con
`La sede de destino % no existe` (el mismo texto de la 0122), antes de insertar nada.

## F8 — Las funciones internas no se ejecutan desde fuera (hallazgo 8, BAJA) — **APLAZADO el 9-oct-2026**

> **Estado:** no se implementa en la 0128. Con el `revoke` aplicado, las pruebas 0115 (casos 5a, 5c
> y 6) dan FALLA porque llaman a esas tres funciones directamente como `authenticated`, y esta misma
> spec exige que la 0115 siga pasando (prueba 9): las dos cosas no caben juntas. Las RPC públicas
> funcionan sin ese permiso (lo comprobó el implementador). Dejar el grant como está **no empeora
> nada**: es el estado de la 0115 y el esquema `private` no se expone por la API. Para retomarlo hay
> que decidir primero, en una spec, cómo adaptar esos tres casos de la 0115 (por ejemplo llamarlas
> como dueño con claims). El texto de abajo se conserva como propuesta.

`private.pipeline_registrar_punto`, `private.pipeline_borrar_punto` y
`private.prenda_historial_registrar` tienen `grant execute ... to authenticated`, pero sólo las
llaman funciones `security definer`. **Regla:** se revoca el `execute` a `authenticated` (y se
mantiene a `public` y `anon` revocado). Las RPC públicas del pipeline siguen funcionando, porque
corren con los derechos de su dueño. Se comprueba con la prueba, no se supone.

## Pruebas (`packages/db/pruebas/0128_pipeline_carrera_y_puntos_ajenos.prueba.sql`)

*Alcance real de la 0128 tras el aplazamiento: F1, F2 y F5. Los casos 5 y 7 no se escriben.*

Se escriben **antes** que la migración y deben fallar sin ella:

1. F1: las definiciones de `pipeline_avanzar`, `pipeline_dividir` y `pipeline_enviar` contienen
   `for update` sobre `prenda_pasada`.
2. F1 con dos sesiones concurrentes (se corre y se registra el resultado a mano, no cabe en un solo
   script): dos avances simultáneos de la misma prenda → **un** movimiento y **un** punto.
3. F2: una tienda avanza una prenda de su sede (0 puntos por H-4) y la deshace, existiendo un punto
   antiguo sin ligar de 40 días en esa prenda y etapa → el punto antiguo **sigue ahí**.
4. F2: un movimiento antiguo con punto sin ligar del mismo día **sí** se deshace (el respaldo
   legítimo se conserva).
5. *(aplazada con F4)* F4: no admin con `registrado_por_id` ajeno al reporte → rechazo; con el propio, el encargado o un
   trabajador del reporte → pasa; admin → pasa.
6. F5: `pipeline_enviar(..., 'NOEXISTE')` falla con el mensaje de la 0122 y no deja ningún envío.
7. *(aplazada con F8)* F8: `authenticated` no puede ejecutar las tres funciones internas; las RPC públicas siguen
   funcionando para un rol de pipeline.
8. Una sola firma por RPC del pipeline (la de la 0127) y reaplicar la 0128 sola es inocuo.
9. Siguen pasando las pruebas 0112, 0115, 0122 y 0127 sobre 0001→0128.

## Fuera de alcance

**Para una spec futura** (los encontró la segunda verificación, 9-oct-2026; los dos existían antes de
la 0128 y ninguno bloquea este merge):

- `pipeline_avanzar_tanda` recibe los ids en el orden en que se hizo clic
  (`apps/erp-web/app/pipeline/tablero.tsx:486`) y bloquea cada prenda hasta el fin de la
  transacción. Dos tandas con los mismos ids en orden distinto dan interbloqueos que el
  `exception when others` traga: el resultado queda correcto (en la prueba, 40 movimientos y 40
  puntos), pero tarda (≈31 s con 40 ids) y, con un `statement_timeout` corto, se cancelan las dos.
  Con la versión de la 0115 el mismo caso daba un cobro doble (41 puntos); la 0128 lo mejora.
  Arreglo: ordenar y deduplicar `p_ids` dentro de la tanda.
- `pipeline_deshacer_division` lee la madre y las hijas sin `for update` (`0115:482`, `:510`): dos
  llamadas concurrentes dejan dos filas «Deshacer división». No afecta puntos.
- La prueba 0128 comprueba el `for update` por texto (caso 1) y la carrera con dos sesiones se corre a
  mano (caso 2): el resultado de esa corrida **después** del arreglo es una sola fila de historial y
  un punto en `avanzar`, 2 hijas en `dividir` y 1 envío en `enviar`.

Hallazgos 3, 6 y 7 del registro; la 0123; cualquier cambio en `packages/core`; el cron de auto-cierre.
Aplicar en producción es un acto aparte (backup, `tools/aplicar-migraciones.sh`, secuencia completa
0110→0128 en orden) y se hace con confirmación explícita.
