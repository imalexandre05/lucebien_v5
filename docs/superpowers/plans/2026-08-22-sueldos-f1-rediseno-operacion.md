# F1 — Rediseño de la operación de sueldos · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usá `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que el administrador pueda recorrer el periodo completo —acuerdo, asistencia,
ventas, movimientos, liquidación y resumen— sin salirse del módulo y entendiendo de dónde sale
cada sol, sin tocar el motor de cálculo.

**Arquitectura:** todo el trabajo es de presentación sobre datos y acciones que ya existen. Se
saca la carga de ventas de `/sueldos/movimientos` a su propia pantalla `/sueldos/ventas` con la
lectura semanal contra la meta; se agrega el comprobante imprimible de liquidación siguiendo el
patrón de `pagos/[id]/comprobante`; y el hub `/sueldos` pasa a mostrar el ciclo del periodo.
Ninguna tarea modifica una regla existente de `packages/core` ni escribe migraciones — la única
excepción es un módulo nuevo y aislado (Tarea 2) que no toca ninguna función que calcule un pago.

**Stack:** Next.js App Router (server components + server actions), TypeScript, Tailwind con los
tokens del sistema, componentes de `apps/erp-web/components/ui/`.

## Restricciones globales

Aplican a **todas** las tareas. Salen de `CLAUDE.md` y `docs/sistema-de-diseno.md`:

- **No se modifica ninguna regla existente de `packages/core/`.** F1 es presentación. La única
  escritura permitida en el core es el **módulo nuevo** de la Tarea 2 (`semanas-meta.ts`), que no
  altera ninguna función que hoy calcule un pago. Si alguna otra tarea parece necesitar un cambio
  de regla, se detiene y se escribe en la spec primero (no-negociable 6).
- **No se escriben migraciones.** Ninguna tarea de F1 crea tablas ni RPC.
- **Prohibida la paleta por defecto de Tailwind** (`emerald`, `amber`, `red`, `slate`, `sky`…).
  Todo color sale de un token: `navy`, `gold`, `gold-deep`, `paper`, `ink`, `line`, `muted`, y las
  familias `exito` / `aviso` / `error` / `info` en sus cuatro pasos (`-soft`, `-line`, base,
  `-deep`). La receta de un aviso es `border-<familia>-line bg-<familia>-soft text-<familia>-deep`.
  Lo comprueba `tools/guard-reglas.sh` y falla CI.
- **Nada monoespaciado.** Los números llevan `tabular-nums`.
- **Fechas en hora Perú:** `hoyPeru()` de `apps/erp-web/lib/fechas.ts`. **Nunca `new Date()`**
  para obtener el día de hoy (no-negociable 4).
- **Español neutral, sin voseo.** Sin signos de exclamación. Un control deshabilitado dice por qué,
  y lo dice también en el celular.
- **Animaciones ≤ 300 ms**, sólo `transform` y `opacity`, hover con movimiento gateado con
  `hover-fine:`.
- **Aislamiento:** toda consulta pasa por `getServerClient()` (manda la RLS). Ninguna tarea agrega
  un séptimo archivo con `getAdminClient()` (no-negociable 3).
- **Verificación antes de cada commit:** `bash tools/verificar-local.sh`
- **Commits:** Conventional Commits en español, scope `erp`.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `packages/core/src/semanas-meta.ts` | **Nuevo.** Partir un periodo en semanas y comparar ventas contra meta. Función pura, con tests | 2 |
| `packages/core/src/semanas-meta.test.ts` | **Nuevo.** Tests de la anterior | 2 |
| `packages/core/src/index.ts` | Modificar: una línea de export | 2 |
| `apps/erp-web/app/sueldos/ventas/page.tsx` | **Nuevo.** Server component de la pantalla de ventas | 3 |
| `apps/erp-web/app/sueldos/ventas/cliente.tsx` | **Nuevo.** Carga rápida + semáforo semanal + cola sin vendedor | 3 |
| `apps/erp-web/app/sueldos/ventas/actions.ts` | **Nuevo.** Server actions de venta (mudadas de movimientos) | 3 |
| `apps/erp-web/app/sueldos/movimientos/cliente.tsx` | Modificar: sacar el bloque de ventas, corregir `hoy()` | 1, 3 |
| `apps/erp-web/app/sueldos/movimientos/page.tsx` | Modificar: dejar de cargar ventas | 3 |
| `apps/erp-web/app/sueldos/movimientos/actions.ts` | Modificar: sacar las acciones de venta | 3 |
| `apps/erp-web/app/sueldos/liquidaciones/cliente.tsx` | Modificar: aviso de periodo sin ventas, enlace al comprobante | 4, 5 |
| `apps/erp-web/app/sueldos/liquidaciones/[id]/comprobante/page.tsx` | **Nuevo.** Resumen mensual imprimible (PEND-09) | 5 |
| `apps/erp-web/app/sueldos/liquidaciones/[id]/comprobante/imprimir.tsx` | **Nuevo.** Botón de impresión, `print:hidden` | 5 |
| `apps/erp-web/app/sueldos/page.tsx` | **Nuevo.** Hub del módulo con el ciclo del periodo | 6 |

