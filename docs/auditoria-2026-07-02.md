# Auditoría del ERP nuevo (apps/erp-web) — 2 de julio de 2026

Auditoría de calidad + cobertura de pruebas del ERP nuevo (Next.js + Supabase), tras la
entrega de la Fase 1 (reportes, pipeline, RRHH, CRM, caja/cobros, financiero, dashboard).

## Resumen ejecutivo

- **Build y tipos:** `tsc --noEmit` limpio en la app; `next build` compila las 21 rutas.
- **Despliegue:** producción **READY** en Vercel; **0 errores de runtime** en el rango revisado.
- **Pruebas:** **71 tests unitarios** (core, vitest) + **2 tests E2E** (Playwright) — todo en verde.
- **Seguridad:** RLS activa con políticas en todas las tablas de módulo; sin lints nuevos.
- **Hallazgos corregidos:** lógica pura reubicada en `core`; voseo en la UI → español neutral.

## 1. Cobertura de pruebas

### Unitarias (packages/core, vitest) — 71 tests, 11 archivos
Toda la **lógica de negocio pura** está en `@scilb/core` y testeada:

| Módulo | Cubre |
|---|---|
| `reportes` (12) | id de reporte, `actAplicaHoy` (frecuencias/turno), puntaje de evaluación |
| `evaluaciones` (7) | nota mensual ponderada, tramos, tardanza |
| `pipeline` (12) | transiciones válidas, `clavePuntos`, regla ½ prenda |
| `crm` (11) | segmentación/fidelización, días de inactividad, métricas |
| `caja` (5) | arqueo (efectivo esperado), nivel de alerta de devolución |
| `pedidos` (5) | `generaPasada`, validación Zod del schema |
| `inventario` (5) | codificación `TN-042`, precio por uso |
| `permisos` (4) | supervisores, alcance por sede |
| `auth` (4) · `clientes` (4) | login schema · validación de cliente |

Correr: `pnpm --filter @scilb/core test`.

### End-to-end (apps/erp-web, Playwright) — 2 tests
- **Login + navegación:** login (código+sede) → dashboard → recorre los 9 módulos clave
  (reportes, evaluar-reportes, incidencias, asistencias, pagos, clientes, caja, finanzas,
  devoluciones) verificando su encabezado. **Verde.**
- **Rechazo de credenciales inválidas:** un código inexistente NO da acceso al dashboard. **Verde.**

Correr (con el dev server o un preview arriba): `pnpm --filter erp-web test:e2e`
(config por env: `E2E_BASE_URL`, `E2E_COD`, `E2E_SEDE`).

## 2. Hallazgos y acciones

| # | Hallazgo | Severidad | Acción |
|---|---|---|---|
| F1 | Lógica pura (segmentación CRM, arqueo de caja, alertas de devolución) vivía en `apps/erp-web/lib` mezclada con código de servidor y **sin tests** — rompía la separación core/adapter. | Media | ✅ Movida a `@scilb/core` (`crm.ts`, `caja.ts`) con `hoy` inyectable; la app la consume; +16 tests. |
| F2 | Voseo en la UI ("Ingresá", "Revisá") contra la preferencia de español neutral. | Baja | ✅ Corregido en login y pedidos (3 mensajes). |
| F3 | El test E2E de credenciales usó `0000`, que resultó ser un **código real** de empleado. | — | Aclarado: **no es bug**. Verificado: 18 códigos de empleado, **todos únicos**. Test ajustado a un código inexistente. |

## 3. Seguridad

- **RLS:** todas las tablas de módulo (reportes, incidencias, asistencias, evaluaciones, pagos,
  layout, caja, comercial, empleados) tienen políticas por **rol/sede**; verificado con el linter
  de Supabase — **sin lints nuevos** tras las últimas migraciones.
- **Datos por-request:** la app usa el cliente Supabase con la **anon key + sesión en cookie**
  (RLS real); no hay `service_role` en el cliente ni en el repositorio.
- **Advertencias del linter (por diseño, no bloqueantes):**
  - 7 funciones `SECURITY DEFINER` (`app_es_admin/almacen/sedes`, `app_directorio`,
    `pipeline_ranking_hoy`, `reportes_marcar_asistencia`, `evaluacion_componentes`) son
    ejecutables por usuarios autenticados. Son helpers usados dentro de las políticas RLS;
    exponen datos acotados y sin PII sensible. **Recomendación (endurecimiento):** moverlas a un
    schema privado — PR aparte, bajo riesgo.
  - "Leaked password protection" desactivada: **intencional** — el login es por código numérico de
    4 dígitos (no aplica la verificación contra HaveIBeenPwned). Para producción a largo plazo,
    evaluar un segundo factor o códigos más largos.

## 4. Recomendaciones

1. **CI:** correr `test` (unit) y `test:e2e` en GitHub Actions en cada PR (E2E contra un preview
   de Vercel; con Deployment Protection activa, usar un token de bypass).
2. **Endurecimiento RLS (lint 0029):** mover los helpers `app_*` a un schema privado.
3. **Ampliar E2E** gradualmente a los flujos de escritura (crear reporte → evaluar; abrir caja →
   cobrar → cerrar) una vez cargados datos de prueba estables.
4. **Auth de producción:** revisar el login de 4 dígitos antes del uso masivo real.

## Estado

Sistema **estable y verificado** para uso de demostración: compila, despliega, sin errores de
runtime, con 71 pruebas unitarias y 2 E2E en verde, y la lógica de negocio centralizada y testeada.
