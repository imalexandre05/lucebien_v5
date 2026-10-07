// @ts-nocheck — mismo motivo que sueldos-repo.corregir.test.ts (vitest no es dependencia de erp-web).
//
// QUÉ PRUEBA (spec frecuencia-pago-flexible §9.3, migración 0121, auditoría D-1/D-4). Que la cuota
// del tramo salga del core con los datos de pago que devuelve `sueldo_entrada_pago` —los mismos que
// compara el cierre— y que esos datos viajen en la entrada guardada:
//   - E2: mensual S/1300 → quincenal S/700 desde el 10-sep: el tramo 10–24 sep recibe 700;
//   - D-4: «Recalcular» del 10-sep al 09-oct recibe 700 + 700;
//   - corregir con la cuota pagada la marca como `cuotaFijada`;
//   - el cierre corta ANTES de la RPC si la cuota guardada no es la que dan los datos guardados.
import { describe, expect, it, vi } from 'vitest';

const ACUERDO = 'ac-1';
const pago = {
  contratoPago: { fechaInicio: '2026-08-10', fechaFin: '2027-02-09', modalidad: 'mensual', cadaDias: null, sueldoPactado: 1300 },
  cambiosFrecuencia: [{ desde: '2026-09-10', modalidad: 'quincenal', cadaDias: null, sueldoPactado: 700 }],
};
const rpcs: string[] = [];
let liquidacionGuardada: unknown = null;

vi.mock('../directorio', () => ({ mapaNombres: vi.fn(async () => new Map()) }));
vi.mock('../supabase/server', () => ({
  getServerClient: vi.fn(() => ({
    rpc: async (nombre: string) => {
      rpcs.push(nombre);
      if (nombre === 'sueldo_entrada') {
        return { data: { acuerdoId: ACUERDO, empleadoId: 'e-1', modalidad: 'mensual', sueldoPactado: 1300 }, error: null };
      }
      if (nombre === 'sueldo_entrada_pago') return { data: pago, error: null };
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: liquidacionGuardada, error: null }) }) }),
    }),
  })),
}));

const repo = await import('../sueldos-repo');

describe('entradaDeAcuerdo — la cuota sale de los datos que compara el cierre (0121)', () => {
  it('E2: el tramo 10–24 sep posterior al cambio recibe 700 y guarda los datos de pago', async () => {
    const e = await repo.entradaDeAcuerdo(ACUERDO, '2026-09-10', '2026-09-24');
    expect(e.sueldoPactado).toBe(700);
    expect(e.contratoPago).toEqual(pago.contratoPago);
    expect(e.cambiosFrecuencia).toEqual(pago.cambiosFrecuencia);
    expect(e.cuotaFijada).toBeUndefined();
  });

  it('D-4: recalcular el rango mensual viejo (10-sep a 09-oct) cobra las dos quincenas', async () => {
    const e = await repo.entradaDeAcuerdo(ACUERDO, '2026-09-10', '2026-10-09');
    expect(e.sueldoPactado).toBe(1400);
  });

  it('un rango desalineado que cruza el cambio se rechaza como ESTADO', async () => {
    await expect(repo.entradaDeAcuerdo(ACUERDO, '2026-09-01', '2026-09-24')).rejects.toMatchObject({ codigo: 'ESTADO' });
  });

  it('corregir con la cuota pagada la marca como fijada', async () => {
    const e = await repo.entradaDeAcuerdo(ACUERDO, '2026-09-10', '2026-09-24', 650);
    expect(e).toMatchObject({ sueldoPactado: 650, cuotaFijada: true });
  });
});

describe('cerrarLiquidacion — chequeo previo con los datos guardados', () => {
  const fila = (sueldoPactado: number, extra = {}) => ({
    id: 'l-1', acuerdo_id: ACUERDO, empleado_id: 'e-1', estado: 'borrador',
    periodo_desde: '2026-09-10', periodo_hasta: '2026-09-24',
    entrada: { ...pago, sueldoPactado, ...extra }, resultado: { lineas: [] }, total: 0,
    sueldo_liquidacion_lineas: [],
  });

  it('una cuota guardada que no es la del calendario guardado corta sin llamar a la RPC', async () => {
    liquidacionGuardada = fila(1300);
    rpcs.length = 0;
    await expect(repo.cerrarLiquidacion('l-1')).rejects.toMatchObject({ codigo: 'DESACTUALIZADA' });
    expect(rpcs).not.toContain('sueldo_liquidacion_cerrar');
  });

  it('la cuota correcta pasa a la RPC; una cuota fijada (corrección) también', async () => {
    for (const f of [fila(700), fila(650, { cuotaFijada: true })]) {
      liquidacionGuardada = f;
      rpcs.length = 0;
      await repo.cerrarLiquidacion('l-1');
      expect(rpcs).toContain('sueldo_liquidacion_cerrar');
    }
  });
});