**Lo que NO se toca:** ninguna regla existente de `packages/core/` (la Tarea 2 sólo agrega un
módulo nuevo al lado), `lib/sueldos-repo.ts` (sólo se consume), las migraciones, y
`app/colaboradores/[id]/movimientos/` — esa sección seguirá mostrando las ventas de la persona
leyendo el mismo repo.

---

## Tarea 1: La fecha de hoy sale de `hoyPeru()`, no de `new Date()`

Defecto real encontrado al planificar: `movimientos/cliente.tsx:44` define
`const hoy = () => new Date().toISOString().slice(0, 10)`. Eso da la fecha **UTC**, así que
después de las 19:00 hora Perú el formulario propone el día siguiente. Un adelanto registrado a
las 20:00 del 30 cae en el periodo del mes siguiente y no se descuenta donde debía.

Va primero y sola porque es una corrección de comportamiento, no un rediseño: se puede revisar y
mergear sin esperar al resto.

**Archivos:**
- Modificar: `apps/erp-web/app/sueldos/movimientos/cliente.tsx:44`

**Interfaces:**
- Consume: `hoyPeru(): string` de `apps/erp-web/lib/fechas.ts:7` — devuelve `'YYYY-MM-DD'` en
  `America/Lima`.
- Produce: nada nuevo.

- [ ] **Paso 1: Ver la línea actual**

Ejecutar: `grep -n "new Date()" apps/erp-web/app/sueldos/movimientos/cliente.tsx`
Esperado: `44:const hoy = (): string => new Date().toISOString().slice(0, 10);`

- [ ] **Paso 2: Reemplazar el helper local por el del sistema**

En `apps/erp-web/app/sueldos/movimientos/cliente.tsx`, borrar la línea 44 completa:

```tsx
const hoy = (): string => new Date().toISOString().slice(0, 10);
```

y agregar el import junto a los otros de `lib` (después de la línea 12):

```tsx
import { hoyPeru } from '../../../lib/fechas';
```

- [ ] **Paso 3: Cambiar los dos usos**

Buscar con `grep -n "hoy()" apps/erp-web/app/sueldos/movimientos/cliente.tsx`. Aparece en el
estado inicial de `mov` y en el de `venta`. Reemplazar cada `hoy()` por `hoyPeru()`:

```tsx
  const [mov, setMov] = useState({
    empleadoId: '',
    fecha: hoyPeru(),
    tipo: 'adelanto' as TipoMovimiento,
    monto: '',
    cantidad: '1',
    motivo: '',
  });

  const [venta, setVenta] = useState({
    fecha: hoyPeru(),
    monto: '',
    tipo: 'venta' as 'venta' | 'alquiler',
    sedeCod: '',
    empleadoId: '',
  });
```

- [ ] **Paso 4: Comprobar que no queda ningún `new Date()` en el módulo**

Ejecutar: `grep -rn "new Date()" apps/erp-web/app/sueldos/`
Esperado: sin resultados (salida vacía, código de salida 1).

- [ ] **Paso 5: Verificar**

Ejecutar: `bash tools/verificar-local.sh`
Esperado: guard, typecheck y tests en verde.

- [ ] **Paso 6: Commit**

```bash
git add apps/erp-web/app/sueldos/movimientos/cliente.tsx
git commit -m "fix(erp): la fecha propuesta en movimientos era UTC, no hora Peru"
```

---

## Tarea 2: La lectura semanal de ventas contra la meta

El semáforo de las 4 semanas necesita partir el periodo igual que el motor (RN-12: **la última
semana absorbe los días sobrantes**) y comparar con `>` estricto (§9.3: empatar la meta no la
cumple).

> ⚠️ **Corregido tras un hallazgo del implementador.** La primera versión de esta tarea
> reimplementaba el partido en semanas desde cero. Eso estaba mal: `tramosSemanales()` **ya
> existe**, exportada desde `packages/core/src/sueldos.ts:515`, con sus propios tests en
> `sueldos.test.ts:401` y en uso real dentro de `liquidarPeriodo()` (línea 828) — es literalmente
> RN-12, no un espejo de RN-12. Reimplementarla habría creado dos versiones que podían divergir,
> exactamente el riesgo que esta misma tarea quería evitar. La versión corregida **reutiliza**
> `tramosSemanales` y `diasDelPeriodo` (también ya exportada, `sueldos.ts:384`, con su propia
> validación de fechas) en vez de duplicarlas. Lo único nuevo de verdad es `semanasConMeta`, que
> no existía en ninguna forma reutilizable fuera de `liquidarPeriodo()`.

Es lógica de presentación —el motor sigue siendo la verdad para el pago— pero al reutilizar las
funciones del motor en vez de copiarlas, la pantalla no puede empezar a mentir: es literalmente el
mismo código.

**Dónde vive, y por qué no en `apps/erp-web/lib/`.** `tools/verificar-local.sh:69` corre vitest
**sólo dentro de `packages/core`** (`cd packages/core && node vitest run`), y no hay ninguna
configuración de vitest en `apps/erp-web`. Un test puesto en `apps/erp-web/lib/` no lo ejecutaría
nadie: pasaría en verde por no existir, que es peor que no tenerlo.

