// @ts-nocheck
// Ver el encabezado de sueldos-repo.corregir.test.ts: por qué `@ts-nocheck` en los tests de erp-web.
//
// El mínimo de evaluaciones de Valores 360° vive en dos lugares: la función SQL `valores_mis_puntajes`
// (la que decide, migración 0116) y esta lectura de config, que sólo arma el texto de la pantalla.
// Tienen que coincidir en el borde: un valor ausente, vacío, 0, negativo o no numérico cae a 3,
// nunca a 0 (apagaría el anonimato en silencio).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase/server', () => ({ getServerClient: () => ({}) }));
vi.mock('../auth', () => ({ getSesion: async () => null }));
vi.mock('../config-repo', () => ({ leerConfigMap: async () => ({}) }));

import { minimoEvaluacionesValores } from '../valores-repo';

describe('minimoEvaluacionesValores', () => {
  it('usa 3 si la clave falta', () => expect(minimoEvaluacionesValores({})).toBe(3));
  it.each(['', '  ', '0', '-2', 'abc', '2.5', '1e3'])('cae a 3 con %j', (v) =>
    expect(minimoEvaluacionesValores({ valores_min_evaluaciones: v })).toBe(3));
  it.each([['1', 1], [' 4 ', 4], ['5', 5], ['17', 17]])('lee %j como %i', (v, n) =>
    expect(minimoEvaluacionesValores({ valores_min_evaluaciones: v })).toBe(n));
});
