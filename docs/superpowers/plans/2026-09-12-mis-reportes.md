# Mis reportes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un operativo ve, en la misma pantalla donde carga su reporte del turno, el estado (evaluado/pendiente/no evaluable) y el puntaje general de sus propios reportes recientes — sin exponer los puntos de extras, que siguen siendo sólo de administración/evaluación.

**Architecture:** una función de repo nueva (`listarReportesDe`, filtra `reportes` por `encargado_id`, sin RLS nueva porque `rep_select` ya es por sede) + un componente de presentación nuevo (`MisReportes`) que se monta en `/reportes/nuevo`, la pantalla operativa que ya vive en «Interno». Dos constantes duplicadas en dos archivos (`ESTADO_TONE`, `Puntaje`) se extraen a un módulo compartido antes de sumar una tercera copia.

**Tech Stack:** Next.js App Router (server components), Supabase (`@supabase/ssr`), `@scilb/core`, Tailwind, Playwright (e2e).

## Global Constraints

- Español neutral en comentarios y UI, sin voseo (CLAUDE.md).
- `tabular-nums` en cualquier número nuevo en el ERP (fechas, puntajes).
- Sin RLS ni migración nueva — la spec (§3.1) confirma que `rep_select` (0081) ya alcanza.
- No mostrar puntos de extras al operativo — decisión de Fase 5, `reportes/[id]/page.tsx` no se toca en su lógica de gate.
- Antes de commitear: `bash tools/verificar-local.sh` en verde.

---

## Spec de referencia

`docs/superpowers/specs/reportes/2026-09-12-mis-reportes-design.md` — leída completa antes de este plan. Cobertura:

| Sección de la spec | Task que la implementa |
|---|---|
| §2 Alcance (encargado_id, sin puntos de extra) | Task 3, 4 |
| §3.1 Datos (`listarReportesDe`, sin RLS nueva) | Task 3 |
| §3.2 Pantalla | Task 1, 2, 4, 5 |
| §3.3 Qué pasa si falla | Task 5 |
| §5 Cómo se comprueba (casos 1-4) | Task 6 |

---

### Task 1: Extraer `ESTADO_TONE` y `Puntaje` a un módulo compartido

Hoy `ESTADO_TONE` está duplicado en `apps/erp-web/app/reportes/lista.tsx` (líneas 20-24) y en `apps/erp-web/app/reportes/[id]/page.tsx` (líneas 23-27) con el mismo contenido exacto. `Puntaje` (el badge de porcentaje) sólo existe en `lista.tsx`. El componente nuevo de Task 5 necesita las dos — sumar una tercera copia es el mismo error que ya está anotado en `docs/aprendizajes.md` ("Barrer por nombre y creer que se barrió el problema").

**Files:**
- Create: `apps/erp-web/app/reportes/constantes.tsx`
- Modify: `apps/erp-web/app/reportes/lista.tsx`
- Modify: `apps/erp-web/app/reportes/[id]/page.tsx`

**Interfaces:**
- Produces: `ESTADO_TONE: Record<EstadoReporte, Tone>`, `Puntaje({ r: Reporte }): JSX.Element` — ambos importables desde `./constantes` (o `../constantes` desde `[id]/`).

- [ ] **Step 1: Crear el módulo compartido**

Crear `apps/erp-web/app/reportes/constantes.tsx`:

```tsx
import type { EstadoReporte, Reporte } from '@scilb/core';
import type { Tone } from '../../components/ui/badge';
import { cn } from '../../lib/cn';

// Compartido entre la lista de administración (lista.tsx), el detalle ([id]/page.tsx) y "Mis
// reportes" (mis-reportes.tsx) -- un solo lugar para el color de cada estado y el badge de
// puntaje, en vez de que cada pantalla nueva agregue su propia copia.
export const ESTADO_TONE: Record<EstadoReporte, Tone> = {
  evaluado: 'green',
  pendiente: 'amber',
  no_evaluable: 'gray',
};

export function Puntaje({ r }: { r: Reporte }) {
  if (!r.evaluado) return <span className="text-muted">—</span>;
  const p = r.puntajeEval ?? r.puntaje;
  const cls =
    p >= 85 ? 'bg-exito/10 text-exito-deep' : p >= 60 ? 'bg-gold/20 text-gold-deep' : 'bg-error-soft text-error-deep';
  return <span className={cn('rounded-r-pastilla px-2.5 py-0.5 tabular-nums text-dato font-bold', cls)}>{p}%</span>;
}
```