Va en `packages/core/src/semanas-meta.ts` y se exporta desde el índice del paquete. **No es una
regla de negocio nueva**: es una lectura sobre la misma función de RN-12 que ya usa el motor. No
toca ninguna función existente del core, así que no entra en el rigor de "cambiar la cadena del
sueldo"; agrega un módulo nuevo al lado, con sus tests.

**Archivos:**
- Crear: `packages/core/src/semanas-meta.ts`
- Test: `packages/core/src/semanas-meta.test.ts`
- Modificar: `packages/core/src/index.ts` (exportar el módulo nuevo)

**Interfaces:**
- Consume, de `packages/core/src/sueldos.ts` (**ya existen, no se reimplementan**):
  - `tramosSemanales(desde: string, hasta: string): { desde: string; hasta: string }[]` — línea 515.
  - `diasDelPeriodo(desde: string, hasta: string): string[]` — línea 384. Valida las fechas y
    devuelve cada fecha del rango; `.length` da la cantidad de días.
- Produce, y las tareas 3 y 4 dependen de estos nombres exactos:

```ts
export type SemanaMeta = {
  numero: number;        // 1-based
  desde: string;         // 'YYYY-MM-DD'
  hasta: string;         // 'YYYY-MM-DD' inclusive
  dias: number;
  vendido: number;
  meta: number;
  cumplida: boolean;
};

export function semanasConMeta(
  desde: string,
  hasta: string,
  ventas: { fecha: string; monto: number }[],
  metaSemanal: number,
): SemanaMeta[];
```

**`tramosSemanales` NO se re-exporta desde `semanas-meta.ts`.** Ya es pública desde `sueldos.ts` y
`index.ts` ya hace `export * from './sueldos'`; exportarla de nuevo desde el módulo nuevo con el
mismo nombre es exactamente el choque que este hallazgo destapó. Si algo necesita `tramosSemanales`
directa, la importa de `@scilb/core` tal cual — ya está ahí.

- [ ] **Paso 1: Confirmar las dos funciones que se reutilizan**

Ejecutar:

```bash
grep -n "export function tramosSemanales\|export function diasDelPeriodo" packages/core/src/sueldos.ts
```

Esperado: las dos firmas, en las líneas 515 y 384 (pueden haberse corrido unas líneas; lo que
importa es que ambas sigan exportadas con esa firma). Si alguna no existe o cambió de firma,
**parar y reportar** — el resto de esta tarea depende de que sean así.

- [ ] **Paso 2: Escribir los tests que fallan**

Crear `packages/core/src/semanas-meta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { semanasConMeta } from './semanas-meta';

describe('semanasConMeta', () => {
  const ventas = [
    { fecha: '2025-06-17', monto: 1800 },
    { fecha: '2025-06-24', monto: 1800 },
    { fecha: '2025-07-01', monto: 1800 },
    { fecha: '2025-07-08', monto: 1800 },
  ];

  it('suma las ventas dentro de cada semana', () => {
    const s = semanasConMeta('2025-06-16', '2025-07-16', ventas, 1500);
    expect(s.map((x) => x.vendido)).toEqual([1800, 1800, 1800, 1800]);
  });

  it('cumple con mayor estricto: empatar la meta no la cumple', () => {
    const s = semanasConMeta('2025-06-16', '2025-06-22', [{ fecha: '2025-06-17', monto: 1500 }], 1500);
    expect(s[0].cumplida).toBe(false);
  });

  it('una venta fuera del periodo no entra en ninguna semana', () => {
    const s = semanasConMeta('2025-06-16', '2025-06-22', [{ fecha: '2025-08-01', monto: 999 }], 1500);
    expect(s[0].vendido).toBe(0);
  });

  it('numera las semanas desde 1, reporta sus dias, y la ultima absorbe lo sobrante (RN-12)', () => {
    const s = semanasConMeta('2025-06-16', '2025-07-16', ventas, 1500);
    expect(s.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
    expect(s[3].dias).toBe(10);
    expect(s[3]).toMatchObject({ desde: '2025-07-07', hasta: '2025-07-16' });
  });

  it('un periodo mas corto que una semana da una sola semana', () => {
    const s = semanasConMeta('2025-06-16', '2025-06-19', [], 1500);
    expect(s).toHaveLength(1);
    expect(s[0].dias).toBe(4);
  });
});
```

Nota: no hay `describe('tramosSemanales', ...)` en este archivo — esa función ya tiene sus tests
en `packages/core/src/sueldos.test.ts:401` y `:410`. Duplicarlos acá sería la misma clase de
problema que causó el hallazgo.

- [ ] **Paso 3: Correr los tests y ver que fallan**

Ejecutar: `bash tools/verificar-local.sh --rapido`
Esperado: FALLA con "Cannot find module './semanas-meta'".

- [ ] **Paso 4: Escribir la implementación mínima**

Crear `packages/core/src/semanas-meta.ts`:

