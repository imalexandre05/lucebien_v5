// @ts-nocheck — mismo motivo que sueldos-repo.corregir.test.ts: vitest no es dependencia de erp-web.
//
// QUÉ PRUEBA (spec 2026-10-05-contrato-valores-pactados-design.md §2.1): `crearAcuerdo()` guarda
// TODOS los valores vigentes en el contrato nuevo — los de /configuracion donde estén fijados, el
// default del código en el resto — aunque el formulario mande `parametros: {}`; y lo que el
// formulario sí trae gana.
import { describe, expect, it, vi } from 'vitest';

const insertado: { fila?: Record<string, unknown> } = {};
// Migración 0157: contrato + horario van en UNA sola RPC; el repo no escribe tablas directamente.
const guardadas: { p_acuerdo: string | null; p_fila: Record<string, unknown>; p_turnos: unknown[] }[] = [];
let tablasEscritas = 0;
let errorGuardar: { message: string } | null = null;
let vigentesDeConfig: Record<string, unknown> = {};

vi.mock('../directorio', () => ({ mapaNombres: vi.fn(async () => new Map()) }));
vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (nombre: string, args: any) => {
      if (nombre === 'sueldo_parametros_vigentes') return { data: vigentesDeConfig, error: null };
      if (nombre === 'sueldo_acuerdo_guardar') {
        guardadas.push(args);
        insertado.fila = args.p_fila;
        return errorGuardar ? { data: null, error: errorGuardar } : { data: args.p_acuerdo ?? 'nuevo-1', error: null };
      }
      return { data: null, error: { message: `rpc inesperada ${nombre}` } };
    },
    from: () => ({
      // Con #57, actualizarAcuerdo lee antes el contrato (obtenerAcuerdo) para ver si tiene cambios de
      // frecuencia. Acá no existe todavía: devuelve null y se sigue como un contrato sin cambios.
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: () => {
        tablasEscritas += 1;
        return { eq: async () => ({ error: null }) };
      },
      delete: () => {
        tablasEscritas += 1;
        return { eq: async () => ({ error: null }) };
      },
      insert: () => {
        tablasEscritas += 1;
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

describe('crearAcuerdo — pago por puntos pactado por contrato', () => {
  it('un null explícito apaga este contrato aunque Configuración esté encendida; la otra clave se copia', async () => {
    vigentesDeConfig = { puntosMetaMensual: 5000, solesPorPunto: 0.05 };
    await crearAcuerdo({ ...base, parametros: { puntosMetaMensual: null } }, 'adm');
    const p = insertado.fila!.parametros as Record<string, unknown>;
    expect(p.puntosMetaMensual).toBeNull();
    expect(p.solesPorPunto).toBe(0.05);
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

// Spec empleados/2026-10-18-acuerdo-con-turnos-atomico §3: una sola RPC por operación.
describe('contrato + horario en una sola RPC atómica (0157)', () => {
  const turnos = [{ diaSemana: 1, horaInicio: '09:00', horaFin: '13:00', lugar: 'AL' }];

  it('crear: una RPC con p_acuerdo nulo, creado_por y los turnos; no escribe tablas', async () => {
    guardadas.length = 0;
    tablasEscritas = 0;
    vigentesDeConfig = {};
    const id = await crearAcuerdo({ ...base, turnos }, 'adm');
    expect(id).toBe('nuevo-1');
    expect(tablasEscritas).toBe(0);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].p_acuerdo).toBeNull();
    expect(guardadas[0].p_fila.creado_por).toBe('adm');
    expect(guardadas[0].p_fila.empleado_id).toBe('e1');
    expect(guardadas[0].p_turnos).toEqual([{ dia_semana: 1, hora_inicio: '09:00', hora_fin: '13:00', lugar: 'AL' }]);
  });

  it('actualizar: una RPC con el id, sin creado_por; no escribe tablas', async () => {
    guardadas.length = 0;
    tablasEscritas = 0;
    await actualizarAcuerdo('a1', { ...base, turnos });
    expect(tablasEscritas).toBe(0);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].p_acuerdo).toBe('a1');
    expect('creado_por' in guardadas[0].p_fila).toBe(false);
    expect(guardadas[0].p_turnos).toHaveLength(1);
  });

  it('si la RPC falla (turnos solapados) el error llega con su mensaje y no hubo otra escritura', async () => {
    guardadas.length = 0;
    tablasEscritas = 0;
    errorGuardar = { message: 'DATO:hay turnos del mismo día que se solapan' };
    await expect(crearAcuerdo({ ...base, turnos }, 'adm')).rejects.toThrow(/se solapan/);
    await expect(actualizarAcuerdo('a1', { ...base, turnos })).rejects.toThrow(/se solapan/);
    expect(tablasEscritas).toBe(0);
    errorGuardar = null;
  });
});
