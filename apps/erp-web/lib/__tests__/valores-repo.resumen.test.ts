// @ts-nocheck
// Ver el encabezado de sueldos-repo.corregir.test.ts: por qué `@ts-nocheck` en los tests de erp-web.
//
// Lo propio de Valores 360° llega SOLO por `valores_mis_puntajes` (0116): un mes ya cerrado, con el
// mínimo de evaluaciones, nunca en vivo. Esto comprueba que el repo no muestra nada que la función no
// haya devuelto — y que el formato viejo de la función (una fila por evaluador, sin `cantidad`) se
// trata como «sin resultado» en vez de calcularse.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let respuesta;
vi.mock('../supabase/server', () => ({ getServerClient: () => ({ rpc: async () => respuesta }) }));
vi.mock('../auth', () => ({ getSesion: async () => ({ usuario: { id: 'u1' } }) }));
vi.mock('../config-repo', () => ({ leerConfigMap: async () => ({ valores_min_evaluaciones: '3' }) }));

import { miResumenValores } from '../valores-repo';

const OCULTO = { mes: null, recibidas: null, promedios: null, nota20: null, minimoEvaluaciones: 3, suficientes: false };

describe('miResumenValores (lo propio)', () => {
  beforeEach(() => { respuesta = { data: [], error: null }; });

  it('sin fila no muestra nada, ni la cantidad', async () => {
    expect(await miResumenValores('u1', '2026-10')).toEqual(OCULTO);
  });

  it('formato viejo (sin cantidad): no calcula con el voto de un evaluador', async () => {
    respuesta = { data: [{ integridad: 5, respeto: 5, honestidad: 5, amabilidad: 5, relacion: 5, actitud: 5 }], error: null };
    expect(await miResumenValores('u1', '2026-10')).toEqual(OCULTO);
  });

  it('función ausente o anterior a 0116: tampoco muestra nada', async () => {
    respuesta = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    expect(await miResumenValores('u1', '2026-10')).toEqual(OCULTO);
  });

  it('otro error de la base se propaga', async () => {
    respuesta = { data: null, error: { code: 'XX000', message: 'boom' } };
    await expect(miResumenValores('u1', '2026-10')).rejects.toThrow('boom');
  });

  it('con fila: mes cerrado, cantidad, promedios y nota /20', async () => {
    respuesta = { data: [{ mes: '2026-09', cantidad: 3, integridad: '4.00', respeto: 4.67, honestidad: 4, amabilidad: 4, relacion: 4, actitud: 4 }], error: null };
    const r = await miResumenValores('u1', '2026-10');
    expect(r.mes).toBe('2026-09');
    expect(r.recibidas).toBe(3);
    expect(r.suficientes).toBe(true);
    expect(r.promedios.integridad).toBe(4);
    expect(r.nota20).toBeGreaterThan(0);
  });
});
