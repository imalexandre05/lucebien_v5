import { describe, it, expect } from 'vitest';
import { sugerirMontoPago } from './pagos';

describe('sugerirMontoPago', () => {
  it('sin evaluación (notaFinal null): sugiere el salario base tal cual', () => {
    expect(sugerirMontoPago(1500, null)).toBe(1500);
  });
  it('nota perfecta (20/20): monto = salario base', () => {
    expect(sugerirMontoPago(1500, 20)).toBe(1500);
  });
  it('nota a la mitad (10/20): monto = mitad del salario', () => {
    expect(sugerirMontoPago(1000, 10)).toBe(500);
  });
  it('suma el bonus y resta los descuentos', () => {
    expect(sugerirMontoPago(1000, 20, 50, 30)).toBe(1020);
  });
  it('nunca sugiere un monto negativo (clamp ≥ 0)', () => {
    expect(sugerirMontoPago(500, 5, 0, 1000)).toBe(0);
  });
  it('nota 0 sin bonus: monto 0', () => {
    expect(sugerirMontoPago(1000, 0)).toBe(0);
  });
  it('redondea a 2 decimales', () => {
    expect(sugerirMontoPago(999.99, 20, 0.001, 0)).toBe(999.99);
  });
  it('salario base negativo se trata como 0', () => {
    expect(sugerirMontoPago(-100, null)).toBe(0);
  });
});
