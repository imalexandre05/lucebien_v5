// @ts-nocheck
// Mismo motivo de `@ts-nocheck` que sueldos-repo.corregir.test.ts: vitest no es dependencia de erp-web.
//
// QUÉ PRUEBA. Desde la 0122 `authenticated` no puede escribir `prenda_pasada`: el alta manual debe
// ir por la RPC `pipeline_registrar_prenda` con el activo ya resuelto, y nunca por un insert plano.
import { describe, expect, it, vi } from 'vitest';

const llamadas = { rpc: [], tablasConInsert: [] };
const activo = { id: 'activo-1' };

vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (nombre, args) => {
      llamadas.rpc.push({ nombre, args });
      return { data: 'pasada-1', error: null };
    },
    from: (tabla) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: activo, error: null }) }) }),
      insert: () => {
        llamadas.tablasConInsert.push(tabla);
        return { select: () => ({ single: async () => ({ data: activo, error: null }) }) };
      },
    }),
  }),
}));

import { registrarPasada } from '../pipeline-repo';

describe('registrarPasada', () => {
  it('llama a la RPC con los parámetros y el activo resuelto, sin insert en prenda_pasada', async () => {
    await registrarPasada({
      codigo: 'T-001',
      tipo: 'Terno',
      color: 'Negro',
      talla: '40',
      sedeOrigenCod: 'S1',
      tipoLavado: 'seco',
      necesitaCompostura: true,
      obsGeneral: 'botón suelto',
    });
    expect(llamadas.rpc).toEqual([
      {
        nombre: 'pipeline_registrar_prenda',
        args: {
          p_codigo: 'T-001',
          p_tipo: 'Terno',
          p_color: 'Negro',
          p_talla: '40',
          p_sede: 'S1',
          p_tipo_lavado: 'seco',
          p_necesita_compostura: true,
          p_obs: 'botón suelto',
          p_activo_id: 'activo-1',
        },
      },
    ]);
    expect(llamadas.tablasConInsert).not.toContain('prenda_pasada');
  });
});
