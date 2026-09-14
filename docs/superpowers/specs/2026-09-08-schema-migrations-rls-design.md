# SPEC — RLS en `public.schema_migrations`

> **Zona de rigor:** nivel 3 por ser migración (`docs/rigor-por-zona.md`), pero de alcance mínimo:
> una tabla sin uso desde la aplicación, sin datos de personas, sin regla de negocio.

## Qué se encontró

El advisor de seguridad de Supabase marca `public.schema_migrations` (ERROR): **RLS
deshabilitada**, y por default de Postgres eso deja valer los `grant` amplios que trae todo
proyecto nuevo — confirmado contra `scilb`: `anon` y `authenticated` tienen `select`, `insert`,
`update`, `delete` y `truncate` sobre la tabla. Cualquiera, sin sesión, puede hoy leer, escribir o
vaciar esa tabla vía PostgREST.

## Qué es esta tabla

17 filas, columnas `version, aplicada_en` — un registro casero de qué migración se aplicó y
cuándo, de antes de que este proyecto adoptara el tracking nativo de Supabase
(`supabase_migrations.schema_migrations`, en otro schema, que es lo que hoy lee
`mcp__claude_ai_Supabase__list_migrations`). Quedó huérfana: `grep` en todo `apps/erp-web` no
encuentra ninguna referencia, y no hay ningún script en `tools/` que la lea o escriba.

## Decisión

Activar RLS sin agregar ninguna policy — mismo patrón ya usado en
`asistencias_respaldo_0075`/`asistencias_respaldo_20260821` (tablas de respaldo con datos de
personas: RLS activa, cero policies, así que PostgREST no expone nada por default). No se
necesita policy de lectura para nadie porque nada la lee; si algún día hiciera falta reactivar el
tracking casero, se agrega la policy en esa misma migración, no antes.

No se borra la tabla ni sus 17 filas: son historia de cuándo se aplicó cada migración, y borrar
sin necesidad no es parte de este arreglo.

## Cómo se prueba

`packages/db/pruebas/0103_schema_migrations_rls.prueba.sql`: ataca la promesa exacta — que
`anon`/`authenticated` ya no puedan leer ni escribir la tabla después de la migración.
