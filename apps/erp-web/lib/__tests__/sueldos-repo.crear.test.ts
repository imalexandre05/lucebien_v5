// @ts-nocheck — mismo motivo que sueldos-repo.corregir.test.ts: vitest no es dependencia de erp-web.
//
// QUÉ PRUEBA (spec 2026-10-05-contrato-valores-pactados-design.md §2.1): `crearAcuerdo()` guarda
// TODOS los valores vigentes en el contrato nuevo — los de /configuracion donde estén fijados, el
// default del código en el resto — aunque el formulario mande `parametros: {}`; y lo que el
// formulario sí trae gana.
import { describe, expect, it, vi } from 'vitest';

const insertado: { fila?: Record<string, unknown> } = {};
let vigentesDeConfig: Record<string, unknown> = {};

vi.mock('../directorio', () => ({ mapaNombres: vi.fn(async () => new Map()) }));
vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (nombre: string) =>
      nombre === 'sueldo_parametros_vigentes'
        ? { data: vigentesDeConfig, error: null }
        : { data: null, error: { message: `rpc inesperada ${nombre}` } },
    from: () => ({
      // Con #57, actualizarAcuerdo lee antes el contrato (obtenerAcuerdo) para ver si tiene cambios de
      // frecuencia. Acá no existe todavía: devuelve null y se sigue como un contrato sin cambios.
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: (fila: Record<string, unknown>) => {
        insertado.fila = fila;
        return { eq: async () => ({ error: null }), };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: (fila: Record<string, unknown>) => {
        insertado.fila = fila;
        return { select: () => ({ single: async () => ({ data: { id: 'nuevo-1' }, error: null }) }) };
      },
    }),
  }),
}));

import { actualizarAcuerdo, crearAcuerdo, type AcuerdoInput } from '../sueldos-repo';

const base: AcuerdoInput = {
  empleadoId: 'e1',
  fechaInicio: '2026-10-01',
  fechaFin: '2026-12-31',
  modalidad: 'mensual',
  sueldoPactado: 1500,
  escala: null,
  almuerzoHabilitado: false,
  parametros: {},
  turnos: [],
};

describe('crearAcuerdo — el contrato nuevo nace con todos sus valores pactados', () => {
  it('copia config + defaults aunque el formulario mande {}', async () => {
    vigentesDeConfig = { toleranciaMinutos: 12, pctComision: 0.05 };
    await crearAcuerdo(base, 'adm');
    const p = insertado.fila!.parametros as Record<string, unknown>;
    expect(Object.keys(p)).toHaveLength(17);
    expect(p.toleranciaMinutos).toBe(12);
    expect(p.pctComision).toBe(0.05);
    expect(p.tardanzasLibres).toBe(3); // default del código
    expect('metaSemanal' in p).toBe(false);
  });

  it('lo que trae el formulario gana a la configuración', async () => {
    vigentesDeConfig = { toleranciaMinutos: 12 };
    await crearAcuerdo({ ...base, parametros: { toleranciaMinutos: 20, metaSemanal: 1800 } }, 'adm');
    const p = insertado.fila!.parametros as Record<string, unknown>;
    expect(p.toleranciaMinutos).toBe(20);
    expect(p.metaSemanal).toBe(1800);
  });
});

describe('actualizarAcuerdo — vaciar un campo no lo devuelve a seguir a Configuración', () => {
  it('completa la clave que falta con el valor vigente', async () => {
    vigentesDeConfig = { valorAlmuerzo: 10 };
    await actualizarAcuerdo('a1', { ...base, parametros: { toleranciaMinutos: 15 } });
    const p = insertado.fila!.parametros as Record<string, unknown>;
    expect(p.toleranciaMinutos).toBe(15);
    expect(p.valorAlmuerzo).toBe(10);
    expect(Object.keys(p)).toHaveLength(17);
  });
});

// #39 encima de #55 (auditoría 2026-10-06, D-5/H2): el contrato guarda SU copia de la comisión, y
// una vez guardada ya no sigue a Configuración. Si el formulario mandara lo escrito («1,5») en vez
// de la fracción, quedaría pactado un 150 % para siempre.
describe('comisión en % sobre los valores pactados (#39 × #55)', () => {
  it('«1,5» en el formulario → el contrato guarda la fracción 0.015 y se vuelve a mostrar «1.5»', async () => {
    const { porcentajeAFraccion, fraccionAPorcentaje } = await import('../porcentaje');
    const lectura = porcentajeAFraccion('1,5');
    expect(lectura).toEqual({ ok: true, valor: 0.015 });
    vigentesDeConfig = { pctComision: 0.05 };
    await crearAcuerdo({ ...base, parametros: { pctComision: (lectura as { valor: number }).valor } }, 'adm');
    const p = insertado.fila!.parametros as Record<string, unknown>;
    expect(p.pctComision).toBe(0.015);
    expect(fraccionAPorcentaje(p.pctComision as number)).toBe('1.5');
  });

  it('sin tocar la comisión, el contrato nuevo copia la fracción de Configuración, no un porcentaje', async () => {
    vigentesDeConfig = { pctComision: 0.02 };
    await crearAcuerdo(base, 'adm');
    expect((insertado.fila!.parametros as Record<string, unknown>).pctComision).toBe(0.02);
  });
});
