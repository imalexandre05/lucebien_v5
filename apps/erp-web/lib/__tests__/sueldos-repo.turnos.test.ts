// @ts-nocheck — vitest no es dependencia declarada de erp-web y el typecheck incluye `**/*.ts`.
//
// QUÉ PRUEBA (spec empleados/2026-10-18-suspension-cierra-contrato-design.md §2.3): `guardarTurnos`
// reemplaza el horario con UNA sola llamada a la RPC `sueldo_acuerdo_guardar_turnos` (atómica), no
// con un delete y un insert separados: si el insert falla, el contrato no puede quedar sin horario.
import { describe, expect, it, vi } from 'vitest';

const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
let tablas = 0;
let rpcError: { message: string } | null = null;

vi.mock('../directorio', () => ({ mapaNombres: vi.fn(async () => new Map()) }));
vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      rpcs.push({ nombre, args });
      return { data: null, error: rpcError };
    },
    from: () => {
      tablas += 1;
      return {};
    },
  }),
}));

import { guardarTurnos } from '../sueldos-repo';

describe('guardarTurnos — horario atómico', () => {
  it('llama a la RPC con los turnos en snake_case y no toca la tabla directamente', async () => {
    await guardarTurnos('ac-1', [
      { diaSemana: 1, horaInicio: '09:00', horaFin: '13:00', lugar: 'AL' },
      { diaSemana: 1, horaInicio: '13:00', horaFin: '20:00', lugar: '' },
    ]);
    expect(tablas).toBe(0);
    expect(rpcs).toEqual([
      {
        nombre: 'sueldo_acuerdo_guardar_turnos',
        args: {
          p_acuerdo: 'ac-1',
          p_turnos: [
            { dia_semana: 1, hora_inicio: '09:00', hora_fin: '13:00', lugar: 'AL' },
            { dia_semana: 1, hora_inicio: '13:00', hora_fin: '20:00', lugar: null },
          ],
        },
      },
    ]);
  });

  it('un horario vacío también va por la RPC (vaciar es reemplazar por nada)', async () => {
    rpcs.length = 0;
    await guardarTurnos('ac-1', []);
    expect(rpcs[0].args.p_turnos).toEqual([]);
  });

  it('traduce el error de la RPC con el mensaje de negocio', async () => {
    rpcError = { message: 'DATO:los turnos del día 2 se solapan' };
    await expect(guardarTurnos('ac-1', [])).rejects.toThrow(/se solapan/);
  });
});
