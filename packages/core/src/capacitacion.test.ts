import { describe, it, expect } from 'vitest';
import { resumenChecklist, notaExamen, puedeCerrar, resultadoCapacitacion } from './capacitacion';

const items = ['a', 'b', 'c'];

describe('resumenChecklist', () => {
  it('cuenta cada estado y los pendientes', () => {
    const r = resumenChecklist(items, { a: 'bueno', b: 'malo' });
    expect(r).toEqual({ total: 3, bueno: 1, regular: 0, malo: 1, pendientes: 1 });
  });
  it('ignora avances de ítems que ya no están activos', () => {
    const r = resumenChecklist(items, { a: 'bueno', zzz: 'malo' });
    expect(r.malo).toBe(0);
    expect(r.pendientes).toBe(2);
  });
});

describe('notaExamen', () => {
  it('sin exámenes es null', () => expect(notaExamen([])).toBeNull());
  it('toma la última nota por fecha (el reintento reemplaza)', () => {
    expect(notaExamen([{ nota: 8, fecha: '2026-10-01' }, { nota: 15, fecha: '2026-10-05' }])).toBe(15);
  });
  it('a igual fecha gana el que viene después en la lista', () => {
    expect(notaExamen([{ nota: 8, fecha: '2026-10-01' }, { nota: 12, fecha: '2026-10-01' }])).toBe(12);
  });
});

describe('puedeCerrar', () => {
  it('exige todos los ítems marcados y al menos un examen', () => {
    expect(puedeCerrar(resumenChecklist(items, { a: 'bueno', b: 'bueno', c: 'regular' }), 1).ok).toBe(true);
    expect(puedeCerrar(resumenChecklist(items, { a: 'bueno' }), 1).ok).toBe(false);
    expect(puedeCerrar(resumenChecklist(items, { a: 'bueno', b: 'bueno', c: 'bueno' }), 0).ok).toBe(false);
  });
  it('dice qué falta', () => {
    expect(puedeCerrar(resumenChecklist(items, {}), 0).motivo).toMatch(/3 ítems/);
  });
  it('un checklist vacío no se puede cerrar', () => {
    expect(puedeCerrar(resumenChecklist([], {}), 1).ok).toBe(false);
  });
});

describe('resultadoCapacitacion', () => {
  const ok = resumenChecklist(items, { a: 'bueno', b: 'regular', c: 'bueno' });
  it('aprobada: nota >= mínimo y ningún ítem en malo', () => {
    expect(resultadoCapacitacion(ok, 14, 14)).toBe('aprobada');
  });
  it('por reforzar si la nota no alcanza', () => {
    expect(resultadoCapacitacion(ok, 13.5, 14)).toBe('por_reforzar');
  });
  it('por reforzar si hay un ítem en malo aunque la nota alcance', () => {
    expect(resultadoCapacitacion(resumenChecklist(items, { a: 'malo', b: 'bueno', c: 'bueno' }), 18, 14)).toBe('por_reforzar');
  });
  it('sin nota no hay resultado aprobado', () => {
    expect(resultadoCapacitacion(ok, null, 14)).toBe('por_reforzar');
  });
});
