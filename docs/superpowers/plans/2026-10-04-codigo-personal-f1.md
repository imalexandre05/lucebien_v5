# Plan — Código personal, fase 1 (pipeline)

Spec: `docs/superpowers/specs/pipeline/2026-10-04-codigo-personal-design.md`. Rama `feat/codigo-personal`.
Cada paso termina con `bash tools/verificar-local.sh` en verde y su propio commit.

1. **Inventario (sin escribir código).** Última definición de cada RPC de §2 de la spec
   (`grep -l "function pipeline_" packages/db/migrations/*.sql`, la de número mayor manda). Anotar
   en el PR la lista final y su firma actual. Confirmar cómo resuelve `app_sedes()` las sedes.
2. **Reservar migración:** `bash tools/reservar-migracion.sh codigo-personal`, commitear y pushear la
   reserva sola (`chore(migration): reserva NNNN`).
3. **Tests primero** (commit de tests): casos de §6.1 como script SQL de prueba siguiendo el patrón
   vigente del repo (`tools/probar-migracion.sh` / `tools/pruebas/`), y §6.2 en vitest.
4. **Migración** (idempotente, `create ... if not exists`, `alter` envuelto):
   `dispositivos.compartido`, `prenda_historial.registrado_por`, `codigo_intentos` + RLS,
   parámetros default de intentos/ventana en la tabla de configuración vigente (comentados como
   default), `private.empleado_por_codigo`, `pipeline_validar_codigo`, y `create or replace` de
   cada RPC con `p_codigo text default null` **conservando el cuerpo actual** salvo la resolución
   del actor y `registrado_por`. Cuidado: cambiar la firma crea una sobrecarga; hacer `drop function
   if exists <firma vieja>` antes, y re-otorgar los `grant` que tuviera.
5. **Repo + server actions:** `pipeline-repo.ts` pasa `p_codigo` opcional; la action lee la cookie
   `sci_device`, consulta si el equipo es compartido y, si lo es, exige código (validar con
   `pipeline_validar_codigo` antes de mover).
6. **UI:** chip de operador en el tablero (spec §5), sólo si el equipo es compartido; toggle
   «Equipo compartido» en `/dispositivos` (sólo admin).
7. **Docs:** `docs/pendientes-negocio.md` (los 3 defaults), `docs/mapa-verificado.md` (estado del
   pipeline), `docs/INDEX.md` si corresponde. Nada aplicado a producción.
8. **Verificador** (subagente) sobre todo el PR antes de marcarlo listo.

No se aplica la migración en producción: la aplica el dueño después de revisar.
