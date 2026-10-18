# Contrato y horario se guardan juntos (RPC atómica)

Fecha: 18-oct-2026. Migración: 0157. Zona: sueldos (spec completa).

## 1. Qué pasaba (verificado en `apps/erp-web/lib/sueldos-repo.ts`)

- `crearAcuerdo` insertaba el contrato y después llamaba a `guardarTurnos`. Si los turnos se
  solapaban, el contrato quedaba creado sin horario y reintentar chocaba con
  `sueldo_acuerdos_sin_solape` (el contrato ya existía).
- `actualizarAcuerdo` actualizaba el contrato y después los turnos. Si los turnos fallaban, el
  contrato quedaba con los términos nuevos y el horario viejo: se liquidaría con una mezcla que
  nadie pactó.

## 2. Regla

Una sola RPC `sueldo_acuerdo_guardar(p_acuerdo uuid, p_fila jsonb, p_turnos jsonb) returns uuid`.

- `p_acuerdo` nulo crea el contrato; con valor lo actualiza. Devuelve el id.
- Solo `private.app_es_admin()`; `security definer`; `search_path = public, pg_temp`; sin EXECUTE
  para `public`/`anon`; sí para `authenticated`.
- `p_fila` lleva las columnas ya validadas y completadas por el servidor (parámetros resueltos con
  `sueldo_parametros_vigentes` más overrides, `cada_dias` solo con modalidad `dias`). La RPC no
  decide reglas de negocio: escribe lo que el repo calcula. `creado_por` solo se usa al crear.
- Los turnos se reemplazan llamando a `sueldo_acuerdo_guardar_turnos` (0149), sin duplicar su lógica.
- Todo ocurre en una transacción: si los turnos fallan (solape, hora inválida, día fuera de 1..7),
  no queda contrato nuevo y el contrato existente conserva términos y horario anteriores. Los
  mensajes de turnos conservan el prefijo `DATO:`.
- Actualizar un contrato inexistente falla con `DATO:ese contrato no existe` (antes era un no-op
  silencioso seguido del mismo error al guardar turnos).
- Sin parámetros de negocio nuevos ni defaults inventados.

## 3. Repo

`crearAcuerdo` y `actualizarAcuerdo` hacen una sola llamada `rpc('sueldo_acuerdo_guardar', ...)`
tras resolver los parámetros. `guardarTurnos` se conserva para otros usos.

## 4. Cómo se prueba

`packages/db/pruebas/0157_acuerdo_con_turnos_atomico.prueba.sql`: crear con turnos válidos; crear
con turnos solapados no deja contrato; actualizar con turnos solapados deja términos y horario
anteriores; actualizar válido cambia ambos; no-admin rechazado; anon sin EXECUTE.
Tests de repo: una única rpc por operación, sin `insert`/`update` directos.
