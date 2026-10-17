import { describe, it, expect } from 'vitest';
import { resumenLiquidacion, type LineaParaResumen } from './resumen-liquidacion';

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
    expect(r.otrosBeneficios).toBe(40 + 24 + 7); // metas + almuerzos + bonos extras
  });

  it('las penalidades y adelantos salen en positivo (son lo que se resta)', () => {
    const r = resumenLiquidacion(base);
    expect(r.totalDescuentos).toBe(76);
    expect(r.totalBeneficios).toBe(80 + 15 + 71);
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
    expect(r.otrosBeneficios).toBe(71 + 25);
    expect(r.otrosDescuentos).toBe(5);
    expect(r.sueldo + r.horasExtras + r.totalBeneficios - r.totalDescuentos).toBe(r.totalFinalPorPagar);
  });

  it('ventas: acordado y logrado salen del snapshot; mínimo y «continúa» no están configurados', () => {
    const r = resumenLiquidacion(base);
    expect(r.ventasAcordado).toBe(4000);
    expect(r.ventasLogrado).toBe(5000);
    expect(r.minimoVentas).toBeNull();
    expect(r.continua).toBeNull();
    expect(r.comision2).toBeNull();
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