```ts
// La lectura semanal de ventas que muestra la pantalla. NO es el motor: el pago sale de
// liquidarPeriodo(). Reutiliza tramosSemanales() y diasDelPeriodo() de sueldos.ts en vez de
// reimplementarlas — son RN-12, no un espejo de RN-12. Lo unico nuevo aca es cruzar esas semanas
// con las ventas y la meta, algo que hoy solo existia enterrado dentro de liquidarPeriodo().
//
// El estricto de cumplida (`>`, no `>=`) copia SPEC-sistema-sueldos.md §9.3: empatar la meta no
// la cumple.

import { diasDelPeriodo, tramosSemanales } from './sueldos';

export type SemanaMeta = {
  numero: number;
  desde: string;
  hasta: string;
  dias: number;
  vendido: number;
  meta: number;
  cumplida: boolean;
};

/** Las semanas del periodo con lo vendido en cada una y si llego a la meta. */
export function semanasConMeta(
  desde: string,
  hasta: string,
  ventas: { fecha: string; monto: number }[],
  metaSemanal: number,
): SemanaMeta[] {
  return tramosSemanales(desde, hasta).map((t, i) => {
    const vendido = ventas
      .filter((v) => v.fecha >= t.desde && v.fecha <= t.hasta)
      .reduce((s, v) => s + v.monto, 0);
    return {
      numero: i + 1,
      desde: t.desde,
      hasta: t.hasta,
      dias: diasDelPeriodo(t.desde, t.hasta).length,
      vendido,
      meta: metaSemanal,
      // Estricto a proposito: empatar la meta no la cumple (SPEC-sistema-sueldos §9.3).
      cumplida: vendido > metaSemanal,
    };
  });
}
```

- [ ] **Paso 5: Correr los tests y ver que pasan**

Ejecutar: `bash tools/verificar-local.sh --rapido`
Esperado: los 5 tests de `semanas-meta.test.ts` en PASS, y los 388 que ya existían sin regresiones
(incluidos los de `tramosSemanales` en `sueldos.test.ts`, que no se tocaron).

- [ ] **Paso 6: Exportarlo desde el índice del paquete**

En `packages/core/src/index.ts`, agregar al final de la lista de exports:

```ts
export * from './semanas-meta';
```

- [ ] **Paso 7: Verificar completo**

Ejecutar: `bash tools/verificar-local.sh`
Esperado: guard, typecheck y tests en verde. El typecheck es el que comprueba que el export nuevo
no choca con ningún nombre ya exportado por otro módulo del core — esta vez no debería, porque
`semanas-meta.ts` ya no redefine `tramosSemanales`.

- [ ] **Paso 8: Commit**

```bash
git add packages/core/src/semanas-meta.ts packages/core/src/semanas-meta.test.ts packages/core/src/index.ts
git commit -m "feat(core): la lectura semanal de ventas contra la meta, reusando tramosSemanales"
```

---

## Tarea 3: Las ventas salen a su propia pantalla

Hoy la carga de ventas comparte pantalla con adelantos y descuentos
(`movimientos/cliente.tsx`, 403 líneas con dos formularios distintos). Son dos trabajos
diferentes: los movimientos se registran de a uno cuando ocurren; las ventas se **transcriben
desde tuxedo en tandas**, que es lo que el administrador ya hacía hacia su Excel.

La pantalla nueva se optimiza para eso: el formulario no se limpia de fecha ni de sede entre
cargas, así que transcribir veinte boletas de la misma tienda es escribir veinte montos.

**Archivos:**
- Crear: `apps/erp-web/app/sueldos/ventas/page.tsx`
- Crear: `apps/erp-web/app/sueldos/ventas/cliente.tsx`
- Crear: `apps/erp-web/app/sueldos/ventas/actions.ts`
- Modificar: `apps/erp-web/app/sueldos/movimientos/page.tsx`
- Modificar: `apps/erp-web/app/sueldos/movimientos/cliente.tsx`
- Modificar: `apps/erp-web/app/sueldos/movimientos/actions.ts`

**Interfaces:**
- Consume, con estas firmas exactas de `apps/erp-web/lib/sueldos-repo.ts`:
  - `listarVentas(f: { empleadoId?, desde?, hasta?, soloSinAsignar? }): Promise<VentaSueldo[]>` — el
    filtro `soloSinAsignar` ya existe y es el que alimenta la cola: **no hace falta filtrar a mano**.
  - `crearVenta(p: VentaInput): Promise<string>` con
    `VentaInput = { fecha, monto, tipo: 'venta' | 'alquiler', sedeCod: string | null, empleadoId: string | null, vendedorExterno?: string | null }`
  - `asignarVendedor(ventaId: string, empleadoId: string): Promise<void>`
  - `eliminarVenta(id: string): Promise<void>`
  - `semanasConMeta` y el tipo `SemanaMeta` de la Tarea 2, importados desde el paquete:
    `import { semanasConMeta, type SemanaMeta } from '@scilb/core';`
  - `hoyPeru()` de `apps/erp-web/lib/fechas.ts`.
- Produce: la ruta `/sueldos/ventas`, que la Tarea 6 enlaza desde el hub.

- [ ] **Paso 1: Leer lo que hay que mudar**

Ejecutar, y leer los tres resultados antes de escribir nada:

```bash
sed -n '1,60p' apps/erp-web/app/sueldos/movimientos/page.tsx
sed -n '60,108p' apps/erp-web/app/sueldos/movimientos/actions.ts
grep -n "venta\|Venta" apps/erp-web/app/sueldos/movimientos/cliente.tsx
```

