// @ts-nocheck — mismo motivo que sueldos-repo.corregir.test.ts (vitest no es dependencia de erp-web).
//
// QUÉ PRUEBA (spec sueldos/2026-10-18-sueldo-por-horas §3.2 y §4, migración 0164). Con tarifa por
// hora no hay cuota: la entrada no calcula ninguna (`sueldoPactado` 0), un rango cualquiera —también
// uno desalineado que cruza un cambio de frecuencia— se puede liquidar, y el cierre no corta por una
// cuota que no existe. La tarifa viaja en `contratoPago`, que es lo que compara el cierre (0121).
import { describe, expect, it, vi } from 'vitest';

const ACUERDO = 'ac-h';
const pago = {
  contratoPago: { fechaInicio: '2026-08-10', fechaFin: '2027-02-09', modalidad: 'mensual', cadaDias: null, sueldoPactado: 0, tarifaHora: 5 },
  cambiosFrecuencia: [{ desde: '2026-09-10', modalidad: 'quincenal', cadaDias: null, sueldoPactado: 0, tarifaHora: 6 }],
};
const rpcs: string[] = [];
let liquidacionGuardada: unknown = null;

vi.mock('../directorio', () => ({ mapaNombres: vi.fn(async () => new Map()) }));
vi.mock('../temporadas-repo', () => ({ listarTemporadas: vi.fn(async () => []) }));
vi.mock('../supabase/server', () => ({
  getServerClient: vi.fn(() => ({
    rpc: async (nombre: string) => {
      rpcs.push(nombre);
      if (nombre === 'sueldo_entrada') {
        return { data: { acuerdoId: ACUERDO, empleadoId: 'e-1', modalidad: 'mensual', sueldoPactado: 0 }, error: null };
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

describe('pago por horas en el repo (0164)', () => {
  it('la entrada no calcula cuota y conserva la tarifa en contratoPago', async () => {
    const e = await repo.entradaDeAcuerdo(ACUERDO, '2026-09-10', '2026-09-24');
    expect(e.sueldoPactado).toBe(0);
    expect(e.contratoPago).toEqual(pago.contratoPago);
    expect(e.cambiosFrecuencia).toEqual(pago.cambiosFrecuencia);
  });

  it('un rango desalineado que cruza un cambio se puede liquidar (paga sus horas)', async () => {
    const e = await repo.entradaDeAcuerdo(ACUERDO, '2026-09-01', '2026-09-24');
    expect(e.sueldoPactado).toBe(0);
  });

  it('el cierre de un borrador por horas pasa a la RPC sin chequeo de cuota', async () => {
    liquidacionGuardada = {
      id: 'l-h', acuerdo_id: ACUERDO, empleado_id: 'e-1', estado: 'borrador',
      periodo_desde: '2026-09-01', periodo_hasta: '2026-09-24',
      entrada: { ...pago, sueldoPactado: 0 }, resultado: { lineas: [] }, total: 0,
      sueldo_liquidacion_lineas: [],
    };
    rpcs.length = 0;
    await repo.cerrarLiquidacion('l-h');
    expect(rpcs).toContain('sueldo_liquidacion_cerrar');
  });
});
