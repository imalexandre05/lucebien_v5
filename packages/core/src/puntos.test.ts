import { describe, it, expect } from 'vitest';
import { puntosDeEtapa } from './puntos';

describe('puntosDeEtapa (regla ½ prenda, E1)', () => {
  it('terno completo vale el peso entero', () => {
    expect(puntosDeEtapa(4, true)).toBe(4);
    expect(puntosDeEtapa(1, true)).toBe(1);
  });
  it('pieza suelta vale la mitad', () => {
    expect(puntosDeEtapa(4, false)).toBe(2);
    expect(puntosDeEtapa(3, false)).toBe(1.5);
  });
});
