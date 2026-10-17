import { describe, it, expect } from 'vitest';
import { resumenLiquidacion, type LineaParaResumen } from './resumen-liquidacion';
import { liquidarPeriodo, diasDelPeriodo, type EntradaLiquidacion } from './sueldos';

// Spec: docs/superpowers/specs/2026-10-17-resumen-liquidacion-design.md.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

const L = (grupo: LineaParaResumen['grupo'], concepto: string, monto: number): LineaParaResumen => ({
  grupo,
  concepto,
  monto,
});

// Las 12 líneas que emite liquidarPeriodo() (sueldos.ts), con montos que suman 1.000,00.
const LINEAS: LineaParaResumen[] = [
  L('ingreso', 'Sueldo', 1200),
  L('ingreso', 'Comisión 2%', 80),
  L('ingreso', 'Bono por metas semanales', 40),
  L('ingreso', 'Almuerzos', 24),
  L('ingreso', 'Horas fuera de contrato', 30),
  L('descuento', 'Faltas injustificadas', -60),
  L('descuento', 'Adelantos', -300),
  L('ajuste', 'Diferencia de horas', -20),
  L('ajuste', 'Apoyo en capacitación', 15),
  L('final', 'Descuento por tardanzas', -6),
  L('final', 'Reportes con descuento', -10),
  L('final', 'Bonos extras', 7),
];
const TOTAL = 1200 + 80 + 40 + 24 + 30 - 60 - 300 - 20 + 15 - 6 - 10 + 7; // 1000

const base = {
  lineas: LINEAS,
  ventas: { total: 5000, metaPeriodo: 4000 },
  total: TOTAL,
  abonos: 0,
};

describe('resumenLiquidacion', () => {
  it('reagrupa las líneas del motor en las filas de la hoja RESUMEN', () => {
    const r = resumenLiquidacion(base);
    expect(r.sueldo).toBe(1200);
    expect(r.comision1).toBe(80);
    expect(r.capacitacion).toBe(15);
    expect(r.horasExtras).toBe(10); // -20 de diferencia de horas + 30 fuera de contrato
    expect(r.penalidadTardanzas).toBe(6);
    expect(r.penalidadFaltas).toBe(60);
    expect(r.penalidadReportes).toBe(10);
    expect(r.almuerzos).toBe(24);
    expect(r.adelantos).toBe(300);
    expect(r.comision2).toBe(40); // bono por metas semanales = 2.ª comisión
    expect(r.otrosBeneficios).toBe(24 + 7); // almuerzos + bonos extras
  });

  it('las penalidades y adelantos salen en positivo (son lo que se resta)', () => {
    const r = resumenLiquidacion(base);
    expect(r.totalDescuentos).toBe(76);
    expect(r.totalBeneficios).toBe(80 + 40 + 15 + 31);
  });

  it('total final por pagar = total congelado + adelantos, y el invariante cuadra', () => {
    const r = resumenLiquidacion(base);
    expect(r.totalFinalPorPagar).toBe(1300);
    expect(r.sueldo + r.horasExtras + r.totalBeneficios - r.totalDescuentos).toBe(r.totalFinalPorPagar);
  });

  it('el invariante se mantiene con una línea que no reconoce', () => {
    const r = resumenLiquidacion({
      ...base,
      lineas: [...LINEAS, L('ajuste', 'Concepto futuro', 25), L('descuento', 'Otro descuento', -5)],
      total: TOTAL + 20,
    });
    expect(r.otrosBeneficios).toBe(31 + 25);
    expect(r.otrosDescuentos).toBe(5);
    expect(r.sueldo + r.horasExtras + r.totalBeneficios - r.totalDescuentos).toBe(r.totalFinalPorPagar);
  });

  it('ventas: acordado y logrado salen del snapshot; mínimo y «continúa» no están configurados', () => {
    const r = resumenLiquidacion(base);
    expect(r.ventasAcordado).toBe(4000);
    expect(r.ventasLogrado).toBe(5000);
    expect(r.minimoVentas).toBeNull();
    expect(r.continua).toBeNull();
    expect(r.comision2).toBe(40);
  });

  it('si se pasa un mínimo, continúa = logrado > mínimo', () => {
    expect(resumenLiquidacion({ ...base, minimoVentas: 4500 }).continua).toBe(true);
    expect(resumenLiquidacion({ ...base, minimoVentas: 5000 }).continua).toBe(false);
  });

  it('restante y cancelado dependen de los abonos', () => {
    expect(resumenLiquidacion(base).restante).toBe(1000);
    expect(resumenLiquidacion(base).cancelado).toBe(false);
    const a = resumenLiquidacion({ ...base, abonos: 400.5 });
    expect(a.restante).toBe(599.5);
    const c = resumenLiquidacion({ ...base, abonos: 1000 });
    expect(c.restante).toBe(0);
    expect(c.cancelado).toBe(true);
  });

  it('un total de 0 o negativo nunca figura como cancelado', () => {
    const r = resumenLiquidacion({ ...base, total: -50, abonos: 0 });
    expect(r.cancelado).toBe(false);
    expect(r.restante).toBe(0);
  });

  it('total invertido ADM = total + almuerzos', () => {
    expect(resumenLiquidacion(base).totalInvertido).toBe(1024);
  });

  it('sin líneas (borrador) devuelve ceros, no revienta', () => {
    const r = resumenLiquidacion({ ...base, lineas: [], total: 0 });
    expect(r.sueldo).toBe(0);
    expect(r.totalFinalPorPagar).toBe(0);
  });

  it('redondea a centavos sin arrastrar error de coma flotante', () => {
    const r = resumenLiquidacion({
      lineas: [L('ingreso', 'Sueldo', 0.1), L('ingreso', 'Comisión 2%', 0.2)],
      ventas: { total: 0, metaPeriodo: 0 },
      total: 0.3,
      abonos: 0,
    });
    expect(r.totalFinalPorPagar).toBe(0.3);
  });
});

