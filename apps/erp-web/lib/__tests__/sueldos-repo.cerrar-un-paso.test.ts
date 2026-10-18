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

const HOY = '2026-10-18';

function deps(o: { borradores?: unknown[]; cerrarFalla?: Error; calcularFalla?: Error } = {}) {
  const llamadas: string[] = [];
  return {
    llamadas,
    d: {
      hoy: () => HOY,
      calcular: vi.fn(async () => {
        llamadas.push('calcular');
        if (o.calcularFalla) throw o.calcularFalla;
      }),
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

const RANGO = { desde: '2026-09-05', hasta: '2026-10-04' };

describe('confirmarYCerrar (spec §5 y §9)', () => {
  it('calcula primero, reemplaza el borrador del mismo rango, crea y cierra', async () => {
    const { d, llamadas } = deps({ borradores: [{ id: 'viejo', ...RANGO, entrada: { sueldoPactado: 600 } }] });
    const id = await repo.confirmarYCerrar('ac', RANGO.desde, RANGO.hasta, d);
    expect(id).toBe('nuevo');
    expect(llamadas).toEqual(['calcular', 'eliminar:viejo', 'crear:-', 'cerrar:nuevo']);
  });

  it('reusa la cuota fijada sólo de un borrador de corrección con el mismo rango', async () => {
    const { d, llamadas } = deps({ borradores: [{ id: 'corr', ...RANGO, entrada: { sueldoPactado: 650, cuotaFijada: true } }] });
    await repo.confirmarYCerrar('ac', RANGO.desde, RANGO.hasta, d);
    expect(llamadas).toEqual(['calcular', 'eliminar:corr', 'crear:650', 'cerrar:nuevo']);
  });

  it('un borrador de otro rango que se pisa no se toca: responde ESTADO', async () => {
    const { d, llamadas } = deps({
      borradores: [{ id: 'medio', desde: '2026-09-05', hasta: '2026-09-20', entrada: { sueldoPactado: 300, cuotaFijada: true } }],
    });
    await expect(repo.confirmarYCerrar('ac', RANGO.desde, RANGO.hasta, d)).rejects.toMatchObject({ codigo: 'ESTADO' });
    expect(llamadas).toEqual([]);
  });

  it('si el cálculo falla no se borra nada', async () => {
    const falla = new repo.SueldoRpcError('falta declarar la asistencia de 2026-10-03', 'DATO');
    const { d, llamadas } = deps({ borradores: [{ id: 'corr', ...RANGO, entrada: { sueldoPactado: 650, cuotaFijada: true } }], calcularFalla: falla });
    await expect(repo.confirmarYCerrar('ac', RANGO.desde, RANGO.hasta, d)).rejects.toBe(falla);
    expect(llamadas).toEqual(['calcular']);
  });

  it('si el cierre falla, borra el recién creado y propaga el error', async () => {
    const falla = new repo.SueldoRpcError('los datos cambiaron', 'DESACTUALIZADA');
    const { d, llamadas } = deps({ cerrarFalla: falla });
    await expect(repo.confirmarYCerrar('ac', RANGO.desde, RANGO.hasta, d)).rejects.toBe(falla);
    expect(llamadas).toEqual(['calcular', 'crear:-', 'cerrar:nuevo', 'eliminar:nuevo']);
  });

  it('si el cierre de una corrección falla, el borrador queda con su cuota', async () => {
    const { d, llamadas } = deps({
      borradores: [{ id: 'corr', ...RANGO, entrada: { sueldoPactado: 650, cuotaFijada: true } }],
      cerrarFalla: new repo.SueldoRpcError('los datos cambiaron', 'DESACTUALIZADA'),
    });
    await expect(repo.confirmarYCerrar('ac', RANGO.desde, RANGO.hasta, d)).rejects.toBeTruthy();
    expect(llamadas).toEqual(['calcular', 'eliminar:corr', 'crear:650', 'cerrar:nuevo']);
  });

  it('no se cierra un rango que termina hoy o después', async () => {
    const { d, llamadas } = deps();
    await expect(repo.confirmarYCerrar('ac', '2026-10-05', HOY, d)).rejects.toMatchObject({ codigo: 'ESTADO' });
    expect(llamadas).toEqual([]);
  });
});

describe('corregirYCerrar', () => {
  it('anula para corregir, crea y cierra', async () => {
    const { d, llamadas } = deps();
    expect(await repo.corregirYCerrar('l-1', 'faltaba un día', d)).toBe('nuevo');
    expect(llamadas).toEqual(['corregir', 'cerrar:nuevo']);
  });

  it('si el cierre falla, el reemplazo queda por cerrar (no se borra) y lo avisa', async () => {
    const { d, llamadas } = deps({ cerrarFalla: new repo.SueldoRpcError('los datos cambiaron', 'DESACTUALIZADA') });
    await expect(repo.corregirYCerrar('l-1', 'faltaba un día', d)).rejects.toMatchObject({
      codigo: 'DESACTUALIZADA',
      message: expect.stringContaining('Por cerrar'),
    });
    expect(llamadas).toEqual(['corregir', 'cerrar:nuevo']);
  });
});
