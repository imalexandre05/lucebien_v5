# Plan de módulos S16 · S20 · S21 (Fase 1)

Planificación de los tres módulos restantes de Fase 1 que aún no se han construido.
Fuente de los títulos: `tools/weekly-report/cronograma.json` (Cláusula Cuarta del contrato).

> **Estado del cronograma al planificar (2026-07-12):** construido hasta ~W13 (caja) más el
> pipeline completo y la configuración autogestionada. Entre lo hecho y estos módulos quedan
> pendientes **W14 financiero** (existe `/finanzas` base), **W15 producción/confección** y
> **W19 SCM/stock mínimo**. S19 es la continuación natural de S16 (comparten proveedores/stock),
> por eso S16 se diseña dejando el gancho para S19.

Principio transversal (de CLAUDE.md): **core = lógica genérica del oficio; adapter = config de
LuceBien; la UI consume ambos. Nada se hardcodea que deba ser configurable.** Migraciones
idempotentes y versionadas; la última aplicada es `0038`.

---

## S16 — Proveedores, compras y control de stock de materiales (mes 4)

**Qué resuelve.** Hoy no hay registro de a quién se le compra ni de cuánto material
(telas, hilos, avíos, insumos de lavandería) hay en cada sede. Este módulo da el maestro de
proveedores, el registro de compras y el stock de materiales que se descuenta/repone.

**Modelo de datos** (migración `0039`):
- `proveedores` — `id, nombre, ruc, contacto, telefono, direccion, categoria, activo, obs`.
- `materiales` — `id, nombre, categoria, unidad (m/kg/unidad), stock_actual, stock_minimo,
  sede_cod, costo_promedio, activo`. La `categoria` y las `unidad` salen de config del adapter,
  no fijas en código.
- `compras` — `id, proveedor_id (FK), fecha, estado (pendiente/recibida/anulada), total,
  sede_cod, responsable_id (FK empleados), obs`.
- `compra_items` — `id, compra_id (FK, cascade), material_id (FK), cantidad, costo_unitario`.
- `stock_movimientos` — `id, material_id (FK), tipo (entrada/salida/ajuste), cantidad, motivo,
  ref_tipo, ref_id, responsable_id, fecha`. Trazabilidad de cada cambio de stock.

**Reglas / core** (`packages/core/src/compras.ts`, con tests):
- Total de compra = Σ(cantidad × costo_unitario); validación de items no vacíos y cantidades > 0.
- **Recepción de compra** (estado → `recibida`) vía RPC atómico `compra_recibir(compra_id)`:
  inserta un `stock_movimientos` de entrada por cada item, sube `stock_actual` y recalcula
  `costo_promedio` (promedio ponderado). Anular una compra recibida revierte los movimientos.
- Salida/ajuste manual de material con motivo (para mermas o consumo de taller).

**Adapter.** Catálogo de categorías de material y unidades propias de LuceBien en config.

**UI** (grupo COMERCIAL del sidebar):
- `/proveedores` — tabla + alta/edición (patrón de `/empleados`).
- `/materiales` — tabla con stock, filtro por sede, chip rojo si `stock_actual < stock_minimo`.
- `/compras` y `/compras/nueva` — registro con filas dinámicas (patrón de `/pipeline/accesorios`);
  botón "Recibir" que dispara `compra_recibir`.

**Seguridad.** RLS por sede + admin/almacén (helpers `app_es_admin` / `app_sedes`, como el resto).

**Gancho para S19.** El `stock_minimo` y `stock_movimientos` ya dejan lista la base de
"stock mínimo y órdenes de compra automáticas" de W19; S19 solo agrega la generación de órdenes
y las alertas de reposición (estas últimas se conectan a S21).

**Dependencias.** Ninguna dura. Es aditivo; se puede construir ya.
**Esfuerzo estimado.** 1 módulo completo (repo + core + 3–4 pantallas + migración + e2e).

---

## S20 — Reportes avanzados y estadísticas del negocio (mes 5)

**Qué resuelve.** Una vista gerencial que cruza los datos que ya existen (caja/ingresos,
alquileres y ventas, productividad del pipeline, reportes FR-01, incidencias, evaluaciones) con
filtros de rango de fechas y sede. Es sobre todo **lectura + gráficos**; extiende a nivel negocio
lo que `/pipeline/metricas` hace para la lavandería, sin duplicar el Dashboard ni `/finanzas`.

