// @ts-nocheck — vitest no es dependencia declarada de erp-web y el typecheck incluye `**/*.ts`.
//
// QUÉ PRUEBA (spec empleados/2026-10-18-suspension-cierra-contrato-design.md §2.1): suspender
// llama a la RPC `empleado_suspender` con la fecha que le pasa quien invoca (hoy Perú, nunca
// `new Date()` en la base) DESPUÉS de banear el acceso; si la RPC falla (p. ej. una liquidación
// posterior a la baja), se quita el baneo y el error llega a la pantalla tal cual. Reactivar no
// llama a la RPC: no reabre el contrato.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let eventos: string[] = [];
let rpcRespuesta: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let updates: Record<string, unknown>[] = [];

vi.mock('../auth', () => ({
  EMAIL_DOMAIN: 'lucebien.local',
  limpiarIntentos: vi.fn(),
  reglasAccesoVigentes: vi.fn(),
  revocarSesiones: vi.fn(),
}));
vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      eventos.push(`rpc:${nombre}:${JSON.stringify(args)}`);
      return rpcRespuesta;
    },
    from: () => ({
      update: (fila: Record<string, unknown>) => {
        updates.push(fila);
        eventos.push(`update:${JSON.stringify(fila)}`);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));
vi.mock('../supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({ in: () => ({ eq: async () => ({ data: [{ id: 'otro-admin' }], error: null }) }) }),
    }),
    auth: {
      admin: {
        updateUserById: async (_id: string, attrs: { ban_duration: string }) => {
          eventos.push(`ban:${attrs.ban_duration}`);
          return { error: null };
        },
      },
    },
  }),
}));

import { actualizarEstadoEmpleado } from '../empleados-repo';

describe('actualizarEstadoEmpleado — suspender cierra el contrato', () => {
  beforeEach(() => {
    eventos = [];
    updates = [];
    rpcRespuesta = { data: { contrato_cerrado: true }, error: null };
  });

  it('banea el acceso y luego llama a la RPC con la fecha recibida', async () => {
    await actualizarEstadoEmpleado('e1', false, '2026-10-18');
    expect(eventos).toEqual([
      'ban:876000h',
      'rpc:empleado_suspender:{"p_id":"e1","p_hoy":"2026-10-18"}',
    ]);
    // La suspensión ya no es un update plano sobre empleados: lo hace la RPC, en la misma
    // transacción que el cierre del contrato.
    expect(updates).toHaveLength(0);
  });

  it('si la RPC falla, quita el baneo y propaga el mensaje', async () => {
    rpcRespuesta = { data: null, error: { message: 'ESTADO:tiene una liquidación hasta 2026-10-31. Anúlala primero.' } };
    await expect(actualizarEstadoEmpleado('e1', false, '2026-10-18')).rejects.toThrow(/liquidación hasta 2026-10-31/);
    expect(eventos.at(-1)).toBe('ban:none');
  });

  it('reactivar no llama a la RPC (no reabre el contrato)', async () => {
    await actualizarEstadoEmpleado('e1', true, '2026-10-18');
    expect(eventos.some((e) => e.startsWith('rpc:'))).toBe(false);
    expect(updates[0]).toMatchObject({ activo: true, estado: 'activo' });
  });
});