- [ ] **Step 2: `lista.tsx` importa en vez de declarar**

En `apps/erp-web/app/reportes/lista.tsx`, reemplazar el bloque de imports (líneas 1-18) por:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Filter } from 'lucide-react';
import { TURNO_LABEL, estadoReporte, ESTADO_REPORTE_LABEL, type Reporte } from '@scilb/core';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { campoCls } from '../../components/ui/form';
import { ESTADO_TONE, Puntaje } from './constantes';
```

(Se va `type EstadoReporte`, `type Tone` y `cn` — ya no se usan directo en este archivo. Se va también el bloque `const ESTADO_TONE = {...}` de las líneas 20-24 y la función `Puntaje` de las líneas 51-56: quedan reemplazadas por el import.)

- [ ] **Step 3: `[id]/page.tsx` importa en vez de declarar**

En `apps/erp-web/app/reportes/[id]/page.tsx`, el import de `@scilb/core` (líneas 3-10) pierde `type EstadoReporte`:

```tsx
import {
  TURNO_LABEL,
  estadoReporte,
  ESTADO_REPORTE_LABEL,
  puede,
  type MatrizPermisos,
} from '@scilb/core';
```

El import de badge (línea 17) pierde `type Tone`:

```tsx
import { Badge } from '../../../components/ui/badge';
```

Se agrega, junto a los demás imports locales:

```tsx
import { ESTADO_TONE } from '../constantes';
```

Y se borra el bloque (líneas 23-27):

```tsx
const ESTADO_TONE: Record<EstadoReporte, Tone> = {
  evaluado: 'green',
  pendiente: 'amber',
  no_evaluable: 'gray',
};
```

No se toca nada más de este archivo — el gate de `puedeVerPuntosExtras` (líneas 61-66) sigue exactamente igual.

- [ ] **Step 4: Typecheck**

Run: `cd apps/erp-web && npx tsc --noEmit`
Expected: sin errores nuevos (ni "declared but never used" en los dos archivos tocados, ni "cannot find name" en `constantes.tsx`).

- [ ] **Step 5: Commit**

```bash
git add apps/erp-web/app/reportes/constantes.tsx apps/erp-web/app/reportes/lista.tsx "apps/erp-web/app/reportes/[id]/page.tsx"
git commit -m "refactor(erp): comparte ESTADO_TONE y Puntaje entre las pantallas de reportes"
```

---

### Task 2: `listarReportesDe` en el repo

**Files:**
- Modify: `apps/erp-web/lib/reportes-repo.ts`

**Interfaces:**
- Consumes: `getServerClient()` (ya importado en el archivo), `baseReporte(r: RepRow, nombre, trabajadores): Reporte` (función local ya existente, línea 53).
- Produces: `listarReportesDe(usuarioId: string, limite?: number): Promise<Reporte[]>`, consumida por Task 4.

- [ ] **Step 1: Agregar la función**

Insertar en `apps/erp-web/lib/reportes-repo.ts`, inmediatamente después del cierre de `listarReportes()` (después de la línea 107, antes del comentario `// Detalle completo...`):

```ts
// "Mis reportes" (spec 2026-09-12): los últimos reportes que ESTA persona llenó
// (encargado_id = ella). No resuelve nombres de terceros -- no hacen falta para una lista de "lo
// mío". RLS de `rep_select` (0081) ya es por sede, no por encargado: este filtro es sólo de la
// aplicación, no una puerta nueva.
export async function listarReportesDe(usuarioId: string, limite = 10): Promise<Reporte[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('reportes')
    .select('*')
    .eq('encargado_id', usuarioId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  const rows = (data as RepRow[]) ?? [];
  return rows.map((r) => baseReporte(r, () => null, []));
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/erp-web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-web/lib/reportes-repo.ts
git commit -m "feat(erp): agrega listarReportesDe para la vista de reportes propios"
```

---

### Task 3: Componente `MisReportes`

**Files:**
- Create: `apps/erp-web/app/reportes/mis-reportes.tsx`

**Interfaces:**
- Consumes: `ESTADO_TONE`, `Puntaje` (Task 1, `./constantes`); `TURNO_LABEL`, `ESTADO_REPORTE_LABEL`, `estadoReporte`, `type Reporte` (`@scilb/core`); `EmptyState` (`../../components/ui/empty-state`, mismo componente que ya usan `notificaciones/cliente.tsx` y `solicitudes/cliente.tsx`).
- Produces: `MisReportes({ reportes: Reporte[] }): JSX.Element`, consumido por Task 4.

