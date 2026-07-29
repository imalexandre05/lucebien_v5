import { describe, it, expect } from 'vitest';
import { notaCompetencias } from './competencias';

describe('notaCompetencias', () => {
  it('las 8 en el nivel máximo (4) → 20', () => {
    expect(notaCompetencias([4, 4, 4, 4, 4, 4, 4, 4])).toBe(20);
  });
  it('las 8 en el nivel mínimo (0) → 0', () => {
    expect(notaCompetencias([0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
  });
  it('mitad de la escala (2 de 4) → 10', () => {
    expect(notaCompetencias([2, 2, 2, 2, 2, 2, 2, 2])).toBe(10);
  });
  it('ejemplo real del viejo: compTotal=32/32 → 20 (public/js/admin.js:1554-1555)', () => {
    // 8 competencias × 4 = 32 máximo posible.
    const seleccion = [4, 4, 4, 4, 4, 4, 4, 4];
    expect(seleccion.reduce((a, b) => a + b, 0)).toBe(32);
    expect(notaCompetencias(seleccion)).toBe(20);
  });
  it('mezcla de niveles', () => {
    // total 20 de 32 → (20/32)*20 = 12.5
    expect(notaCompetencias([4, 3, 3, 2, 2, 2, 2, 2])).toBe(12.5);
  });
  it('sin selección: 0 (nada de división por cero)', () => {
    expect(notaCompetencias([])).toBe(0);
  });
  it('respeta un máximo por ítem distinto de 4', () => {
    expect(notaCompetencias([5, 5], 5)).toBe(20);
    expect(notaCompetencias([0, 5], 5)).toBe(10);
  });
});
