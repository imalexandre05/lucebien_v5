import { describe, it, expect } from 'vitest';
import { liquidarPeriodo, diasDelPeriodo, type EntradaLiquidacion } from './sueldos';
import { resumenLiquidacion } from './resumen-liquidacion';

// Spec: docs/superpowers/specs/2026-10-17-pasajes-puntualidad-design.md.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

const dias = diasDelPeriodo('2026-10-01', '2026-10-07'); // jueves a miércoles
const horario = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({ diaSemana, turno: 1, horaInicio: '09:00', horaFin: '17:00' }));

function entrada(ingresos: Record<string, string | null>, parametros?: EntradaLiquidacion['parametros']): EntradaLiquidacion {
  return {
    fechaInicio: '2026-10-01',
    fechaFin: '2026-10-07',
    sueldoPactado: 700,
    horario,
    asistencia: dias.map((fecha) => {
      const ing = fecha in ingresos ? ingresos[fecha] : '09:00';
      return { fecha, horaIngreso: ing, horaSalida: ing ? '17:00' : null };
    }),
    parametros,
  };
}
const linea = (l: ReturnType<typeof liquidarPeriodo>) => l.lineas.find((x) => x.concepto === 'Pasajes por llegar temprano');

describe('pasajes por llegar temprano', () => {
  it('sin monto configurado no hay línea ni pago (default vacío)', () => {
    expect(linea(liquidarPeriodo(entrada({ '2026-10-01': '08:30' })))).toBeUndefined();
  });

  it('paga el monto por cada día con ingreso 5 min antes o más', () => {
    const l = liquidarPeriodo(
      entrada({ '2026-10-01': '08:55', '2026-10-02': '08:30', '2026-10-03': '08:56', '2026-10-04': '09:00' }, { montoPasaje: 3 }),
    );
    expect(linea(l)?.monto).toBe(6); // 08:55 y 08:30 cuentan; 08:56 y 09:00 no
    expect(linea(l)?.grupo).toBe('ingreso');
  });

  it('los minutos son editables', () => {
    const l = liquidarPeriodo(entrada({ '2026-10-01': '08:50', '2026-10-02': '08:55' }, { montoPasaje: 2, minutosAntesPasaje: 10 }));
    expect(linea(l)?.monto).toBe(2);
  });

  it('una falta no cobra pasaje y el monto cero sí genera línea en 0', () => {
    const l = liquidarPeriodo(entrada({ '2026-10-01': null }, { montoPasaje: 4 }));
    expect(linea(l)?.monto).toBe(0);
    expect(linea(liquidarPeriodo(entrada({}, { montoPasaje: 0 })))?.monto).toBe(0);
  });

  it('suma al total', () => {
    const sin = liquidarPeriodo(entrada({ '2026-10-01': '08:40' }));
    const con = liquidarPeriodo(entrada({ '2026-10-01': '08:40' }, { montoPasaje: 5 }));
    expect(Math.round((con.total - sin.total) * 100) / 100).toBe(5);
  });

  it('el resumen lo muestra en su propia fila y el invariante cuadra', () => {
    const l = liquidarPeriodo(entrada({ '2026-10-01': '08:40', '2026-10-02': '08:40' }, { montoPasaje: 5 }));
    const r = resumenLiquidacion({ lineas: l.lineas, ventas: l.ventas, total: l.total, abonos: 0 });
    expect(r.pasajes).toBe(10);
    expect(r.otrosBeneficios).toBe(0);
    const suma = r.sueldo + r.horasExtras + r.totalBeneficios - r.totalDescuentos;
    expect(Math.round(suma * 100) / 100).toBe(r.totalFinalPorPagar);
  });
});
