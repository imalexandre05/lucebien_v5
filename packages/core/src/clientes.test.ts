import { describe, it, expect } from 'vitest';
import { clienteSchema } from './clientes';

describe('clienteSchema', () => {
  it('acepta un cliente válido', () => {
    const r = clienteSchema.safeParse({
      nombre: 'Ana Torres',
      dni: '12345678',
      telefono: '987654321',
      sedeCod: 'LB',
      medidas: { talla: '40' },
    });
    expect(r.success).toBe(true);
  });
  it('rechaza DNI inválido', () => {
    expect(clienteSchema.safeParse({ nombre: 'Ana', dni: '123', sedeCod: 'LB' }).success).toBe(false);
  });
  it('permite DNI vacío', () => {
    expect(clienteSchema.safeParse({ nombre: 'Ana', dni: '', sedeCod: 'LB' }).success).toBe(true);
  });
  it('exige nombre y sede', () => {
    expect(clienteSchema.safeParse({ nombre: '', sedeCod: 'LB' }).success).toBe(false);
    expect(clienteSchema.safeParse({ nombre: 'Ana', sedeCod: '' }).success).toBe(false);
  });
});
