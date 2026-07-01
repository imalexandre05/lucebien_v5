import { describe, it, expect } from 'vitest';
import {
  calcularNotaMensual,
  notaTardanza,
  tramoEval,
  PESOS_DEFAULT,
  type ComponentesEval,
} from './evaluaciones';

const base: ComponentesEval = {
  competencias: 20,
  valores: 20,
  operaciones: 20,
  software: 20,
  limpieza: 20,
  examenes: 20,
  tardanza: 20,
  descuentoIncidencias: 0,
  bonusVentas: 0,
};

describe('calcularNotaMensual', () => {
  it('todo 20 con pesos que suman 1 → 20', () => {
    expect(calcularNotaMensual(base, PESOS_DEFAULT)).toBe(20);
  });
  it('aplica descuento y bonus al final', () => {
    expect(calcularNotaMensual({ ...base, descuentoIncidencias: 3, bonusVentas: 1 }, PESOS_DEFAULT)).toBe(18);
  });
  it('pondera por peso de cada componente', () => {
    // solo competencias=20 (peso 0.25), resto 0 → 5
    const c = { ...base, valores: 0, operaciones: 0, software: 0, limpieza: 0, examenes: 0, tardanza: 0 };
    expect(calcularNotaMensual(c, PESOS_DEFAULT)).toBe(5);
  });
});

describe('notaTardanza', () => {
  it('sin tardanza = 20', () => expect(notaTardanza(0)).toBe(20));
  it('resta 1 punto por cada 15 min', () => expect(notaTardanza(45)).toBe(17));
  it('no baja de 0', () => expect(notaTardanza(1000)).toBe(0));
});

describe('tramoEval', () => {
  it('clasifica por nota', () => {
    expect(tramoEval(18)).toBe('excelente');
    expect(tramoEval(15)).toBe('bueno');
    expect(tramoEval(12)).toBe('mejorar');
    expect(tramoEval(9)).toBe('bajo');
  });
});
