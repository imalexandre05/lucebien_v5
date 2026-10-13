// @ts-nocheck
//
// `@ts-nocheck` por el mismo motivo que `sueldos-repo.corregir.test.ts`: vitest no es dependencia
// declarada de erp-web y el typecheck incluye `**/*.ts`. No afecta la ejecución.
//
// QUÉ PRUEBA. El filtro `incluirSinLiquidar` de `listarMovimientos` (spec
// 2026-10-03-adelantos-rendimiento-design.md §4): con rango, la consulta trae el rango MÁS todo lo
// sin liquidar, en un solo `or`; sin la opción, la consulta es la de siempre (gte/lte sueltos). Un
// `or` mal armado escondería un adelanto pendiente de otro mes, que es justo lo que la pantalla no
// puede hacer.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Llamada = [string, ...unknown[]];
let llamadas: Llamada[] = [];

function constructor() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'is', 'or']) {
    q[m] = (...args: unknown[]) => {
      llamadas.push([m, ...args]);
      return q;
    };
  }
  q.then = (res: (v: unknown) => void) => res({ data: [], error: null });
  return q;
}

vi.mock('../directorio', () => ({ mapaNombres: vi.fn(async () => new Map()) }));
vi.mock('../supabase/server', () => ({
  getServerClient: vi.fn(() => ({ from: () => constructor() })),
}));

import { listarMovimientos } from '../sueldos-repo';

const filtros = () => llamadas.filter(([m]) => ['eq', 'gte', 'lte', 'is', 'or'].includes(m));

describe('listarMovimientos — incluirSinLiquidar', () => {
  beforeEach(() => {
    llamadas = [];
  });

  it('con rango, trae el rango más todo lo sin liquidar en un solo or', async () => {
    await listarMovimientos({ desde: '2026-10-01', hasta: '2026-10-31', incluirSinLiquidar: true });
    expect(filtros()).toEqual([
      ['or', 'liquidacion_id.is.null,and(fecha.gte.2026-10-01,fecha.lte.2026-10-31)'],
    ]);
  });

  it('sin la opción, el rango es el de siempre', async () => {
    await listarMovimientos({ empleadoId: 'e1', desde: '2026-10-01', hasta: '2026-10-31' });
    expect(filtros()).toEqual([
      ['eq', 'empleado_id', 'e1'],
      ['gte', 'fecha', '2026-10-01'],
      ['lte', 'fecha', '2026-10-31'],
    ]);
  });

  it('la opción sin rango completo no agrega el or', async () => {
    await listarMovimientos({ desde: '2026-10-01', incluirSinLiquidar: true });
    expect(filtros()).toEqual([['gte', 'fecha', '2026-10-01']]);
  });
});
