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
// Estos tests se escribieron ANTES del código (Zone Guard, no-negociable 6). Mientras el código no
// existe, el bloque va en `describe.skip`; el commit que escribe el código lo activa sin tocar ni
// una aserción. Las dos claves nuevas se arman con un tipo ampliado para que el archivo compile
// antes y después de que `ParametrosSueldo`/`EntradaLiquidacion` las tengan.

type Entrada = EntradaLiquidacion & { puntosPeriodo?: number };
type Params = Partial<ParametrosSueldo> & { puntosMetaMensual?: number | null; solesPorPunto?: number | null };
const con = (base: Entrada, puntosPeriodo: number | undefined, parametros: Params = {}): EntradaLiquidacion =>
  ({ ...base, puntosPeriodo, parametros: { ...base.parametros, ...parametros } }) as EntradaLiquidacion;

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

describe.skip('pago por puntos (spec §6)', () => {
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

  it('4. tramo semanal → la meta se prorratea por días del mes en que empieza (default)', () => {
    // 7 de 31 días: meta del tramo = 5.000 × 7 / 31 = 1.129,03
    const l = liquidarPeriodo(con(SEMANAL, 2000, PAGO));
    // (2.000 − 1.129,0322…) × 0,05 = 43,548… → 43,55. El prorrateo no se redondea antes de restar.
    expect(linea(l)?.monto).toBe(43.55);
    expect(linea(l)?.detalle).toContain('meta 1.129,03');
    // Justo en la meta prorrateada no se paga nada.
    expect(linea(liquidarPeriodo(con(SEMANAL, 1129.03, PAGO)))).toBeUndefined();
    // Un tramo que cruza de mes toma los días del mes EN QUE EMPIEZA (octubre, 31): 7 días.
    const cruza = tramo('2026-10-26', '2026-11-01');
    expect(linea(liquidarPeriodo(con(cruza, 2000, PAGO)))?.monto).toBe(43.55);
    // Un mes completo de febrero (28 de 28) da la meta entera, sin rama especial.
    const febrero = tramo('2027-02-01', '2027-02-28');
    expect(linea(liquidarPeriodo(con(febrero, 6200, PAGO)))?.monto).toBe(60);
  });

  it('5. con incidencias que bajan los puntos por debajo de la meta → S/0, nunca negativo', () => {
    // puntosPeriodo ya viene neto de incidencias (puede ser negativo): jamás resta del sueldo.
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