Esperado: ver `listarVentas({})` en el `page.tsx`, las tres acciones de venta en `actions.ts`, y
el bloque de ventas del cliente (formulario + tabla + cola sin vendedor).

- [ ] **Paso 2: Crear las acciones de la pantalla nueva**

Crear `apps/erp-web/app/sueldos/ventas/actions.ts`, copiando de
`movimientos/actions.ts` **sólo** las tres acciones de venta, con la misma validación que ya
tenían (leerlas en el paso 1 y conservarlas tal cual: monto mayor a cero, fecha obligatoria):

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { asignarVendedor, crearVenta, eliminarVenta } from '../../../lib/sueldos-repo';

// Las ventas se transcriben desde tuxedo (el POS de las tiendas, que no se integra con nada), asi
// que esta pantalla es la que reemplaza al Excel del administrador. La validacion es la misma que
// tenia en /sueldos/movimientos: no se aflojo nada al mudarla.

// La firma es la de VentaInput (lib/sueldos-repo.ts:494), incluido vendedorExterno: una boleta
// puede venir de alguien que no esta en la planilla, y perder ese campo al mudar la accion
// romperia la carga de esas ventas.
export async function accionCrearVenta(p: {
  fecha: string;
  monto: number;
  tipo: 'venta' | 'alquiler';
  sedeCod: string | null;
  empleadoId: string | null;
  vendedorExterno?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!p.fecha) return { ok: false, error: 'Falta la fecha de la venta.' };
  if (!(p.monto > 0)) return { ok: false, error: 'El monto tiene que ser mayor a cero.' };
  try {
    await crearVenta(p);
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la venta.' };
  }
}

export async function accionAsignarVendedor(
  ventaId: string,
  empleadoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await asignarVendedor(ventaId, empleadoId);
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo asignar el vendedor.' };
  }
}

export async function accionEliminarVenta(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await eliminarVenta(id);
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo eliminar la venta.' };
  }
}
```

> Si al leer `movimientos/actions.ts` en el paso 1 las firmas no coinciden con estas, mandan las
> del archivo real: copiarlas exactas y ajustar el cliente. No inventar una validación distinta.

- [ ] **Paso 3: Crear el server component**

Crear `apps/erp-web/app/sueldos/ventas/page.tsx`, copiando el patrón de sesión y permisos de
`apps/erp-web/app/sueldos/movimientos/page.tsx` (leerlo primero: usa `getSesion` y el módulo de
permiso `sueldos`):

```tsx
import { listarVentas } from '../../../lib/sueldos-repo';
import { leerPeriodo } from '../../../lib/periodo';
import { VentasCliente } from './cliente';

// Misma comprobacion de sesion y permiso que /sueldos/movimientos: esta pantalla muestra ventas
// por vendedor, que alimentan el pago de esa persona.
export default async function VentasPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string };
}) {
  // ... aqui va el mismo bloque de sesion/permiso que movimientos/page.tsx, copiado literal ...
  const periodo = leerPeriodo(searchParams);
  const ventas = await listarVentas({ desde: periodo.desde, hasta: periodo.hasta });

  return <VentasCliente ventas={ventas} periodo={periodo} /* + empleados y sedes como en movimientos */ />;
}
```

> El bloque de sesión, el gate de permiso y la carga de empleados se copian **literales** de
> `movimientos/page.tsx`. No se reescriben: esa pantalla ya resuelve el aislamiento por sede y
> la reautenticación, y una segunda versión sería una segunda verdad.

- [ ] **Paso 4: Crear el cliente con carga rápida y semáforo**

Crear `apps/erp-web/app/sueldos/ventas/cliente.tsx`. Tres bloques, en este orden:

1. **Semáforo semanal** arriba: una fila de tarjetas, una por semana de `semanasConMeta()`.
   Cumplida en `border-exito-line bg-exito-soft text-exito-deep`; no cumplida en
   `border-line bg-paper text-muted`. Cada una muestra `Semana N`, el rango, `S/ vendido` y
   `meta S/ x`, todos con `tabular-nums`. La semana que dura más de 7 días lo dice
   (`10 días`), porque su meta sube con ella (RN-12).
2. **Formulario de transcripción**: fecha, tienda, tipo (`OpcionBotones` con `venta` / `alquiler`),
   monto y vendedor. Al guardar con éxito **se limpia sólo el monto y el vendedor**; fecha, tienda
   y tipo quedan como estaban. Ese es el punto de la pantalla.
3. **Tabla de lo cargado**, con la cola de ventas sin vendedor **arriba y destacada** en
   `border-aviso-line bg-aviso-soft` — nada se descarta en silencio. Las boletas con monto mayor
   al mínimo de comisión llevan un `Badge` `gold` que dice `comisiona`.

Reglas de escritura y estilo para este archivo:

```tsx
// El monto se muestra siempre con soles() y tabular-nums.
const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

- El estado inicial de fecha usa `hoyPeru()`, nunca `new Date()`.
- El error de una acción disparada desde la tabla va en un `errorAccion` propio, arriba de todo y
  siempre a la vista (§6 del sistema de diseño): dentro del formulario no se vería.