- [ ] **Step 1: Crear el componente**

Crear `apps/erp-web/app/reportes/mis-reportes.tsx`:

```tsx
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { TURNO_LABEL, ESTADO_REPORTE_LABEL, estadoReporte, type Reporte } from '@scilb/core';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';
import { ESTADO_TONE, Puntaje } from './constantes';

// "Mis reportes" (spec 2026-09-12): quien llena el turno hoy no tenía forma de ver si lo que
// mandó ya se evaluó -- el historial completo vive en /administracion/reportes, detrás del
// permiso 'reportes_admin' que un operativo no tiene. Este bloque muestra sólo SUS reportes
// (el filtro por encargado_id vive en listarReportesDe, lib/reportes-repo.ts) y cada fila
// linkea a /reportes/[id], que ya sabe qué mostrarle a un no-admin -- puntaje general sí, puntos
// de extras no (decisión de Fase 5, sin tocar acá).
export function MisReportes({ reportes }: { reportes: Reporte[] }) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-cuerpo font-semibold text-navy">Mis reportes recientes</h2>
      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {reportes.length === 0 ? (
            <EmptyState icon={ClipboardList} titulo="Todavía no enviaste ningún reporte">
              Acá vas a ver el estado de cada turno que reportes.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Fecha</TH>
                  <TH>Turno</TH>
                  <TH>Sede</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Puntaje</TH>
                </TR>
              </THead>
              <TBody>
                {reportes.map((r) => {
                  const est = estadoReporte(r);
                  return (
                    <TR key={r.id}>
                      <TD className="pl-5 tabular-nums text-dato text-muted">
                        <Link href={`/reportes/${r.id}`} className="text-navy transition-colors duration-150 hover:text-gold-deep hover:underline">
                          {r.fecha}
                        </Link>
                      </TD>
                      <TD>{TURNO_LABEL[r.turno] ?? r.turno}</TD>
                      <TD className="tabular-nums">{r.sedeCod}</TD>
                      <TD>
                        <Badge tone={ESTADO_TONE[est]}>{ESTADO_REPORTE_LABEL[est]}</Badge>
                      </TD>
                      <TD className="pr-5 text-right">
                        <Puntaje r={r} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/erp-web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-web/app/reportes/mis-reportes.tsx
git commit -m "feat(erp): componente MisReportes"
```

---

### Task 4: Montar `MisReportes` en `/reportes/nuevo`

**Files:**
- Modify: `apps/erp-web/app/reportes/nuevo/page.tsx`

**Interfaces:**
- Consumes: `listarReportesDe` (Task 2), `MisReportes` (Task 3).

- [ ] **Step 1: Pedir los datos y montar el bloque**

Reemplazar el contenido completo de `apps/erp-web/app/reportes/nuevo/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados, listarReportesDe } from '../../../lib/reportes-repo';
import { listarTiposIncidencia } from '../../../lib/incidencias-repo';
import { leerConfigMap, CIERRE_TURNO_DEFAULT } from '../../../lib/config-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { NuevoReporteForm } from './form';
import { MisReportes } from '../mis-reportes';
import { hoyPeru } from '../../../lib/fechas';

export default async function NuevoReportePage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const sede = sesion.usuario.sede;
  const fecha = hoyPeru();
  const [empleados, tiposIncidencia, config, misReportes] = await Promise.all([
    listarEmpleados(),
    listarTiposIncidencia(),
    leerConfigMap(),
    // Degradado (mismo criterio que leerMatrizPermisos en reportes/[id]/page.tsx): si esta
    // consulta falla, el formulario del turno -- lo que de verdad importa ese día -- sigue
    // funcionando. El bloque de abajo simplemente queda vacío.
    listarReportesDe(sesion.usuario.id).catch(() => []),
  ]);
  const cierres = {
    M: config.turno_m_cierre || CIERRE_TURNO_DEFAULT.M,
    T: config.turno_t_cierre || CIERRE_TURNO_DEFAULT.T,
    C: config.turno_c_cierre || CIERRE_TURNO_DEFAULT.C,
  };

  return (
    <div>
      <PageHeader title="Nuevo reporte de actividades" subtitle={`${sede || 'sin sede'} · ${fecha}`} />
      <NuevoReporteForm
        sede={sede}
        fecha={fecha}
        encargadoId={sesion.usuario.id}
        empleados={empleados}
        tiposIncidencia={tiposIncidencia}
        cierres={cierres}
      />
      <MisReportes reportes={misReportes} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/erp-web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-web/app/reportes/nuevo/page.tsx
git commit -m "feat(erp): monta Mis reportes en la pantalla de turno"
```

