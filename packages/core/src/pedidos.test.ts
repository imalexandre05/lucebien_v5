import { describe, it, expect } from 'vitest';
import { generaPasada, pedidoSchema } from './pedidos';

describe('generaPasada (comercial ↔ pipeline)', () => {
  it('solo un servicio genera pasada en el pipeline interno', () => {
    expect(generaPasada('servicio')).toBe(true);
    expect(generaPasada('alquiler')).toBe(false);
    expect(generaPasada('venta')).toBe(false);
  });
});

describe('pedidoSchema (validación Zod)', () => {
  const base = { clienteId: 'c1', tipo: 'venta' as const, sedeCod: 'LB', fecha: '2026-07-01' };

  it('acepta un pedido válido y aplica defaults', () => {
    const r = pedidoSchema.parse(base);
    expect(r.total).toBe(0);
    expect(r.descripcion).toBe('');
    expect(r.activoId).toBe('');
  });
  it('coacciona total de string a número', () => {
    const r = pedidoSchema.parse({ ...base, total: '150.5' });
    expect(r.total).toBe(150.5);
  });
  it('rechaza sin cliente o con tipo inválido', () => {
    expect(() => pedidoSchema.parse({ ...base, clienteId: '' })).toThrow();
    expect(() => pedidoSchema.parse({ ...base, tipo: 'x' })).toThrow();
  });
  it('rechaza total negativo', () => {
    expect(() => pedidoSchema.parse({ ...base, total: -5 })).toThrow();
  });
});
