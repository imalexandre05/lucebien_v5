import { describe, expect, it } from 'vitest';
import { semanasConMeta } from './semanas-meta';

describe('semanasConMeta', () => {
  const ventas = [
    { fecha: '2025-06-17', monto: 1800 },
    { fecha: '2025-06-24', monto: 1800 },
    { fecha: '2025-07-01', monto: 1800 },
    { fecha: '2025-07-08', monto: 1800 },
  ];

  it('suma las ventas dentro de cada semana', () => {
    const s = semanasConMeta('2025-06-16', '2025-07-16', ventas, 1500);
    expect(s.map((x) => x.vendido)).toEqual([1800, 1800, 1800, 1800]);
  });

  it('cumple con mayor estricto: empatar la meta no la cumple', () => {
    const s = semanasConMeta('2025-06-16', '2025-06-22', [{ fecha: '2025-06-17', monto: 1500 }], 1500);
    expect(s[0].cumplida).toBe(false);
  });

  it('una venta fuera del periodo no entra en ninguna semana', () => {
    const s = semanasConMeta('2025-06-16', '2025-06-22', [{ fecha: '2025-08-01', monto: 999 }], 1500);
    expect(s[0].vendido).toBe(0);
  });

  it('numera las semanas desde 1, reporta sus dias, y la ultima absorbe lo sobrante (RN-12)', () => {
    const s = semanasConMeta('2025-06-16', '2025-07-16', ventas, 1500);
    expect(s.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
    expect(s[3].dias).toBe(10);
    expect(s[3]).toMatchObject({ desde: '2025-07-07', hasta: '2025-07-16' });
  });

  it('un periodo mas corto que una semana da una sola semana', () => {
    const s = semanasConMeta('2025-06-16', '2025-06-19', [], 1500);
    expect(s).toHaveLength(1);
    expect(s[0].dias).toBe(4);
  });
});
