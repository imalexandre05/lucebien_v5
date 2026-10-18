import { describe, it, expect } from 'vitest';
import { liquidarPeriodo, type EntradaLiquidacion, type RegistroAsistencia } from './sueldos';

// Spec: docs/superpowers/specs/sueldos/2026-10-18-liquidacion-borrador-dias-pendientes-design.md
// Semana lun 2025-07-07 … vie 2025-07-11, turno 08:00–16:00 (8 h) de lunes a viernes.
const HORARIO = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, turno: 1, horaInicio: '08:00', horaFin: '16:00' }));
const dia = (fecha: string): RegistroAsistencia => ({ fecha, horaIngreso: '08:00', horaSalida: '16:00' });
const base = (asistencia: RegistroAsistencia[], extra: Partial<EntradaLiquidacion> = {}): EntradaLiquidacion => ({
  fechaInicio: '2025-07-07',
  fechaFin: '2025-07-11',
  sueldoPactado: 500,
  horario: HORARIO,
  asistencia,
  ...extra,
});
const COMPLETA = ['07', '08', '09', '10', '11'].map((d) => dia(`2025-07-${d}`));

describe('días por declarar (borrador provisional)', () => {
  it('sin el campo, un día sin registro sigue cortando el cálculo', () => {
    expect(() => liquidarPeriodo(base(COMPLETA.slice(0, 3)))).toThrow(/Faltan 2 día\(s\) contratado\(s\)/);
  });

  it('con el día declarado como pendiente no corta, no lo paga, no lo castiga y avisa', () => {
    const l = liquidarPeriodo(base(COMPLETA.slice(0, 4), { diasSinDeclarar: ['2025-07-11'] }));
    expect(l.asistencia.faltas).toBe(0);
    expect(l.asistencia.diasTrabajados).toBe(4);
    expect(l.asistencia.horasTrabajadas).toBe(32);
    expect(l.diasSinDeclarar).toEqual(['2025-07-11']);
    expect(l.advertencias.join(' ')).toMatch(/2025-07-11/);
    expect(l.advertencias.join(' ')).toMatch(/provisional/i);
    expect(l.descuentos).toBe(0);
  });

  it('un pendiente sin declarar no vale como falta: el total no baja de lo trabajado', () => {
    const completa = liquidarPeriodo(base(COMPLETA));
    const parcial = liquidarPeriodo(base(COMPLETA.slice(0, 4), { diasSinDeclarar: ['2025-07-11'] }));
    expect(parcial.total).toBeLessThan(completa.total);
    expect(parcial.total).toBe(400); // 4 de 5 días de 8 h: 500 × 4/5
  });

  it('un día pendiente que SÍ trae registro se liquida con su registro', () => {
    const l = liquidarPeriodo(base(COMPLETA, { diasSinDeclarar: ['2025-07-11'] }));
    expect(l.asistencia.diasTrabajados).toBe(5);
    expect(l.diasSinDeclarar ?? []).toEqual([]);
  });

  it('un día no contratado en la lista de pendientes no cambia nada', () => {
    const l = liquidarPeriodo(base(COMPLETA, { diasSinDeclarar: ['2025-07-12'] }));
    expect(l.diasSinDeclarar ?? []).toEqual([]);
    expect(l.total).toBe(liquidarPeriodo(base(COMPLETA)).total);
  });
});