- Eliminar una venta pasa por `DialogoConfirmar` + `useConfirmacion`, con el monto y la fecha en
  el título. Nunca `window.confirm()`.
- El botón de guardar deshabilitado dice por qué, con `aria-describedby`, y el motivo se ve en el
  celular (sin `hidden sm:inline`).

- [ ] **Paso 5: Sacar las ventas de movimientos**

En `apps/erp-web/app/sueldos/movimientos/page.tsx`: borrar el `listarVentas({})` de la carga y la
prop `ventas` que se le pasa al cliente.

En `apps/erp-web/app/sueldos/movimientos/actions.ts`: borrar `accionCrearVenta`,
`accionAsignarVendedor` y `accionEliminarVenta`, y sus imports de `crearVenta`, `asignarVendedor`
y `eliminarVenta`.

En `apps/erp-web/app/sueldos/movimientos/cliente.tsx`: borrar el estado `venta`, su formulario,
su tabla, la cola de sin-asignar, la prop `ventas` y los imports que quedan sin uso
(`VentaSueldo`, las tres acciones). Dejar en su lugar una línea que diga dónde fueron:

```tsx
<p className="text-sm text-muted">
  Las ventas se cargan en <a className="text-gold-deep underline" href="/sueldos/ventas">Ventas y metas</a>.
</p>
```

- [ ] **Paso 6: Comprobar que no quedaron referencias muertas**

Ejecutar: `grep -rn "accionCrearVenta\|accionEliminarVenta\|accionAsignarVendedor" apps/erp-web/app/sueldos/movimientos/`
Esperado: sin resultados.

Ejecutar: `grep -rn "listarVentas" apps/erp-web/app/`
Esperado: dos resultados — `app/sueldos/ventas/page.tsx` y
`app/colaboradores/[id]/movimientos/page.tsx`. **El segundo se queda**: esa sección muestra las
ventas de una persona en su período y sigue siendo correcta.

- [ ] **Paso 7: Verificar**

Ejecutar: `bash tools/verificar-local.sh`
Esperado: guard, typecheck y tests en verde.

- [ ] **Paso 8: Commit**

```bash
git add apps/erp-web/app/sueldos/ventas apps/erp-web/app/sueldos/movimientos
git commit -m "feat(erp): las ventas tienen pantalla propia, con el semaforo de las cuatro semanas"
```

---

## Tarea 4: La liquidación avisa cuando el periodo no tiene ventas cargadas

Decidido el 22-ago: un olvido de carga no puede volverse un pago sin comisión que nadie notó. El
motor ya emite la advertencia; lo que falta es que la pantalla la muestre de forma imposible de
ignorar, y no como una línea más entre otras.

**Archivos:**
- Modificar: `apps/erp-web/app/sueldos/liquidaciones/cliente.tsx`

**Interfaces:**
- Consume: el `Preview` que ya devuelve `accionCalcular` de
  `apps/erp-web/app/sueldos/liquidaciones/actions.ts`, y su lista de advertencias.
- Produce: nada nuevo.

- [ ] **Paso 1: Ver cómo llegan hoy las advertencias**

Ejecutar: `grep -n "advertencia\|Advertencia" apps/erp-web/app/sueldos/liquidaciones/cliente.tsx apps/erp-web/app/sueldos/liquidaciones/actions.ts`
Esperado: ver dónde el cliente ya las renderiza y con qué nombre viaja el campo.

- [ ] **Paso 2: Destacar la de "sin ventas"**

En el bloque donde el cliente ya pinta las advertencias del preview, separar esa de las demás.
El texto exacto de la advertencia se lee en el paso 1; el criterio es buscar la que habla de
ventas. Va arriba del desglose, no entre las otras:

```tsx
{sinVentas && (
  <div
    role="alert"
    className="mb-4 rounded-lg border border-error-line bg-error-soft px-4 py-3 text-sm text-error-deep"
  >
    <p className="font-medium">Este periodo no tiene ninguna venta cargada.</p>
    <p className="mt-1">
      Sin ventas no hay bono de meta semanal ni comision. Si todavia no las transcribiste desde
      tuxedo, cargalas en <a className="underline" href="/sueldos/ventas">Ventas y metas</a> antes
      de cerrar.
    </p>
  </div>
)}
```

`role="alert"` porque interrumpe (§6 del sistema de diseño: el error interrumpe, el acierto
informa). Las demás advertencias siguen como estaban, con `role="status"`.

- [ ] **Paso 3: Comprobar los tokens**

Ejecutar: `bash tools/guard-reglas.sh`
Esperado: la regla `diseno` en verde — el bloque nuevo usa `error-line` / `error-soft` /
`error-deep`, no `red-*`.

- [ ] **Paso 4: Verificar**

Ejecutar: `bash tools/verificar-local.sh`
Esperado: todo en verde.

- [ ] **Paso 5: Commit**

```bash
git add apps/erp-web/app/sueldos/liquidaciones/cliente.tsx
git commit -m "feat(erp): liquidar sin ventas cargadas ahora avisa fuerte, no en letra chica"
```

---

## Tarea 5: El resumen mensual imprimible (PEND-09)

La hoja `RESUMEN` del Excel calculaba el total por su cuenta y daba un número distinto al de la
otra hoja (S/766 contra S/805 en el archivo v20). Esta pantalla **no calcula nada**: lee la
liquidación guardada y la muestra. Esa es toda la especificación de PEND-09.

