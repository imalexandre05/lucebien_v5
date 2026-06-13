# Mapeo de Migración SQLite → Postgres (W4)

> Cómo el ETL one-shot mueve los datos del ERP viejo (SQLite, ver `docs/schema-actual.md`) al
> schema unificado (`packages/db/migrations/0001_init.sql`). **No hay sync continuo.**

## Principios

- **ETL idempotente y re-ejecutable** (upsert por clave natural; no duplica).
- **Loguea huérfanos, no falla.** Los pseudo-FK por nombre pueden no resolver (ej. homónimos
  "Marylin/Mary", nombres viejos). Se registran en `etl_huerfanos.log` y siguen.
- `cod_plain` / `pass_plain` → **DROP** (no se migran). `password_hash` (bcrypt) sí.
- Lectura **read-only** desde un snapshot/backup, nunca de la BD viva.

## Resolución de los 7 pseudo-FK (nombre TEXT → empleado_id uuid)

Vía **tabla de equivalencia** `nombre/cod → empleados.id`, construida del propio `empleados`.

| # | Origen (SQLite) | Destino (Postgres) | Fallback si no resuelve |
|---|---|---|---|
| 1 | `reportes.encargado` | `reportes.encargado_id` | NULL + log |
| 2 | `incidencias.responsable` | `incidencias.responsable_id` | NULL + log |
| 3 | `incidencias.reportado_por` | `incidencias.reportado_por_id` | usar `reportado_por_cod` → NULL + log |
| 4 | `pipeline_puntos.emp_nombre` (+`emp_cod`) | `pipeline_puntos.empleado_id` | match por `emp_cod` → NULL + log |
| 5 | `prenda_historial.responsable` (+`cod_responsable`) | `prenda_historial.empleado_id` | match por cod → NULL + log |
| 6 | `reporte_trabajadores.nombre` | `reporte_trabajadores.empleado_id` | NULL + log |
| 7 | `reporte_extras.registrado_por` | `reporte_extras.registrado_por_id` | NULL + log |

> Estrategia de match: 1) por `cod` exacto si existe; 2) por `nombre` normalizado (trim, lower,
> sin tildes); 3) huérfano → NULL + log. Revisión manual del log post-ETL.

## Mapeo de tablas (núcleo)

| SQLite (viejo) | Postgres (nuevo) | Notas |
|---|---|---|
| `empleados` | `empleados` | `id TEXT`→`uuid` (mapa de equivalencia); dropear `cod_hash/cod_plain/pass_plain` |
| `empleado_tiendas` | `empleado_tiendas` | `tienda`→`sede_cod` FK |
| (sedes hardcodeadas) | `sedes` | seed LB/ST/TR/AL |
| `prendas` (pipeline) | `prenda_pasada` | cada fila = una pasada; `activo_id` se liga si la prenda es de inventario |
| `prenda_historial` | `prenda_historial` | `responsable`→`empleado_id` |
| `pipeline_puntos` | `pipeline_puntos` | `emp_nombre`→`empleado_id` |
| `envios_prendas` | `envios_prendas` | `sede_destino`→FK |
| `reportes` + hijas | `reportes` + hijas | pseudo-FK #1/#6/#7 resueltos |
| `incidencias` | `incidencias` | #2/#3 resueltos |
| `evaluaciones_mensuales` | `evaluaciones_mensuales` | |
| `asistencias` | `asistencias` | |
| `pagos` | `pagos` | |
| `config` | `config` | tal cual (claves `pts_*` etc.) |
| — (no existía) | `clientes`, `inventario_activo`, `pedidos`, `pedido_items` | comercial NUEVO; arranca vacío |

Periféricas (horarios v2, layout_zonas, valores360, garantías, préstamos, accesorios, audit_log):
schema en `0002` + mapeo en una segunda pasada.

## Validación post-ETL

1. Conteos origen vs destino por tabla (deben coincidir salvo huérfanos logueados).
2. Spot-check manual de 5–10 empleados con su desempeño/puntos.
3. Revisar `etl_huerfanos.log` y resolver a mano los nombres que no matchearon.
