import { describe, it, expect } from 'vitest';
import {
  totalCompra,
  validarCompra,
  costoPromedioPonderado,
  stockBajo,
  aplicarMovimiento,
  type ItemCompra,
} from './compras';

describe('totalCompra', () => {
  it('suma cantidad × costo de cada ítem', () => {
    const items: ItemCompra[] = [
      { cantidad: 3, costoUnitario: 10 },
      { cantidad: 2, costoUnitario: 5.5 },
    ];
    expect(totalCompra(items)).toBe(41); // 30 + 11
  });
  it('compra vacía = 0', () => {
    expect(totalCompra([])).toBe(0);
  });
  it('redondea a 2 decimales', () => {
    expect(totalCompra([{ cantidad: 3, costoUnitario: 0.1 }])).toBe(0.3);
  });
});

describe('validarCompra', () => {
  it('válida cuando hay ítems con cantidad > 0', () => {
    expect(validarCompra([{ cantidad: 1, costoUnitario: 10 }])).toEqual([]);
  });
  it('rechaza compra sin ítems', () => {
    expect(validarCompra([])).toHaveLength(1);
  });
  it('rechaza cantidad 0 o negativa y costo negativo', () => {
    const errs = validarCompra([
      { cantidad: 0, costoUnitario: 10 },
      { cantidad: 2, costoUnitario: -1 },
    ]);
    expect(errs).toHaveLength(2);
  });
});

describe('costoPromedioPonderado', () => {
  it('primer ingreso: el costo es el de la compra', () => {
    expect(costoPromedioPonderado(0, 0, 10, 5)).toBe(5);
  });
  it('mezcla stock previo con nuevo lote', () => {
    // 10 u a 5 (=50) + 10 u a 7 (=70) => 120/20 = 6
    expect(costoPromedioPonderado(10, 5, 10, 7)).toBe(6);
  });
  it('conserva el costo si el nuevo stock quedaría en 0', () => {
    expect(costoPromedioPonderado(0, 4, 0, 9)).toBe(4);
  });
});

describe('stockBajo', () => {
  it('true cuando actual < mínimo', () => {
    expect(stockBajo({ stockActual: 2, stockMinimo: 5 })).toBe(true);
  });
  it('false cuando actual >= mínimo', () => {
    expect(stockBajo({ stockActual: 5, stockMinimo: 5 })).toBe(false);
  });
  it('sin mínimo definido no alerta', () => {
    expect(stockBajo({ stockActual: 0, stockMinimo: 0 })).toBe(false);
  });
  it('material inactivo no alerta', () => {
    expect(stockBajo({ stockActual: 0, stockMinimo: 5, activo: false })).toBe(false);
  });
});

describe('aplicarMovimiento', () => {
  it('entrada suma, salida resta, ajuste fija', () => {
    expect(aplicarMovimiento(10, 'entrada', 3)).toBe(13);
    expect(aplicarMovimiento(10, 'salida', 4)).toBe(6);
    expect(aplicarMovimiento(10, 'ajuste', 7)).toBe(7);
  });
});
