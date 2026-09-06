# SPEC — Unir la BD del almacén (real) con la BD local (dev) antes de migrar a Supabase

> **Qué es.** El 24-ago-2026 Alexander bajó una copia comprimida del sistema viejo (Express+SQLite)
> que corre en la compu del almacén y la descomprimió en `D:\Lucebien`. Esa copia es la operación
> real: 4 sedes, empleados dados de alta, reportes evaluados, pipeline de prendas avanzando todos
> los días. La copia local de este repo (`database/lucebien.db`, corre bajo PM2 en esta compu de
> desarrollo) tiene casi nada real — quedó como instancia de prueba.
>
> **Objetivo.** Migrar reportes + pipeline + asistencias + empleados del sistema viejo al nuevo
> (Supabase) usando el ETL que ya existe (`packages/db/etl/migra-reportes.mjs`,
> `migra-pipeline.mjs`). Ese ETL lee un solo archivo SQLite. Antes de correrlo hay que decidir
> **de cuál** — y la respuesta no es "el del almacén tal cual", porque hay 771 reportes y 93
> prendas con el mismo id en ambas copias, y compararon distinto.
>
> **Zona de rigor:** nivel 3 (reportes diarios + pipeline, `docs/rigor-por-zona.md`). Alimentan la
> nota mensual y el pago. El merge no escribe en Supabase — arma un SQLite combinado de solo
> lectura para el ETL. La escritura real a Supabase la hacen los ETL existentes, con su propio
> `--run` explícito, después de revisar el dry-run.

---

## 1. Lo que se comprobó contra los dos archivos

Comparado con `better-sqlite3` en modo read-only, sin tocar ningún original
(`D:\Sistemas\Lucebien\SCI-LB\database\lucebien.db` = local,
`D:\Lucebien\database\backups\lucebien_auto_20260824_081046.db` = almacén, backup de esta mañana):

| Tabla | Local | Almacén | En ambas (mismo id) | Con contenido distinto |
|---|---|---|---|---|
| `reportes` | 1066 | 1024 | 771 | **171** |
| `reporte_trabajadores` | 67 | 392 | — | — |
| `reporte_actividades` | 1750 | 11922 | — | — |
| `envios_prendas` | 10 | 293 | 10 | 0 |
| `prendas` | 93 | 814 | 93 | **60** |
| `prenda_historial` | 472 | 5306 | — | — |
| `pipeline_puntos` | 321 | 3845 | — | — |
| `empleados` | 18 | 22 | 18 | 0 |
| `asistencias` | 3 | 253 | — | — |
| `incidencias` | 12 | 31 | — | — |

**Empleados y envíos coinciden 100% donde se solapan** — no hay conflicto ahí, sólo altas nuevas
del lado del almacén (Leonel 3559, Jaerock 1020, Elthon 1021, Nohely 1022).

**Reportes y prendas sí divergen en las filas compartidas**, y siempre en la misma dirección:

```
id=11-05-26_T-ST   local: puntaje=0  evaluado=0      almacén: puntaje=100  evaluado=1
id=411 (prenda)    local: etapa=planchado            almacén: etapa=enviado
```

Local quedó con la versión sin trabajar (recién creada, nunca evaluada / etapa temprana);
almacén tiene la versión real, avanzada. Consistente con que la instancia local no es la que usa
la gente.

## 2. Regla de merge (confirmada con Alexander, 25-ago-2026)

**El almacén gana siempre que haya conflicto de contenido en un id compartido.** No hay excepción
caso por caso — la copia local no tiene autoridad sobre ningún dato real.

Para las filas que sólo existen en un lado:

- **Sólo en almacén → se incluyen.** Es la operación real que nunca llegó a esta compu.
- **Sólo en local → se listan aparte, no se descartan en silencio.** 295 reportes y 0 prendas caen
  acá. Antes de excluirlos del merge, el script los vuelca a
  `packages/db/etl/_merge_solo_local.log` para que alguien los mire — la sospecha es que son ruido
  de prueba (reportes con `puntaje=0, evaluado=0` creados por esta instancia de desarrollo), pero
  no se asume sin mirar.

Tablas sin pseudo-FK a resolver dentro del merge (se copian tal cual del ganador por tabla, ya
que no tienen id compartido conflictivo comprobado): `reporte_trabajadores`,
`reporte_actividades`, `reporte_extras`, `actividades_config`, `actividades_pendientes`,
`prenda_historial`, `pipeline_puntos`, `prenda_calificacion`, `asistencias`, `incidencias`,
`empleado_tiendas`. Para estas, **almacén es la fuente completa**
(superset ya comprobado en la tabla de arriba) — no se unen fila por fila, se toman enteras del
almacén. Las hijas de reportes/prendas *solo-en-local* (sin padre en almacén) también se descartan
si su reporte/prenda padre no sobrevive el merge — mismo motivo que un huérfano en el ETL
existente (`docs/mapeo-migracion.md`).

## 3. Qué hace el script (`packages/db/etl/merge-bd-almacen.mjs`)

1. Abre ambos SQLite en **read-only**. Nunca escribe en `database/lucebien.db` ni en la copia del
   almacén.
2. Construye una copia nueva en `database/lucebien_merged.db` (gitignored, nunca se versiona —
   mismo criterio que `database/lucebien.db*`).
3. Para `reportes` y `prendas`: por cada id, si sólo está en almacén o en ambos → copia la fila de
   **almacén**. Si sólo está en local → la anota en el log y no la copia al merge (no se pierde:
   sigue en `database/lucebien.db` si hace falta rescatar algo a mano).
4. Para el resto de las tablas (§2): copia entero el contenido de almacén.
5. Imprime un resumen de conteos por tabla (igual al de la tabla de arriba) para verificar contra
   este documento antes de seguir.
6. Es un script de un solo uso, re-ejecutable (si se corre de nuevo, recrea
   `lucebien_merged.db` desde cero — no hay estado a arrastrar).

## 4. Después del merge

`lucebien_merged.db` queda en `database/`, con el mismo esquema SQLite que el ETL espera. Correr
los ETL existentes apuntándolo temporalmente (no se cambia el path por defecto del script, se
copia `lucebien_merged.db` sobre `database/lucebien.db` **con backup previo** justo antes de correr
el ETL, o se ajusta la constante `SQLITE` del ETL para esa corrida — a decidir en el momento, no
requiere spec nueva porque el ETL en sí no cambia):

```bash
node packages/db/etl/provision-empleados.mjs --run   # si no corrió antes (altas: Leonel, Jaerock, Elthon, Nohely)
node packages/db/etl/migra-reportes.mjs               # dry-run primero
node packages/db/etl/migra-reportes.mjs --run
node packages/db/etl/migra-pipeline.mjs
node packages/db/etl/migra-pipeline.mjs --run
```

Cada uno ya es idempotente y ya loguea huérfanos — eso no lo cambia esta spec.

## 5. Lo que esta spec NO decide

- No decide si las 295 filas "sólo local" tienen algo rescatable. Eso lo mira Alexander sobre el
  log una vez que exista.
- No corre el ETL contra Supabase. Eso es un paso aparte, después de revisar el resumen del merge.
