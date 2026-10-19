// @ts-nocheck — vitest no es dependencia declarada de erp-web y el typecheck incluye `**/*.ts`.
//
// QUÉ PRUEBA (spec empleados/2026-10-18-suspension-cierra-contrato-design.md §2.1): suspender
// banea el acceso ANTES de llamar a la RPC; si la RPC falla se quita el baneo y el error llega
// tal cual; reactivar no llama a la RPC. Dependencias inyectadas: no se simula ningún cliente.
import { describe, expect, it } from 'vitest';
import { reactivarConAcceso, suspenderConAcceso } from '../suspension';

function deps(rpc: { message: string } | null, desbanFalla = false) {
  const eventos: string[] = [];
  return {
    eventos,
    d: {
      bloquearAcceso: async () => (eventos.push('ban'), null),
      devolverAcceso: async () => (eventos.push('desban'), desbanFalla ? { message: 'auth caído' } : null),
      suspenderEnBase: async () => (eventos.push('rpc'), rpc),
    },
  };
}

describe('suspenderConAcceso', () => {
  it('banea y luego llama a la RPC', async () => {
    const { eventos, d } = deps(null);
    await suspenderConAcceso(d);
    expect(eventos).toEqual(['ban', 'rpc']);
  });
  it('si la RPC falla, devuelve el acceso y propaga el mensaje sin prefijo', async () => {
    const { eventos, d } = deps({ message: 'ESTADO:tiene una liquidación hasta 2026-10-31.' });
    await expect(suspenderConAcceso(d)).rejects.toThrow(/^tiene una liquidación hasta 2026-10-31\.$/);
    expect(eventos).toEqual(['ban', 'rpc', 'desban']);
  });
  it('si además falla devolver el acceso, lo dice', async () => {
    const { d } = deps({ message: 'ESTADO:x' }, true);
    await expect(suspenderConAcceso(d)).rejects.toThrow(/no se pudo devolver el acceso/);
  });
  it('si el baneo falla no llama a la RPC', async () => {
    const eventos = [];
    await expect(
      suspenderConAcceso({
        bloquearAcceso: async () => ({ message: 'x' }),
        devolverAcceso: async () => null,
        suspenderEnBase: async () => (eventos.push('rpc'), null),
      }),
    ).rejects.toThrow(/No se cambió nada/);
    expect(eventos).toEqual([]);
  });
});

describe('reactivarConAcceso', () => {
  it('reactiva y devuelve el acceso, sin tocar contratos', async () => {
    const eventos = [];
    await reactivarConAcceso({
      reactivarEnBase: async () => (eventos.push('activar'), null),
      devolverAcceso: async () => (eventos.push('desban'), null),
      deshacerReactivacion: async () => void eventos.push('deshacer'),
    });
    expect(eventos).toEqual(['activar', 'desban']);
  });
  it('si el desbaneo falla, deshace la reactivación', async () => {
    const eventos = [];
    await expect(
      reactivarConAcceso({
        reactivarEnBase: async () => null,
        devolverAcceso: async () => ({ message: 'x' }),
        deshacerReactivacion: async () => void eventos.push('deshacer'),
      }),
    ).rejects.toThrow(/No se cambió nada/);
    expect(eventos).toEqual(['deshacer']);
  });
});