Sigue el patrón de `apps/erp-web/app/pagos/[id]/comprobante/`: un `page.tsx` server con el
documento y un cliente chico sólo para el botón de imprimir.

**Archivos:**
- Crear: `apps/erp-web/app/sueldos/liquidaciones/[id]/comprobante/page.tsx`
- Crear: `apps/erp-web/app/sueldos/liquidaciones/[id]/comprobante/imprimir.tsx`
- Modificar: `apps/erp-web/app/sueldos/liquidaciones/cliente.tsx` (enlace al comprobante)

**Interfaces:**
- Consume: `obtenerLiquidacion(id)` de `apps/erp-web/lib/sueldos-repo.ts:782`, que devuelve
  `LiquidacionDetalle` con sus `LineaGuardada[]`.
- Produce: la ruta `/sueldos/liquidaciones/[id]/comprobante`.

- [ ] **Paso 1: Leer el patrón que se va a copiar**

Ejecutar:

```bash
cat apps/erp-web/app/pagos/\[id\]/comprobante/imprimir.tsx
sed -n '1,60p' apps/erp-web/app/pagos/\[id\]/comprobante/page.tsx
```

Esperado: ver el `'use client'` con `window.print()` envuelto en `print:hidden`, y la cabecera
del documento con `print:border-0 print:shadow-none`.

- [ ] **Paso 2: Crear el botón de impresión**

Crear `apps/erp-web/app/sueldos/liquidaciones/[id]/comprobante/imprimir.tsx`:

```tsx
'use client';

import { Printer } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';

/** Envuelto en print:hidden: el boton no sale en el papel. */
export function ImprimirResumen() {
  return (
    <div className="mb-4 flex justify-end print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
        Imprimir
      </Button>
    </div>
  );
}
```

- [ ] **Paso 3: Crear el documento**

Crear `apps/erp-web/app/sueldos/liquidaciones/[id]/comprobante/page.tsx`. Estructura:

```tsx
import { notFound } from 'next/navigation';
import { obtenerLiquidacion } from '../../../../../lib/sueldos-repo';
import { ImprimirResumen } from './imprimir';

// PEND-09. Vista de SOLO LECTURA del resultado del motor: no recalcula ni una linea. La hoja
// RESUMEN del Excel calculaba su propio total y daba un numero distinto al de la otra hoja; ese
// error no se repite. Todo lo que se ve aca sale de las lineas guardadas de la liquidacion.

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ComprobanteLiquidacionPage({ params }: { params: { id: string } }) {
  const liq = await obtenerLiquidacion(params.id);
  if (!liq) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <ImprimirResumen />
      <article className="rounded-lg border border-line bg-white p-10 shadow-card print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-navy pb-4">
          <div>
            <div className="text-3xl font-semibold text-navy">LuceBien</div>
            <div className="mt-1 tabular-nums text-[10px] tracking-brand text-gold">
              RESUMEN DE LIQUIDACION · SCI-LB
            </div>
            <div className="mt-2 text-xs text-muted">Confecciones Aliaga E.I.R.L. · Huancayo, Peru</div>
          </div>
          {/* Fecha del periodo y estado de la liquidacion, con tabular-nums */}
        </header>

        {/* 1. Persona y periodo */}
        {/* 2. El desglose completo, agrupado ingreso / descuento / ajuste / final, igual que
               en la pantalla: concepto, de donde sale, regla, monto */}
        {/* 3. El total, destacado */}
        {/* 4. Observaciones y pendientes de regularizar, si los hay */}
      </article>
    </div>
  );
}
```

Reglas del documento:
- **Ninguna suma se calcula acá.** Los totales se leen de las líneas guardadas (`grupo === 'final'`).
  Si hace falta un número que no está guardado, **no se inventa**: se anota y se pregunta.
- Todos los montos con `soles()` y `tabular-nums`.
- Sin colores de estado en el papel salvo el navy y el oro de la cabecera: una impresión en blanco
  y negro tiene que seguir leyéndose.

- [ ] **Paso 4: Enlazar desde la lista**

En `apps/erp-web/app/sueldos/liquidaciones/cliente.tsx`, en la fila de cada liquidación **cerrada**,
agregar el enlace al comprobante junto a las acciones que ya existen:

```tsx
<a
  className="text-gold-deep underline"
  href={`/sueldos/liquidaciones/${l.id}/comprobante`}
>
  Resumen
</a>
```

Sólo para las cerradas: un borrador todavía puede cambiar, y un papel impreso de algo que después
cambia es exactamente el problema que tenía el Excel.

- [ ] **Paso 5: Verificar**

Ejecutar: `bash tools/verificar-local.sh`
Esperado: todo en verde.

- [ ] **Paso 6: Commit**

```bash
git add apps/erp-web/app/sueldos/liquidaciones
git commit -m "feat(erp): el resumen mensual imprimible, que solo lee lo que calculo el motor"
```

---

## Tarea 6: El hub del módulo muestra el ciclo del periodo

`/sueldos` no tiene `page.tsx`: hoy entrar a la ruta no lleva a ningún lado. El hub muestra las
cinco etapas de la operación en el orden en que se recorren, con la entrada a cada una.

