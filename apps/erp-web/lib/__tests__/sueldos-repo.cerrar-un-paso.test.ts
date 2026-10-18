// @ts-nocheck — mismo motivo que sueldos-repo.corregir.test.ts (vitest no es dependencia de erp-web).
//
// QUÉ PRUEBA (spec sueldos/2026-10-18-pagos-programados-cierre-un-paso §5 y §7, casos 5 y 6). Cerrar
// es un solo paso: el borrador existe sólo adentro de la acción. Los colaboradores se inyectan, igual
// que en corregirLiquidacion, para no depender de la base.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../directorio', () => ({ mapaNombres: vi.fn(async () => new Map()) }));
vi.mock('../temporadas-repo', () => ({ listarTemporadas: vi.fn(async () => []) }));
vi.mock('../supabase/server', () => ({ getServerClient: vi.fn(() => ({})) }));

const repo = await import('../sueldos-repo');

function deps(o: { borradores?: unknown[]; cerrarFalla?: Error } = {}) {
  const llamadas: string[] = [];
  return {
    llamadas,
    d: {
      borradores: vi.fn(async () => o.borradores ?? []),
      eliminar: vi.fn(async (id: string) => void llamadas.push(`eliminar:${id}`)),
      crear: vi.fn(async (_a: string, _d: string, _h: string, cuota?: number) => {
        llamadas.push(`crear:${cuota ?? '-'}`);
        return 'nuevo';
      }),
      cerrar: vi.fn(async (id: string) => {
        llamadas.push(`cerrar:${id}`);
        if (o.cerrarFalla) throw o.cerrarFalla;
      }),
      corregir: vi.fn(async () => {
        llamadas.push('corregir');
        return { nuevoBorradorId: 'nuevo' };
      }),
    },
  };
}

describe('confirmarYCerrar', () => {
  it('borra los borradores que se pisan, crea y cierra', async () => {
    const { d, llamadas } = deps({ borradores: [{ id: 'viejo', entrada: { sueldoPactado: 600 } }] });
    const id = await repo.confirmarYCerrar('ac', '2026-09-05', '2026-10-04', d);
    expect(id).toBe('nuevo');
    expect(llamadas).toEqual(['eliminar:viejo', 'crear:-', 'cerrar:nuevo']);
  });

  it('reusa la cuota fijada de un borrador de corrección', async () => {
    const { d, llamadas } = deps({ borradores: [{ id: 'corr', entrada: { sueldoPactado: 650, cuotaFijada: true } }] });
    await repo.confirmarYCerrar('ac', '2026-09-05', '2026-10-04', d);
    expect(llamadas).toEqual(['eliminar:corr', 'crear:650', 'cerrar:nuevo']);
  });

  it('si el cierre falla, borra el recién creado y propaga el error', async () => {
    const falla = new repo.SueldoRpcError('falta declarar la asistencia de 2026-10-07', 'DATO');
    const { d, llamadas } = deps({ cerrarFalla: falla });
    await expect(repo.confirmarYCerrar('ac', '2026-09-05', '2026-10-04', d)).rejects.toBe(falla);
    expect(llamadas).toEqual(['crear:-', 'cerrar:nuevo', 'eliminar:nuevo']);
  });
});

describe('corregirYCerrar', () => {
  it('anula para corregir, crea y cierra', async () => {
    const { d, llamadas } = deps();
    expect(await repo.corregirYCerrar('l-1', 'faltaba un día', d)).toBe('nuevo');
    expect(llamadas).toEqual(['corregir', 'cerrar:nuevo']);
  });

  it('si el cierre falla, borra el nuevo y avisa que el pago quedó por cerrar', async () => {
    const { d, llamadas } = deps({ cerrarFalla: new repo.SueldoRpcError('los datos cambiaron', 'DESACTUALIZADA') });
    await expect(repo.corregirYCerrar('l-1', 'faltaba un día', d)).rejects.toMatchObject({
      codigo: 'DESACTUALIZADA',
      message: expect.stringContaining('Por cerrar'),
    });
    expect(llamadas).toEqual(['corregir', 'cerrar:nuevo', 'eliminar:nuevo']);
  });
});