**Modelo de datos** (migración `0040`, casi todo son vistas/RPC de agregación, poco dato nuevo):
- RPCs `security definer` para KPIs con rango de fechas: ingresos por periodo y por servicio,
  ocupación de inventario, ranking de productividad, tasa de incidencias por sede, cumplimiento
  de actividades del FR-01, evolución de compras (si S16 ya existe).
- Opcional `reportes_guardados` — `id, nombre, tipo, filtros (jsonb), creado_por` para que un
  admin guarde una vista recurrente (aplica la filosofía "todo configurable").

**Reglas / core** (`packages/core/src/estadisticas.ts`): normalización de rangos de fecha,
agrupaciones (día/semana/mes), y formateo de series para los gráficos.

**UI** (`/estadisticas`, grupo COMERCIAL o al lado de Finanzas):
- Barra de filtros: rango de fechas + sede.
- Tarjetas KPI arriba (reutilizar `StatBox`), luego gráficos (línea de ingresos, barras por
  servicio, ranking). Para los gráficos usar la **skill `dataviz`** y la paleta navy/gold.
- Exportable a impresión/PDF (patrón del FR-01 imprimible).

**Dependencias (importante).** El valor depende de que los módulos comerciales tengan datos
reales. Se puede construir el marco y las agregaciones ahora, pero rinde de verdad cuando caja,
pedidos y compras (S16) estén poblados. **Recomendado construir después de S16.**
**Esfuerzo estimado.** 1 módulo, mayormente SQL de agregación + UI de gráficos.

---

## S21 — Alertas y notificaciones automáticas internas (mes 6)

**Qué resuelve.** Que el sistema avise solo, sin que alguien tenga que entrar a revisar:
devoluciones de alquiler vencidas (W12), stock de material bajo (S16/S19), caja sin cerrar al
fin del turno, reportes FR-01 sin evaluar, incidencias graves, evaluaciones mensuales pendientes.
Es el **capstone** antes de W22 (integración total).

**Modelo de datos** (migración `0041`):
- `notificaciones` — `id, tipo, titulo, mensaje, severidad (info/warn/critica),
  destinatario_rol, destinatario_sede, destinatario_id (nullable), leida, ref_tipo, ref_id,
  created_at`. Enrutado por rol/sede además de por persona.
- `alertas_reglas` — config de qué condición dispara qué alerta y con qué severidad
  (configurable, no hardcode): umbrales, a quién notifica, activa/inactiva.

**Mecanismo.**
- Un trabajo programado (Supabase `pg_cron` o una ruta cron de Vercel) que evalúa las reglas
  periódicamente e inserta `notificaciones`. Se apoya en el patrón de auto-cierre por cron que
  ya usa el FR-01.
- Motor de reglas en core (`packages/core/src/alertas.ts`): funciones puras "dado este estado,
  qué alertas se disparan", 100% testeables sin BD.

**UI.**
- **Campana en el header del shell** con badge de no leídas + menú desplegable.
- Página `/notificaciones` con historial, filtro por severidad y "marcar como leída".
- Realtime opcional (Supabase Realtime, ya usado en el pipeline) para que aparezcan sin recargar.

**Dependencias.** Necesita las fuentes pobladas: devoluciones (W12) y stock (S16). Por eso va
**al final de los tres.** Su UI (campana) queda como cimiento para las notificaciones web de
Fase 2 (W31).
**Esfuerzo estimado.** 1 módulo + trabajo cron + integración en el shell.

---

## Secuencia recomendada

1. **S16 primero** — aditivo, sin dependencias, y alimenta tanto a S19 como a las alertas de
   stock de S21.
2. **S20 después** — se puede armar el marco ya, pero conviene tras S16 y con lo comercial poblado.
3. **S21 al final** — capstone; su valor aparece cuando W12 (devoluciones) y S16 (stock) tienen datos.

> **Nota de secuencia contractual:** entre lo ya hecho y S16 el contrato ubica W14 (financiero,
> base ya existe) y W15 (producción/confección). Si se quiere respetar la numeración estricta,
> conviene cerrar W14/W15 antes de S16; si la prioridad es el valor comercial, S16 puede
> adelantarse sin bloquear nada. **Decisión de negocio para el responsable del proyecto.**
