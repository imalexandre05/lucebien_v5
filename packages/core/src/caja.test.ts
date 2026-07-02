import { describe, it, expect } from 'vitest';
import { resumenCaja, nivelDevolucion, type MovimientoCaja } from './caja';

describe('resumenCaja (arqueo)', () => {
  it('caja vacía: efectivo esperado = apertura', () => {
    const r = resumenCaja(100, []);
    expect(r).toMatchObject({ ingresos: 0, egresos: 0, neto: 0, efectivoEsperado: 100 });
  });
  it('suma ingresos/egresos y calcula efectivo esperado', () => {
    const movs: MovimientoCaja[] = [
      { tipo: 'ingreso', monto: 200, metodo: 'efectivo' },
      { tipo: 'ingreso', monto: 50, metodo: 'yape' },
      { tipo: 'egreso', monto: 30, metodo: 'efectivo' },
    ];
    const r = resumenCaja(100, movs);
    expect(r.ingresos).toBe(250);
    expect(r.egresos).toBe(30);
    expect(r.neto).toBe(220);
    expect(r.efectivo).toBe(200);
    expect(r.yape).toBe(50);
    expect(r.efectivoEsperado).toBe(270); // 100 + 200 − 30
  });
  it('redondea a 2 decimales', () => {
    const r = resumenCaja(0, [
      { tipo: 'ingreso', monto: 10.1, metodo: 'efectivo' },
      { tipo: 'ingreso', monto: 0.2, metodo: 'efectivo' },
    ]);
    expect(r.ingresos).toBe(10.3);
  });
});

describe('nivelDevolucion', () => {
  it('vencido / hoy / próximo / futuro', () => {
    expect(nivelDevolucion(-1)).toBe('vencido');
    expect(nivelDevolucion(0)).toBe('hoy');
    expect(nivelDevolucion(2)).toBe('proximo');
    expect(nivelDevolucion(3)).toBe('proximo');
    expect(nivelDevolucion(4)).toBe('futuro');
  });
  it('umbral de próximo configurable', () => {
    expect(nivelDevolucion(5, 7)).toBe('proximo');
    expect(nivelDevolucion(8, 7)).toBe('futuro');
  });
});
