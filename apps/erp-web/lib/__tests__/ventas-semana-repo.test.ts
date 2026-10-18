// @ts-nocheck
//
// `@ts-nocheck` por el mismo motivo que `sueldos-repo.movimientos.test.ts`: vitest no es dependencia
// declarada de erp-web y el typecheck incluye `**/*.ts`. No afecta la ejecución.
//
// QUÉ PRUEBA. El repo de ventas y metas por semana (migración 0166, decisión del dueño n.º 8):
// la lectura filtra por persona y por las semanas que EMPIEZAN dentro del rango; el guardado es un
// upsert por (empleado_id, desde), así que cargar dos veces la misma semana la reemplaza en vez de
// duplicarla; y el corte `PERIODO_CERRADO:` de la base llega a la pantalla como una frase amable.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Llamada = [string, ...unknown[]];
let llamadas: Llamada[] = [];
let respuesta: { data: unknown; error: unknown } = { data: [], error: null };

function constructor() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'upsert', 'single']) {
    q[m] = (...args: unknown[]) => {
      llamadas.push([m, ...args]);
      return q;
    };
  }
  q.then = (res: (v: unknown) => void) => res(respuesta);
  return q;
}

vi.mock('../supabase/server', () => ({
  getServerClient: vi.fn(() => ({
    from: (t: string) => {
      llamadas.push(['from', t]);
      return constructor();
    },
  })),
}));

import { guardarVentaSemana, listarVentasSemana } from '../ventas-semana-repo';

const entrada = {
  empleadoId: 'e1',
  desde: '2026-10-05',
  hasta: '2026-10-11',
  totalBoletasMayores: 1000,
  metaCumplida: true,
  montoVendido: null,
};

describe('listarVentasSemana', () => {
  beforeEach(() => {
    llamadas = [];
  });

  it('pide la tabla de la persona, por semanas que empiezan en el rango, y devuelve números', async () => {
    respuesta = {
      data: [
        {
          empleado_id: 'e1',
          desde: '2026-10-05',
          hasta: '2026-10-11',
          total_boletas_mayores: '1000.50',
          meta_cumplida: null,
          monto_vendido: '1500',
        },
      ],
      error: null,
    };
    const filas = await listarVentasSemana('e1', '2026-10-01', '2026-10-31');
    expect(llamadas.filter(([m]) => ['from', 'eq', 'gte', 'lte'].includes(m))).toEqual([
      ['from', 'sueldo_ventas_semana'],
      ['eq', 'empleado_id', 'e1'],
      ['gte', 'desde', '2026-10-01'],
      ['lte', 'desde', '2026-10-31'],
    ]);
    expect(filas).toEqual([
      {
        empleadoId: 'e1',
        desde: '2026-10-05',
        hasta: '2026-10-11',
        totalBoletasMayores: 1000.5,
        metaCumplida: null,
        montoVendido: 1500,
      },
    ]);
  });
});

describe('guardarVentaSemana', () => {
  beforeEach(() => {
    llamadas = [];
    respuesta = { data: null, error: null };
  });

  it('hace upsert por persona y primer día de la semana', async () => {
    await guardarVentaSemana(entrada, 'admin1');
    const up = llamadas.find(([m]) => m === 'upsert');
    expect(up?.[1]).toEqual({
      empleado_id: 'e1',
      desde: '2026-10-05',
      hasta: '2026-10-11',
      total_boletas_mayores: 1000,
      meta_cumplida: true,
      monto_vendido: null,
      creado_por: 'admin1',
    });
    expect(up?.[2]).toEqual({ onConflict: 'empleado_id,desde' });
  });

  it('traduce el corte de pago cerrado a una frase amable', async () => {
    respuesta = {
      data: null,
      error: { message: 'PERIODO_CERRADO:la semana del 05/10/2026 ya está en un pago cerrado; no se puede cambiar' },
    };
    await expect(guardarVentaSemana(entrada, 'admin1')).rejects.toThrow(
      'Esa semana ya está en un pago cerrado: no se puede cambiar.',
    );
  });

  it('un error cualquiera no muestra texto técnico', async () => {
    respuesta = { data: null, error: { message: 'duplicate key value violates unique constraint' } };
    await expect(guardarVentaSemana(entrada, 'admin1')).rejects.toThrow(/No se pudo guardar/);
  });

  it('no manda a la base un monto negativo', async () => {
    await expect(guardarVentaSemana({ ...entrada, totalBoletasMayores: -1 }, 'admin1')).rejects.toThrow(
      /no puede ser negativ/,
    );
    await expect(guardarVentaSemana({ ...entrada, montoVendido: -5 }, 'admin1')).rejects.toThrow(
      /no puede ser negativ/,
    );
    expect(llamadas.some(([m]) => m === 'upsert')).toBe(false);
  });
});