**Archivos:**
- Crear: `apps/erp-web/app/sueldos/page.tsx`

**Interfaces:**
- Consume: nada nuevo. Enlaza a `/sueldos/acuerdos`, `/sueldos/asistencia`, `/sueldos/ventas`,
  `/sueldos/movimientos` y `/sueldos/liquidaciones`.
- Produce: la ruta `/sueldos`.

- [ ] **Paso 1: Confirmar que la ruta no existe**

Ejecutar: `ls apps/erp-web/app/sueldos/`
Esperado: `acuerdos`, `asistencia`, `liquidaciones`, `movimientos`, `ventas`, `loading.tsx` — sin
`page.tsx`.

- [ ] **Paso 2: Crear el hub**

Crear `apps/erp-web/app/sueldos/page.tsx`:

```tsx
import Link from 'next/link';
import { CalendarCheck, Coins, FileSignature, ShoppingBag, Wallet } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';

// El ciclo del periodo en el orden en que se recorre. Quien administra piensa por proceso, y hasta
// ahora /sueldos no llevaba a ningun lado: habia que saberse las rutas.

const ETAPAS = [
  {
    href: '/sueldos/acuerdos',
    icono: FileSignature,
    titulo: 'Acuerdos',
    ayuda: 'Lo pactado con cada persona: horario, sueldo y meta',
  },
  {
    href: '/sueldos/asistencia',
    icono: CalendarCheck,
    titulo: 'Asistencia',
    ayuda: 'Que paso cada dia del periodo',
  },
  {
    href: '/sueldos/ventas',
    icono: ShoppingBag,
    titulo: 'Ventas y metas',
    ayuda: 'Las boletas transcritas y las cuatro semanas contra su meta',
  },
  {
    href: '/sueldos/movimientos',
    icono: Wallet,
    titulo: 'Adelantos y descuentos',
    ayuda: 'Lo que se entrego o se descuenta antes del pago',
  },
  {
    href: '/sueldos/liquidaciones',
    icono: Coins,
    titulo: 'Liquidaciones',
    ayuda: 'El calculo del periodo y su resumen',
  },
];

export default function SueldosPage() {
  return (
    <div className="animate-page-enter">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-navy">Sueldos</h1>
        <p className="mt-1 text-sm text-muted">
          El recorrido de un periodo, de lo pactado hasta el pago.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ETAPAS.map((e, i) => {
          const Icono = e.icono;
          return (
            <Link key={e.href} href={e.href} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Card interactive className="h-full">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="rounded-lg bg-navy/5 p-2 text-navy">
                    <Icono className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-medium text-navy">{e.titulo}</span>
                    <span className="mt-0.5 block text-sm text-muted">{e.ayuda}</span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

El escalonado de 40 ms entre tarjetas es el de la regla 3 del sistema de diseño (30 a 80 ms).

- [ ] **Paso 3: Comprobar que compila y que el guard pasa**

Ejecutar: `bash tools/verificar-local.sh`
Esperado: todo en verde. Si `Card` no acepta `interactive`, leer
`apps/erp-web/components/ui/card.tsx` y usar la prop real.

- [ ] **Paso 4: Commit**

```bash
git add apps/erp-web/app/sueldos/page.tsx
git commit -m "feat(erp): /sueldos muestra el ciclo del periodo en vez de no llevar a ningun lado"
```

---

## Tarea 7: Cerrar la fase

- [ ] **Paso 1: Correr la verificación completa**

Ejecutar: `bash tools/verificar-local.sh`
Esperado: guard, typecheck y la suite entera en verde.

- [ ] **Paso 2: Compilar como lo hace producción**

Ejecutar: `pnpm --filter erp-web build`
Esperado: build exitoso. Es la única red que hay contra una clase de Tailwind inventada.

- [ ] **Paso 3: Anotar lo aprendido**

En `docs/superpowers/specs/sueldos/2026-08-21-sueldos-flujo-maestro-design.md`, marcar F1 como
construida y anotar qué quedó afuera.

Si algo salió mal durante la fase, sumar una fila a `docs/aprendizajes.md` con qué se hizo mal,
qué costó y cómo se detecta ahora.

- [ ] **Paso 4: Commit de cierre**

```bash
git add docs/
git commit -m "docs(sueldos): F1 construida, con lo que quedo afuera anotado"
```

---

## Lo que esta fase NO hace

Para que nadie lo busque:

- **No toca el motor.** Ninguna regla de cálculo cambia.
- **No crea justificaciones** (F2), **ni admisión** (F3), **ni exámenes** (F4), **ni
  regularizaciones** (F5).
- **No mueve Liquidaciones dentro de `/colaboradores`.** Requiere decidir qué pasa cuando el
  período elegido no coincide con ningún contrato, y eso es decisión de negocio (spec del módulo
  de colaboradores §7.1).
- **No integra tuxedo.** La transcripción manual es el flujo de F1 y queda como respaldo
  permanente.
- **No agrega el expediente v1 más allá de lo que ya existe.** El módulo `/colaboradores` ya tiene
  sus siete secciones y su hilo; las secciones nuevas llegan con sus fases.
