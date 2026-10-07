import { describe, it, expect } from 'vitest';
import {
  liquidarPeriodo,
  resolverParametros,
  diasDelPeriodo,
  type EntradaLiquidacion,
  type ParametrosSueldo,
  type TurnoContratado,
} from './sueldos';

// Pago por puntos sobre la meta mensual.
// Spec: docs/superpowers/specs/sueldos/2026-10-05-pago-por-puntos-design.md §3 y §6.
//
// Estos tests se escribieron ANTES del código (Zone Guard, no-negociable 6) y se activaron en el
// commit que lo escribió sin tocar ni una aserción. Las dos claves nuevas se arman con un tipo
// ampliado (intersección inocua hoy) para que el archivo compilara antes de que
// `ParametrosSueldo`/`EntradaLiquidacion` las tuvieran.

type MesContrato = { desde: string; hasta: string; hastaMes: string; puntos: number };
type Entrada = EntradaLiquidacion & { puntosMeses?: MesContrato[] };
type Params = Partial<ParametrosSueldo> & { puntosMetaMensual?: number | null; solesPorPunto?: number | null };
// `puntos` = los de UN mes del contrato que coincide con el tramo (el caso mensual de siempre).
const con = (base: Entrada, puntos: number | undefined, parametros: Params = {}): EntradaLiquidacion =>
  ({
    ...base,
    puntosMeses:
      puntos === undefined ? undefined : [{ desde: base.fechaInicio, hasta: base.fechaFin, hastaMes: base.fechaFin, puntos }],
    parametros: { ...base.parametros, ...parametros },
  }) as EntradaLiquidacion;
// Entrada con meses del contrato explícitos (§8.2 de la spec).
const conMeses = (base: Entrada, puntosMeses: MesContrato[] | undefined, parametros: Params = PAGO): EntradaLiquidacion =>
  ({ ...base, puntosMeses, parametros: { ...base.parametros, ...parametros } }) as EntradaLiquidacion;

// Todos los días, un turno de 8 h, asistencia exacta: sin tardanzas, faltas ni diferencia de horas.
const HORARIO: TurnoContratado[] = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({
  diaSemana,
  turno: 1,
  horaInicio: '09:00',
  horaFin: '17:00',
}));
const tramo = (fechaInicio: string, fechaFin: string, sueldoPactado = 1000): Entrada => ({
  fechaInicio,
  fechaFin,
  sueldoPactado,
  horario: HORARIO,
  asistencia: diasDelPeriodo(fechaInicio, fechaFin).map((fecha) => ({ fecha, horaIngreso: '09:00', horaSalida: '17:00' })),
});

const MENSUAL = tramo('2026-10-01', '2026-10-31'); // 31 de 31 días de octubre
const SEMANAL = tramo('2026-10-05', '2026-10-11'); // 7 de 31 días
const PAGO: Params = { puntosMetaMensual: 5000, solesPorPunto: 0.05 };
const linea = (l: ReturnType<typeof liquidarPeriodo>) => l.lineas.find((x) => x.concepto === 'Bono por puntos');

