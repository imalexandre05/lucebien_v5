import { describe, it, expect } from 'vitest';
import {
  puedeEvaluarValores,
  promediosPorValor,
  notaValores360,
  puedeEvaluarValoresHoy,
  VALORES,
  type PuntajeValores,
  type ConfigVentanaValores,
} from './valores360';

const full = (v: number): PuntajeValores => ({
  integridad: v,
  respeto: v,
  honestidad: v,
  amabilidad: v,
  relacion: v,
  actitud: v,
});

describe('VALORES', () => {
  it('son los 6 valores del sistema viejo, en orden', () => {
    expect(VALORES.map((v) => v.key)).toEqual(['integridad', 'respeto', 'honestidad', 'amabilidad', 'relacion', 'actitud']);
  });
});

describe('puedeEvaluarValores', () => {
  it('impide autoevaluarse', () => {
    expect(puedeEvaluarValores('emp-1', 'emp-1')).toBe(false);
  });
  it('permite evaluar a otro', () => {
    expect(puedeEvaluarValores('emp-1', 'emp-2')).toBe(true);
  });
  it('rechaza ids vacíos', () => {
    expect(puedeEvaluarValores('', 'emp-2')).toBe(false);
    expect(puedeEvaluarValores('emp-1', '')).toBe(false);
  });
});

describe('promediosPorValor', () => {
  it('promedia cada valor entre varias evaluaciones', () => {
    const out = promediosPorValor([full(4), full(2)]);
    expect(out.integridad).toBe(3);
    expect(out.actitud).toBe(3);
  });
  it('sin evaluaciones: objeto vacío', () => {
    expect(promediosPorValor([])).toEqual({});
  });
  it('redondea a 2 decimales', () => {
    const out = promediosPorValor([full(5), full(4), full(4)]);
    expect(out.integridad).toBeCloseTo(4.33, 2);
  });
});

describe('notaValores360', () => {
  it('todo en 5 (máximo) → 20', () => {
    expect(notaValores360(promediosPorValor([full(5)]))).toBe(20);
  });
  it('todo en 1 (mínimo) → 4', () => {
    expect(notaValores360(promediosPorValor([full(1)]))).toBe(4);
  });
  it('todo en 3 (default "A veces") → 12', () => {
    expect(notaValores360(promediosPorValor([full(3)]))).toBe(12);
  });
  it('sin promedios: null (nadie evaluó todavía)', () => {
    expect(notaValores360({})).toBeNull();
  });
});

describe('puedeEvaluarValoresHoy', () => {
  const siempre = (): ConfigVentanaValores => ({ habilitado: true, modo: 'siempre', diaInicio: 1, diaFin: 31 });

  it('default (habilitado + modo siempre): abierto cualquier día — mismo comportamiento que antes de esta fase', () => {
    expect(puedeEvaluarValoresHoy(siempre(), 1)).toBe(true);
    expect(puedeEvaluarValoresHoy(siempre(), 15)).toBe(true);
    expect(puedeEvaluarValoresHoy(siempre(), 31)).toBe(true);
  });

  it('habilitado=false: cerrado siempre, sin importar el modo ni el día', () => {
    expect(puedeEvaluarValoresHoy({ habilitado: false, modo: 'siempre', diaInicio: 1, diaFin: 31 }, 15)).toBe(false);
    expect(puedeEvaluarValoresHoy({ habilitado: false, modo: 'ventana', diaInicio: 1, diaFin: 31 }, 15)).toBe(false);
  });

  it('modo ventana: abierto solo dentro del rango [diaInicio, diaFin], inclusive', () => {
    const cfg: ConfigVentanaValores = { habilitado: true, modo: 'ventana', diaInicio: 25, diaFin: 28 };
    expect(puedeEvaluarValoresHoy(cfg, 24)).toBe(false);
    expect(puedeEvaluarValoresHoy(cfg, 25)).toBe(true);
    expect(puedeEvaluarValoresHoy(cfg, 26)).toBe(true);
    expect(puedeEvaluarValoresHoy(cfg, 28)).toBe(true);
    expect(puedeEvaluarValoresHoy(cfg, 29)).toBe(false);
  });

  it('modo ventana con diaInicio > diaFin: se trata como rango invertido (se intercambian)', () => {
    const cfg: ConfigVentanaValores = { habilitado: true, modo: 'ventana', diaInicio: 28, diaFin: 25 };
    expect(puedeEvaluarValoresHoy(cfg, 26)).toBe(true);
    expect(puedeEvaluarValoresHoy(cfg, 24)).toBe(false);
  });
});