---

### Task 5: Prueba end-to-end

**Files:**
- Create: `apps/erp-web/e2e/colaborador.mis-reportes.spec.ts`

**Interfaces:**
- Consumes: fixture `page` de `@playwright/test`, ya autenticada como `colaborador` vía `storageState` (mismo mecanismo que `colaborador.aislamiento.spec.ts` — no hace falta llamar `entrar()`).

- [ ] **Step 1: Escribir la prueba (todavía en rojo — el código de Task 1-4 aún no existe en este paso si se sigue el orden estrictamente TDD; si ya se aplicaron las tasks anteriores, este paso se ejecuta contra código real y sirve como prueba de regresión)**

Crear `apps/erp-web/e2e/colaborador.mis-reportes.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

/**
 * "Mis reportes" (spec 2026-09-12): quien llena el turno ve el estado de sus propios reportes
 * en /reportes/nuevo -- hoy el historial completo vive en /administracion/reportes, detrás de un
 * permiso que un colaborador no tiene (ver colaborador.aislamiento.spec.ts).
 *
 * No hay una segunda cuenta de colaborador sembrada en el entorno de pruebas para comprobar de
 * punta a punta que Persona A no ve los reportes de Persona B -- ese filtro (encargado_id, en
 * reportes-repo.ts) se revisa por lectura de código hasta que exista esa segunda cuenta.
 *
 *   E2E_URL=http://localhost:3005 npx playwright test --project=colaborador colaborador.mis-reportes
 */

test('un colaborador ve el bloque "Mis reportes recientes" en su formulario de turno', async ({ page }) => {
  const respuesta = await page.goto('/reportes/nuevo', { waitUntil: 'domcontentloaded' });
  expect(respuesta?.status() ?? 0, '/reportes/nuevo respondió mal').toBeLessThan(400);
  await page.waitForLoadState('networkidle').catch(() => {});

  await expect(page.getByRole('heading', { name: 'Mis reportes recientes' })).toBeVisible();

  // O la tabla con al menos una fila, o el estado vacío -- cualquiera de los dos es "funciona
  // bien", nunca los dos juntos ni ninguno de los dos.
  const filas = page.locator('table tbody tr');
  const vacio = page.getByText('Todavía no enviaste ningún reporte');
  const hayFilas = (await filas.count()) > 0;
  const hayVacio = await vacio.isVisible().catch(() => false);
  expect(hayFilas !== hayVacio, 'debería mostrarse la tabla O el estado vacío, no ambos ni ninguno').toBe(true);
});
```

- [ ] **Step 2: Correrla contra `erp-dev` (puerto 3005, ya está arriba por PM2)**

Run:
```bash
cd apps/erp-web
E2E_URL=http://localhost:3005 E2E_ADMIN_PASSWORD=<pendiente> E2E_COLAB_PASSWORD=<pendiente> npx playwright test --project=colaborador colaborador.mis-reportes
```
Expected: 1 passed. **Bloqueado hoy**: las dos variables de entorno no están disponibles en esta sesión ni en el repo (a propósito — `e2e/sesiones.ts` no admite un default). Quien tenga esas contraseñas corre este comando; si falla, el mensaje de Playwright dice exactamente qué línea no encontró (`heading` o `table`/`vacío`), no un timeout ciego.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-web/e2e/colaborador.mis-reportes.spec.ts
git commit -m "test(erp): agrega prueba e2e de Mis reportes"
```

---

### Task 6: Verificación final y cierre de la spec

- [ ] **Step 1: Guard completo**

Run: `bash tools/verificar-local.sh`
Expected: sale en verde (guard de no-negociables + typecheck + tests unitarios de `packages/core` — la e2e de Task 5 no corre acá, ese script no levanta un navegador).

- [ ] **Step 2: Marcar la spec como implementada**

En `docs/superpowers/specs/reportes/2026-09-12-mis-reportes-design.md`, agregar al final:

```markdown
---

**Implementado el 12-sep-2026.** Verificado: `tools/verificar-local.sh` en verde. Pendiente de
verificación visual/e2e real (Task 5 de `docs/superpowers/plans/2026-09-12-mis-reportes.md`) hasta
contar con `E2E_ADMIN_PASSWORD`/`E2E_COLAB_PASSWORD`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/reportes/2026-09-12-mis-reportes-design.md
git commit -m "docs(reportes): marca la spec de Mis reportes como implementada"
```
