import { describe, it, expect } from 'vitest';
import { formatCodigo, parseCodigo, precioPorUso, type ReglaPrecioUso } from './inventario';

describe('codificación TN-042', () => {
  it('formatea con padding y normaliza a mayúsculas', () => {
    expect(formatCodigo('tn', 42)).toBe('TN-042');
    expect(formatCodigo('CM', 8)).toBe('CM-008');
  });
  it('parsea válidos y rechaza basura', () => {
    expect(parseCodigo('TN-042')).toEqual({ tipo: 'TN', n: 42 });
    expect(parseCodigo('tn-042')).toEqual({ tipo: 'TN', n: 42 });
    expect(parseCodigo('basura')).toBeNull();
  });
});

describe('precioPorUso (configurable, E3)', () => {
  // Valores de PRUEBA (no son la regla real de LuceBien; testean el mecanismo).
  const regla: ReglaPrecioUso = {
    escalones: [
      { desdeUsos: 5, descuentoPct: 0.1 },
      { desdeUsos: 10, descuentoPct: 0.5 },
    ],
    pisoPct: 0.6,
  };
  it('sin usos no descuenta', () => expect(precioPorUso(100, 0, regla)).toBe(100));
  it('aplica el escalón mayor alcanzado', () => expect(precioPorUso(100, 6, regla)).toBe(90));
  it('respeta el piso', () => expect(precioPorUso(100, 12, regla)).toBe(60));
});