describe('pago por puntos (spec §6)', () => {
  it('1. parámetros vacíos → ninguna línea y liquidación idéntica a la de hoy', () => {
    const hoy = liquidarPeriodo(MENSUAL);
    // Con muchos puntos pero sin parámetros: nada cambia, ni una línea ni un centavo.
    const conPuntos = liquidarPeriodo(con(MENSUAL, 99999));
    expect(conPuntos).toEqual(hoy);
    expect(linea(conPuntos)).toBeUndefined();
    // Con sólo uno de los dos definidos tampoco se paga: «cualquiera vacío = desactivado».
    expect(linea(liquidarPeriodo(con(MENSUAL, 99999, { puntosMetaMensual: 5000 })))).toBeUndefined();
    expect(linea(liquidarPeriodo(con(MENSUAL, 99999, { solesPorPunto: 0.05 })))).toBeUndefined();
    expect(liquidarPeriodo(con(MENSUAL, 99999, { solesPorPunto: 0.05 })).total).toBe(hoy.total);
  });

  it('2. meta 5.000, S/0,05 y 6.200 puntos en tramo mensual → S/60,00 con su detalle', () => {
    const base = liquidarPeriodo(MENSUAL);
    const l = liquidarPeriodo(con(MENSUAL, 6200, PAGO));
    expect(linea(l)).toMatchObject({
      grupo: 'ingreso',
      monto: 60,
      detalle: '6.200 puntos − meta 5.000 = 1.200 × S/0,05',
    });
    // Es un ingreso más: sube ingresos y total en exactamente ese monto, nada más se mueve.
    expect(l.ingresos).toBe(Math.round((base.ingresos + 60) * 100) / 100);
    expect(l.total).toBe(Math.round((base.total + 60) * 100) / 100);
    expect(l.lineas).toHaveLength(base.lineas.length + 1);
  });

  it('3. puntos por debajo de la meta (o justo en ella) → S/0 y la línea no se muestra', () => {
    const base = liquidarPeriodo(MENSUAL);
    for (const puntos of [4999.99, 5000, 0]) {
      const l = liquidarPeriodo(con(MENSUAL, puntos, PAGO));
      expect(linea(l)).toBeUndefined();
      expect(l.total).toBe(base.total);
    }
  });

  it('4. semanas 0, 0, 2500 y 2500 con meta 5.000: sólo el tramo que cierra el mes lo paga, y paga S/0 (§8.2, E7)', () => {
    const mes = { desde: '2027-02-01', hasta: '2027-02-28', hastaMes: '2027-02-28', puntos: 5000 };
    for (const [d, h] of [['01', '07'], ['08', '14'], ['15', '21']]) {
      expect(linea(liquidarPeriodo(conMeses(tramo(`2027-02-${d}`, `2027-02-${h}`), [])))).toBeUndefined();
    }
    // El tramo que cierra el mes ve los 5.000 puntos del mes entero contra la meta entera: S/0.
    expect(linea(liquidarPeriodo(conMeses(tramo('2027-02-22', '2027-02-28'), [mes])))).toBeUndefined();
  });

  it('4b. el mes que cierra con 6.200 puntos → S/60 en el tramo que lo cierra', () => {
    const mes = { desde: '2027-02-01', hasta: '2027-02-28', hastaMes: '2027-02-28', puntos: 6200 };
    expect(linea(liquidarPeriodo(conMeses(tramo('2027-02-22', '2027-02-28'), [mes])))?.monto).toBe(60);
  });

  it('4c. D-8: tramo mensual del 30-ene al 28-feb con 5.000 puntos y meta 5.000 → sin línea', () => {
    const mes = { desde: '2026-01-30', hasta: '2026-02-28', hastaMes: '2026-02-28', puntos: 5000 };
    expect(linea(liquidarPeriodo(conMeses(tramo('2026-01-30', '2026-02-28'), [mes])))).toBeUndefined();
  });

  it('4d. el último mes, cortado por el fin del contrato, prorratea la meta por días contra el mes completo', () => {
    // 15 de 31 días: meta del mes = 5.000 × 15 / 31 = 2.419,35…
    const mes = { desde: '2026-10-01', hasta: '2026-10-15', hastaMes: '2026-10-31', puntos: 3000 };
    const l = linea(liquidarPeriodo(conMeses(tramo('2026-10-01', '2026-10-15'), [mes])))!;
    // (3.000 − 2.419,354…) × 0,05 = 29,032… → 29,03
    expect(l.monto).toBe(29.03);
    expect(l.detalle).toContain('meta 2.419,35');
  });

  it('4e. dos meses cerrados en un mismo tramo: la línea suma los dos y el detalle los separa con «; »', () => {
    const meses = [
      { desde: '2026-10-01', hasta: '2026-10-31', hastaMes: '2026-10-31', puntos: 6200 },
      { desde: '2026-11-01', hasta: '2026-11-30', hastaMes: '2026-11-30', puntos: 5400 },
    ];
    const l = linea(liquidarPeriodo(conMeses(tramo('2026-10-31', '2026-11-30'), meses)))!;
    expect(l.monto).toBe(80); // 60 + 20
    expect(l.detalle).toBe('6.200 puntos − meta 5.000 = 1.200 × S/0,05; 5.400 puntos − meta 5.000 = 400 × S/0,05');
  });

  it('4f. pago activo pero la entrada no trae puntosMeses → sin línea y una advertencia', () => {
    const l = liquidarPeriodo(conMeses(MENSUAL, undefined));
    expect(linea(l)).toBeUndefined();
    expect(l.advertencias.some((a) => /puntos/i.test(a))).toBe(true);
  });
  it('5. con incidencias que bajan los puntos por debajo de la meta → S/0, nunca negativo', () => {
    // los puntos del mes ya vienen neto de incidencias (puede ser negativo): jamás resta del sueldo.
    const base = liquidarPeriodo(MENSUAL);
    for (const puntos of [-300, 100]) {
      const l = liquidarPeriodo(con(MENSUAL, puntos, PAGO));
      expect(linea(l)).toBeUndefined();
      expect(l.total).toBe(base.total);
      expect(l.lineas.every((x) => x.concepto !== 'Bono por puntos' || x.monto >= 0)).toBe(true);
    }
  });

  it('6. los puntos y los parámetros mueven el resultado (el cierre compara la entrada guardada)', () => {
    // La comparación del cierre es del PR #44; acá se fija lo que le hace falta al motor: que los
    // dos insumos nuevos viajen en la entrada y que cualquiera de ellos cambie el resultado.
    const a = liquidarPeriodo(con(MENSUAL, 6200, PAGO));
    expect(liquidarPeriodo(con(MENSUAL, 6300, PAGO)).total).toBeGreaterThan(a.total);
    expect(liquidarPeriodo(con(MENSUAL, 6200, { ...PAGO, solesPorPunto: 0.1 })).total).toBeGreaterThan(a.total);
    expect(liquidarPeriodo(con(MENSUAL, 6200, { ...PAGO, puntosMetaMensual: 6000 })).total).toBeLessThan(a.total);
  });

  it('el redondeo es sobre el producto (§8.2, D-12): 2.000 puntos, meta 1.129,03…, S/3 → S/2.612,90', () => {
    // Un mes del contrato cortado a 7 de 31 días: meta = 5.000 × 7 / 31 = 1.129,0322…
    const mes = { desde: '2026-10-01', hasta: '2026-10-07', hastaMes: '2026-10-31', puntos: 2000 };
    const l = linea(liquidarPeriodo(conMeses(tramo('2026-10-01', '2026-10-07'), [mes], { puntosMetaMensual: 5000, solesPorPunto: 3 })))!;
    expect(l.monto).toBe(2612.9);
  });
  it('un 0 es un valor, no «vacío»: meta 0 paga todos los puntos', () => {
    expect(linea(liquidarPeriodo(con(MENSUAL, 100, { puntosMetaMensual: 0, solesPorPunto: 0.05 })))?.monto).toBe(5);
  });

  it('validaciones: negativos y no numéricos se rechazan; null equivale a no configurado', () => {
    expect(() => resolverParametros({ puntosMetaMensual: -1 } as Params)).toThrow(/puntosMetaMensual/);
    expect(() => resolverParametros({ solesPorPunto: -0.05 } as Params)).toThrow(/solesPorPunto/);
    expect(() => resolverParametros({ solesPorPunto: NaN } as Params)).toThrow(/solesPorPunto/);
    expect(() => liquidarPeriodo(con(MENSUAL, NaN, PAGO))).toThrow(/puntos/i);
    expect(() => resolverParametros({ puntosMetaMensual: null, solesPorPunto: null } as Params)).not.toThrow();
  });
});
