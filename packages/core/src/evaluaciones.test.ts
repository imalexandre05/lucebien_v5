import { describe, it, expect } from 'vitest';
import {
  calcularNotaMensual,
  notaTardanza,
  tramoEval,
  calcularCiclo,
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

describe('calcularCiclo', () => {
  it('sin fecha_ingreso: cae a mes calendario completo', () => {
    expect(calcularCiclo(null, '2026-07-20')).toEqual({
      desde: '2026-07-01',
      hasta: '2026-07-31',
      fuente: 'mes_calendario',
    });
  });

  it('fecha_ingreso con formato inválido: mismo fallback', () => {
    expect(calcularCiclo('20-07-2026', '2026-07-20').fuente).toBe('mes_calendario');
    expect(calcularCiclo('', '2026-07-20').fuente).toBe('mes_calendario');
  });

  it('mes calendario respeta meses de 30/31/28 días', () => {
    expect(calcularCiclo(undefined, '2026-02-10')).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-28',
      fuente: 'mes_calendario',
    });
    expect(calcularCiclo(undefined, '2026-04-01')).toEqual({
      desde: '2026-04-01',
      hasta: '2026-04-30',
      fuente: 'mes_calendario',
    });
  });

  it('aniversario: hoy ya pasó el día del mes → ciclo arrancó este mes', () => {
    // fecha_ingreso 2026-03-15, hoy 2026-07-20 (día 20 ≥ 15) → ciclo 15 jul – 14 ago.
    expect(calcularCiclo('2026-03-15', '2026-07-20')).toEqual({
      desde: '2026-07-15',
      hasta: '2026-08-14',
      fuente: 'aniversario',
    });
  });

  it('aniversario: hoy aún no llega al día del mes → ciclo arrancó el mes pasado', () => {
    // fecha_ingreso 2026-03-15, hoy 2026-07-10 (día 10 < 15) → ciclo 15 jun – 14 jul.
    expect(calcularCiclo('2026-03-15', '2026-07-10')).toEqual({
      desde: '2026-06-15',
      hasta: '2026-07-14',
      fuente: 'aniversario',
    });
  });

  it('aniversario en el mismo día: el ciclo arranca hoy', () => {
    expect(calcularCiclo('2026-03-15', '2026-07-15')).toEqual({
      desde: '2026-07-15',
      hasta: '2026-08-14',
      fuente: 'aniversario',
    });
  });

  it('aniversario cruza fin de año', () => {
    // fecha_ingreso día 5, hoy 2026-01-02 (día 2 < 5) → ciclo arrancó en diciembre del año anterior.
    expect(calcularCiclo('2020-03-05', '2026-01-02')).toEqual({
      desde: '2025-12-05',
      hasta: '2026-01-04',
      fuente: 'aniversario',
    });
  });

  it('aniversario en día 31: hereda el mismo "rollover" de calendario que el sistema viejo', () => {
    // fecha_ingreso día 31, ciclo arranca en febrero (28 días en 2026, no bisiesto): Date.UTC
    // normaliza el 31-feb al 3 de marzo — mismo comportamiento que `new Date(y,m,31)` en el
    // original (routes/evaluaciones.js:123), no es un bug nuevo. Ver docs/pendientes-negocio.md.
    expect(calcularCiclo('2026-01-31', '2026-03-15').desde).toBe('2026-03-03');
  });
});
