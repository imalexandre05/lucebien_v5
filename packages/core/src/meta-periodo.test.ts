import { describe, it, expect } from 'vitest';
import { liquidarPeriodo, type EntradaLiquidacion, type TurnoContratado } from './sueldos';

// Meta del período y 1.ª comisión (decisión del dueño n.º 2, corregida el 19-oct-2026).
// Spec: docs/superpowers/specs/sueldos/2026-10-19-meta-del-periodo-primera-comision-design.md §3 y §6.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

// Lunes a miércoles 09:00–20:00 (11 h): una semana trabajada completa = 33 h. 2025-06-16 es lunes.
const HORARIO: TurnoContratado[] = [1, 2, 3].flatMap((diaSemana) => [
  { diaSemana, turno: 1, horaInicio: '09:00', horaFin: '13:00' },
  { diaSemana, turno: 2, horaInicio: '13:00', horaFin: '20:00' },
]);
const dia = (fecha: string) => ({ fecha, horaIngreso: '09:00', horaSalida: '20:00' });
const falta = (fecha: string) => ({ fecha, horaIngreso: null, horaSalida: null });
const LUN = '2025-06-16';
const MAR = '2025-06-17';
const MIE = '2025-06-18';

// metaPorHora 10 → meta estimada = 10 × horas trabajadas (330 con las 33 h).
const liquidar = (monto: number, extra: Partial<EntradaLiquidacion> = {}, dias = [dia(LUN), dia(MAR), dia(MIE)]) =>
  liquidarPeriodo({
    fechaInicio: LUN,
    fechaFin: '2025-06-22',
    sueldoPactado: 600,
    horario: HORARIO,
    asistencia: dias,
    horasFueraDeContrato: [],
    ventas: [{ fecha: LUN, monto, tipo: 'venta' }],
    adelantos: [],
    reportes: [],
    bonosExtras: [],
    almuerzosEntregados: 0,
    almuerzoHabilitadoPorAdmin: false,
    personasCapacitadas: 0,
    parametros: { metaPorHora: 10 },
    ...extra,
  } as EntradaLiquidacion);
const linea = (l: ReturnType<typeof liquidar>, regla: string) => l.lineas.find((x) => x.regla === regla)?.monto ?? 0;

describe('meta del período — 1.ª comisión (spec §3)', () => {
  it('meta estimada = metaPorHora × horas trabajadas; ventas que la alcanzan → 2% de la base', () => {
    const l = liquidar(400);
    expect(l.ventas.metaPeriodo).toBe(330);
    expect(linea(l, 'RN-13')).toBe(8);
  });

  it('ventas por debajo de la meta → 1.ª comisión 0 (el empate sí cumple)', () => {
    expect(linea(liquidar(329), 'RN-13')).toBe(0);
    expect(linea(liquidar(330), 'RN-13')).toBe(6.6);
  });

  it('con menos horas trabajadas la meta baja (una falta → 22 h → 220)', () => {
    const l = liquidar(250, {}, [dia(LUN), dia(MAR), falta(MIE)]);
    expect(l.ventas.metaPeriodo).toBe(220);
    expect(linea(l, 'RN-13')).toBe(5);
  });

  it('la meta que pone el administrador manda sobre la estimada (más baja y más alta)', () => {
    expect(linea(liquidar(200, { metaPeriodoManual: 100 }), 'RN-13')).toBe(4);
    expect(liquidar(200, { metaPeriodoManual: 100 }).ventas.metaPeriodo).toBe(100);
    expect(linea(liquidar(400, { metaPeriodoManual: 1000 }), 'RN-13')).toBe(0);
  });

  it('una meta semanal pactada en el contrato manda sobre la estimada por horas', () => {
    const l = liquidar(400, { parametros: { metaPorHora: 10, metaSemanal: 1000 } });
    expect(l.ventas.metaPeriodo).toBe(1000);
    expect(linea(l, 'RN-13')).toBe(0);
  });

  it('la 2.ª comisión (bono por meta semanal) no cambia con la meta del período', () => {
    const base = linea(liquidar(100000), 'RN-12');
    expect(base).toBeGreaterThan(0);
    expect(linea(liquidar(100000, { metaPeriodoManual: 1 }), 'RN-12')).toBe(base);
    expect(linea(liquidar(100000, { metaPeriodoManual: 9999999 }), 'RN-12')).toBe(base);
  });

  it('las horas fuera de contrato también cuentan para la meta estimada', () => {
    // Jueves 2025-06-19 sin horario contratado: 4 h fuera de contrato → 33 + 4 = 37 h → meta 370.
    const l = liquidar(400, {
      horasFueraDeContrato: [{ fecha: '2025-06-19', horaIngreso: '09:00', horaSalida: '13:00' }],
    });
    expect(l.ventas.metaPeriodo).toBe(370);
    expect(linea(l, 'RN-13')).toBe(8);
  });

  it('la meta se redondea a céntimos antes de comparar (lo que dice la pantalla es lo que paga)', () => {
    // 33 h × 10,00303 = 330,10 (redondeada); ventas 330,10 deben alcanzarla.
    const l = liquidar(330.1, { parametros: { metaPorHora: 10.00303 } });
    expect(l.ventas.metaPeriodo).toBe(330.1);
    expect(l.ventas.metaAlcanzada).toBe(true);
  });

  it('sin horas trabajadas la 1.ª comisión no aplica: no es Cumplida y no se paga', () => {
    const l = liquidar(400, {}, [falta(LUN), falta(MAR), falta(MIE)]);
    expect(l.ventas.primeraComisionAplica).toBe(false);
    expect(l.ventas.metaAlcanzada).toBe(false);
    expect(linea(l, 'RN-13')).toBe(0);
    expect(liquidar(400).ventas.primeraComisionAplica).toBe(true);
  });

  it('una temporada que cubre solo una semana prorratea la meta por días', () => {
    // Dos semanas (lun 16 y lun 23), 33 h cada una. Temporada de la 1.ª semana: S/20 por hora.
    const dos = ['2025-06-16', '2025-06-17', '2025-06-18', '2025-06-23', '2025-06-24', '2025-06-25'].map(dia);
    const base = { fechaFin: '2025-06-29', asistencia: dos };
    const temporada = (extra: object) => ({ nombre: 'T', desde: '2025-06-16', hasta: '2025-06-22', pagoPorHora: null, metaSemanal: null, metaPorHora: 20, ...extra });
    const l = liquidar(1000, { ...base, temporadas: [temporada({})] } as Partial<EntradaLiquidacion>, dos);
    expect(l.ventas.metaPeriodo).toBe(990); // 33 × 20 + 33 × 10
    // Una meta semanal pactada de la temporada vale solo para su semana; la otra se estima por horas.
    const m = liquidar(1000, { ...base, temporadas: [temporada({ metaPorHora: null, metaSemanal: 500 })] } as Partial<EntradaLiquidacion>, dos);
    expect(m.ventas.metaPeriodo).toBe(830); // 500 + 33 × 10
  });

  it('una meta puesta inválida se rechaza', () => {
    expect(() => liquidar(400, { metaPeriodoManual: -5 })).toThrow(/meta/i);
  });
});
