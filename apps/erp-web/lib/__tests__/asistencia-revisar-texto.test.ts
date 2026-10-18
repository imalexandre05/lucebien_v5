// @ts-nocheck
// Ver la nota de `porcentaje.test.ts` sobre `@ts-nocheck`.
// Spec: docs/superpowers/specs/sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md §4
import { describe, expect, it } from 'vitest';
import { fechaAmable, fraseDelPago, resumenHorarioSemana } from '../asistencia-revisar-texto';

const p = { toleranciaMinutos: 10, tardanzasLibres: 3, penalidadTardanza: 5, diasDescuentoPorFalta: 2 };

describe('fechaAmable', () => {
  it('escribe día, número y mes', () => {
    expect(fechaAmable('2026-10-07')).toBe('mié 07 oct');
    expect(fechaAmable('2026-10-06')).toBe('mar 06 oct');
  });
});

describe('fraseDelPago', () => {
  it('tardanza usa las tardanzas libres y la penalidad del contrato', () => {
    const f = fraseDelPago({ fecha: '2026-10-07', tipo: 'tardanza', minutosTarde: 15 }, p);
    expect(f).toContain('3 tardanzas libres');
    expect(f).toContain('S/ 5');
  });
  it('falta con 2 días de descuento dice el total', () => {
    expect(fraseDelPago({ fecha: '2026-10-07', tipo: 'falta' }, p)).toContain('2 días de sueldo');
  });
  it('falta con 1 día no promete un descuento extra', () => {
    expect(fraseDelPago({ fecha: '2026-10-07', tipo: 'falta' }, { ...p, diasDescuentoPorFalta: 1 })).toContain(
      'no se descuenta nada más',
    );
  });
});

describe('resumenHorarioSemana', () => {
  it('junta los días seguidos con el mismo horario', () => {
    const t = [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, horaInicio: '09:00:00', horaFin: '18:00' }));
    t.push({ diaSemana: 6, horaInicio: '09:00', horaFin: '13:00' });
    expect(resumenHorarioSemana(t)).toBe('lun a vie 09:00–18:00 · sáb 09:00–13:00');
  });
  it('sin turnos', () => {
    expect(resumenHorarioSemana([])).toBe('Sin horario pactado');
  });
});
