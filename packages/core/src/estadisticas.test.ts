import { describe, it, expect } from 'vitest';
import {
  normalizarRango,
  diasEnRango,
  rangoAnterior,
  claveBucket,
  agruparSerie,
  variacionPct,
  participacion,
} from './estadisticas';

describe('normalizarRango', () => {
  it('respeta un rango explícito', () => {
    expect(normalizarRango('2026-06-01', '2026-06-30')).toEqual({ desde: '2026-06-01', hasta: '2026-06-30' });
  });
  it('ordena si desde > hasta', () => {
    expect(normalizarRango('2026-06-30', '2026-06-01')).toEqual({ desde: '2026-06-01', hasta: '2026-06-30' });
  });
  it('por defecto abarca los últimos N días', () => {
    const r = normalizarRango(undefined, '2026-06-30', 29);
    expect(r.hasta).toBe('2026-06-30');
    expect(r.desde).toBe('2026-06-01'); // 30 días inclusive
  });
});

describe('diasEnRango', () => {
  it('cuenta inclusivo', () => {
    expect(diasEnRango({ desde: '2026-06-01', hasta: '2026-06-30' })).toBe(30);
    expect(diasEnRango({ desde: '2026-06-15', hasta: '2026-06-15' })).toBe(1);
  });
});

describe('rangoAnterior', () => {
  it('devuelve el periodo previo de igual longitud', () => {
    expect(rangoAnterior({ desde: '2026-06-01', hasta: '2026-06-30' })).toEqual({ desde: '2026-05-02', hasta: '2026-05-31' });
  });
});

describe('claveBucket', () => {
  it('día', () => {
    expect(claveBucket('2026-06-17', 'dia')).toBe('2026-06-17');
  });
  it('mes', () => {
    expect(claveBucket('2026-06-17', 'mes')).toBe('2026-06');
  });
  it('semana → lunes de esa semana', () => {
    // 2026-06-17 es miércoles; el lunes de su semana es 2026-06-15.
    expect(claveBucket('2026-06-17', 'semana')).toBe('2026-06-15');
    // 2026-06-15 (lunes) cae en su propia semana.
    expect(claveBucket('2026-06-15', 'semana')).toBe('2026-06-15');
    // 2026-06-14 (domingo) pertenece a la semana que arranca 2026-06-08.
    expect(claveBucket('2026-06-14', 'semana')).toBe('2026-06-08');
  });
});

describe('agruparSerie', () => {
  it('suma por bucket y ordena por clave', () => {
    const rows = [
      { fecha: '2026-06-01', valor: 10 },
      { fecha: '2026-06-01', valor: 5 },
      { fecha: '2026-06-03', valor: 7 },
    ];
    expect(agruparSerie(rows, 'dia')).toEqual([
      { clave: '2026-06-01', total: 15 },
      { clave: '2026-06-03', total: 7 },
    ]);
  });
  it('agrupa por mes', () => {
    const rows = [
      { fecha: '2026-06-01', valor: 10 },
      { fecha: '2026-06-20', valor: 20 },
      { fecha: '2026-07-02', valor: 5 },
    ];
    expect(agruparSerie(rows, 'mes')).toEqual([
      { clave: '2026-06', total: 30 },
      { clave: '2026-07', total: 5 },
    ]);
  });
});

describe('variacionPct', () => {
  it('calcula variación relativa', () => {
    expect(variacionPct(120, 100)).toBe(20);
    expect(variacionPct(80, 100)).toBe(-20);
  });
  it('sin base previa', () => {
    expect(variacionPct(50, 0)).toBe(100);
    expect(variacionPct(0, 0)).toBe(0);
  });
});

describe('participacion', () => {
  it('reparte porcentajes y ordena desc', () => {
    const p = participacion({ alquiler: 75, venta: 25 });
    expect(p[0]).toEqual({ categoria: 'alquiler', total: 75, pct: 75 });
    expect(p[1]).toEqual({ categoria: 'venta', total: 25, pct: 25 });
  });
  it('total 0 → 0%', () => {
    expect(participacion({ a: 0 })).toEqual([{ categoria: 'a', total: 0, pct: 0 }]);
  });
});