// Ata el resumen al motor real: si sueldos.ts renombra un concepto, esto se rompe en vez de dejar
// una fila en cero en pantalla.
describe('resumenLiquidacion contra liquidarPeriodo()', () => {
  const dias = diasDelPeriodo('2026-10-01', '2026-10-31');
  const entrada: EntradaLiquidacion = {
    fechaInicio: '2026-10-01',
    fechaFin: '2026-10-31',
    sueldoPactado: 1500,
    horario: [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({ diaSemana, turno: 1, horaInicio: '09:00', horaFin: '17:00' })),
    // Falta el 10-02 (falta injustificada) y el 10-03 llega tarde (tardanza).
    asistencia: dias.map((fecha) =>
      fecha === '2026-10-02'
        ? { fecha, horaIngreso: null, horaSalida: null }
        : { fecha, horaIngreso: fecha === '2026-10-03' ? '09:40' : '09:00', horaSalida: '17:00' },
    ),
    ventas: [{ fecha: '2026-10-05', monto: 900 }],
    adelantos: [{ fecha: '2026-10-10', motivo: 'adelanto', monto: 200 }],
    reportes: [{ fecha: '2026-10-11', motivo: 'reporte', monto: 15 }],
    bonosExtras: [{ fecha: '2026-10-12', motivo: 'bono', monto: 30 }],
    parametros: { tardanzasLibres: 0 },
  };
  const liq = liquidarPeriodo(entrada);
  const r = resumenLiquidacion({ lineas: liq.lineas, ventas: liq.ventas, total: liq.total, abonos: 0 });

  it('reconoce cada penalidad, el adelanto y los bonos que el motor emite', () => {
    expect(r.penalidadFaltas).toBeGreaterThan(0);
    expect(r.penalidadTardanzas).toBeGreaterThan(0);
    expect(r.penalidadReportes).toBe(15);
    expect(r.adelantos).toBe(200);
    expect(r.sueldo).toBe(1500);
    expect(r.otrosDescuentos).toBe(0); // ninguna línea con monto cayó en «Otros»
  });

  it('el invariante cuadra con el total real del motor', () => {
    expect(r.totalFinalPorPagar).toBe(Math.round((liq.total + 200) * 100) / 100);
    const suma = r.sueldo + r.horasExtras + r.totalBeneficios - r.totalDescuentos;
    expect(Math.round(suma * 100) / 100).toBe(r.totalFinalPorPagar);
  });
});
