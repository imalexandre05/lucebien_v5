import { describe, it, expect } from 'vitest';
import { segmentar, metricasCRM, diasDesde, UMBRAL_CRM } from './crm';

describe('segmentar (fidelización)', () => {
  it('nuevo con pocos pedidos y poco gasto', () => {
    expect(segmentar(0, 0)).toBe('nuevo');
    expect(segmentar(1, 500)).toBe('nuevo');
  });
  it('recurrente a partir de 2 pedidos', () => {
    expect(segmentar(2, 100)).toBe('recurrente');
    expect(segmentar(4, 100)).toBe('recurrente');
  });
  it('vip por monto o por cantidad de pedidos', () => {
    expect(segmentar(1, 2000)).toBe('vip');
    expect(segmentar(5, 100)).toBe('vip');
  });
  it('respeta umbrales personalizados', () => {
    const u = { vipMonto: 500, vipPedidos: 3, recurrentePedidos: 2, inactivoDias: 30 };
    expect(segmentar(1, 500, u)).toBe('vip');
    expect(segmentar(3, 0, u)).toBe('vip');
    expect(segmentar(2, 0, u)).toBe('recurrente');
  });
});

describe('diasDesde', () => {
  const hoy = new Date('2026-07-02T12:00:00');
  it('null si no hay fecha', () => expect(diasDesde(null, hoy)).toBeNull());
  it('cuenta días transcurridos', () => expect(diasDesde('2026-06-30', hoy)).toBe(2));
  it('mismo día = 0', () => expect(diasDesde('2026-07-02', hoy)).toBe(0));
});

describe('metricasCRM', () => {
  const hoy = new Date('2026-07-02T12:00:00');
  it('cliente sin pedidos', () => {
    const m = metricasCRM([], UMBRAL_CRM, hoy);
    expect(m).toMatchObject({ pedidos: 0, totalGastado: 0, ultimoPedido: null, segmento: 'nuevo', seguir: false });
  });
  it('agrega total, detecta el último y segmenta', () => {
    const m = metricasCRM([{ total: 1200, fecha: '2026-06-01' }, { total: 1000, fecha: '2026-06-20' }], UMBRAL_CRM, hoy);
    expect(m.pedidos).toBe(2);
    expect(m.totalGastado).toBe(2200);
    expect(m.ultimoPedido).toBe('2026-06-20');
    expect(m.segmento).toBe('vip');
  });
  it('marca seguir cuando el último pedido supera inactivoDias', () => {
    const m = metricasCRM([{ total: 100, fecha: '2026-01-01' }], UMBRAL_CRM, hoy);
    expect(m.seguir).toBe(true);
  });
  it('no marca seguir si compró reciente', () => {
    const m = metricasCRM([{ total: 100, fecha: '2026-06-30' }], UMBRAL_CRM, hoy);
    expect(m.seguir).toBe(false);
  });
});
