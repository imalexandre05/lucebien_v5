import { describe, it, expect } from 'vitest';
import { generaPasada, requiereProcesoAlDevolver, pedidoSchema } from './pedidos';

describe('generaPasada (comercial ↔ pipeline)', () => {
  it('solo un servicio genera pasada en el pipeline interno', () => {
    expect(generaPasada('servicio')).toBe(true);
    expect(generaPasada('alquiler')).toBe(false);
    expect(generaPasada('venta')).toBe(false);
    expect(generaPasada('confeccion')).toBe(false);
  });
});

describe('requiereProcesoAlDevolver (alquiler devuelto → pipeline)', () => {
  it('solo un alquiler devuelto reingresa al pipeline', () => {
    expect(requiereProcesoAlDevolver('alquiler')).toBe(true);
    expect(requiereProcesoAlDevolver('venta')).toBe(false);
    expect(requiereProcesoAlDevolver('servicio')).toBe(false);
    expect(requiereProcesoAlDevolver('confeccion')).toBe(false);
  });
});

describe('pedidoSchema (validación Zod)', () => {
  const base = { clienteId: 'c1', tipo: 'venta' as const, sedeCod: 'LB', fecha: '2026-07-01' };

  it('acepta un pedido válido y aplica defaults', () => {
    const r = pedidoSchema.parse(base);
    expect(r.total).toBe(0);
    expect(r.descripcion).toBe('');
    expect(r.activoId).toBe('');
    expect(r.notas).toBe('');
    expect(r.garantiaMonto).toBe(0);
    expect(r.tela).toBe('');
  });
  it('coacciona total y garantiaMonto de string a número', () => {
    const r = pedidoSchema.parse({ ...base, total: '150.5', garantiaMonto: '80' });
    expect(r.total).toBe(150.5);
    expect(r.garantiaMonto).toBe(80);
  });
  it('acepta el tipo confeccion con sus campos propios', () => {
    const r = pedidoSchema.parse({
      ...base,
      tipo: 'confeccion',
      tela: 'Lana inglesa',
      fechaPrueba: '2026-07-10',
      fechaSegundaPrueba: '2026-07-20',
      fechaEntrega: '2026-07-25',
    });
    expect(r.tipo).toBe('confeccion');
    expect(r.tela).toBe('Lana inglesa');
  });
  it('rechaza sin cliente o con tipo inválido', () => {
    expect(() => pedidoSchema.parse({ ...base, clienteId: '' })).toThrow();
    expect(() => pedidoSchema.parse({ ...base, tipo: 'x' })).toThrow();
  });
  it('rechaza total negativo', () => {
    expect(() => pedidoSchema.parse({ ...base, total: -5 })).toThrow();
  });
});
