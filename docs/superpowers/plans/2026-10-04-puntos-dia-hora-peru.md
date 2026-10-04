# Plan — Puntos por día en hora Perú

Spec: `docs/superpowers/specs/sueldos/2026-10-04-puntos-dia-hora-peru-design.md`.

## Inventario verificado (grep sobre `packages/db/migrations` + tipos en los `create table`)

Columnas `timestamptz` relevantes: `pipeline_puntos.fecha` y `prenda_historial.fecha`
(`0001_init.sql:126,136`), `huellero_marcas.marcada_en` (`0075:124`). `reportes.fecha`,
`incidencias.fecha`, `asistencias.fecha`, `caja.fecha`: `date` — no se tocan.

| Dónde | Patrón | Tipo | Veredicto |
|---|---|---|---|
| `private.evaluacion_componentes_datos` — última def. 0095:179 (antes 0091, 0057, 0053, 0044; envoltorio público 0067 sin filtro) | `pipeline_puntos.fecha::date between` | timestamptz | **CORREGIR** |
| `est_productividad` — única def. 0040:53 | `pp.fecha::date between` | timestamptz | **CORREGIR** |
| `apps/erp-web/lib/pipeline-repo.ts:247-256` `movimientosRecientes` | `fecha.slice(0,10)` del ISO UTC y `desde` en UTC | timestamptz | **CORREGIR** (y `app/pipeline/metricas/page.tsx:33` compara contra `hoy` en UTC) |
| 0011 `pipeline_ranking_hoy` :33 | `date_trunc` ya en `America/Lima` | timestamptz | ya correcto |
| `colaboradores-repo.ts`, `desempeno-repo.ts` | filtro por instante `T00:00:00-05:00` | timestamptz | ya correcto |
| 0075/0079/0084/0096/0097 `marcada_en` | ya `at time zone 'America/Lima'` | timestamptz | ya correcto |
| 0021/0052/0053/0081 `v_now::date`, 0042/0046/0064/0101 `v_hoy` | `now() at time zone 'America/Lima'` | no es columna | fuera de alcance (ver nota) |
| `reportes`, `incidencias`, `asistencias`, `caja`, `pedidos` `fecha` | columna `date` | date | no se tocan |

Nota: 0021/0052/0053/0081 asignan `now() at time zone 'America/Lima'` (un `timestamp`) a una
variable `timestamptz`; da el día de Lima sólo si la sesión corre en UTC. No lee ninguna columna ni
alimenta puntos: se deja y se anota, no se cambia en este PR.

## Pasos

1. Reservar número de migración (`tools/reservar-migracion.sh puntos-hora-peru`); commit y push.
2. Tests antes del código (commit propio): prueba SQL (`packages/db/pruebas/`) y vitest del helper.
3. Migración idempotente: `create or replace` de las dos funciones, cuerpo idéntico salvo la
   expresión de fecha. TS: helper de día Perú en `lib/fechas.ts` usado por `movimientosRecientes` y la página.
4. `bash tools/verificar-local.sh` verde antes de cada commit. No se aplica a ninguna base.
5. Subagente `verificador` sobre el PR; corregir hallazgos.
6. Pendientes: evaluaciones ya cerradas no se recalculan (`docs/pendientes-negocio.md`).
