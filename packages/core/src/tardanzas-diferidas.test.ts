import { describe, it, expect } from 'vitest';
import { liquidarPeriodo, diasDelPeriodo, type EntradaLiquidacion } from './sueldos';

// Spec: docs/superpowers/specs/sueldos/2026-10-17-ventas-asistencia-periodo-cerrado-design.md.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

const dias = diasDelPeriodo('2026-10-01', '2026-10-07');
const base = (extra: Partial<EntradaLiquidacion> = {}): EntradaLiquidacion => ({
  fechaInicio: '2026-10-01',
  fechaFin: '2026-10-07',
  sueldoPactado: 700,
  horario: [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({ diaSemana, turno: 1, horaInicio: '09:00', horaFin: '17:00' })),
  asistencia: dias.map((fecha) => ({ fecha, horaIngreso: '09:00', horaSalida: '17:00' })),
  ...extra,
});
const desc = (e: EntradaLiquidacion) => liquidarPeriodo(e).lineas.find((l) => l.concepto === 'Descuento por tardanzas');

describe('tardanzas trasladadas de un período cerrado', () => {
  it('sin el campo, nada cambia', () => {
    expect(desc(base({ parametros: { tardanzasLibres: 0 } }))?.monto).toBe(0);
  });

  it('una tardanza trasladada se descuenta en este período (0 libres)', () => {
    const e = base({ tardanzasDiferidas: 1, parametros: { tardanzasLibres: 0, penalidadTardanza: 5 } });
    expect(desc(e)?.monto).toBe(-5);
  });

  it('respeta las tardanzas libres: 1 trasladada con 3 libres no descuenta', () => {
    const e = base({ tardanzasDiferidas: 1, parametros: { tardanzasLibres: 3, penalidadTardanza: 5 } });
    expect(desc(e)?.monto).toBe(0);
  });

  it('se suma a las propias antes de aplicar las libres', () => {
    const asistencia = dias.map((fecha) => ({ fecha, horaIngreso: fecha === '2026-10-02' ? '09:40' : '09:00', horaSalida: '17:00' }));
    const e = base({ asistencia, tardanzasDiferidas: 1, parametros: { tardanzasLibres: 1, penalidadTardanza: 5 } });
    expect(desc(e)?.monto).toBe(-5); // 1 propia + 1 trasladada − 1 libre = 1 × 5
  });

  it('un valor inválido se rechaza', () => {
    expect(() => liquidarPeriodo(base({ tardanzasDiferidas: -1 }))).toThrow();
    expect(() => liquidarPeriodo(base({ tardanzasDiferidas: 1.5 }))).toThrow();
  });
});
