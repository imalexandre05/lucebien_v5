import { describe, it, expect } from 'vitest';
import * as S from './sueldos';
import { liquidarPeriodo, diasDelPeriodo, diaSemanaISO, type EntradaLiquidacion, type TurnoContratado } from './sueldos';
import { resumenLiquidacion } from './resumen-liquidacion';

// Sueldo por horas reales y una sola idea de horas.
// Spec: docs/superpowers/specs/sueldos/2026-10-18-sueldo-por-horas-design.md §7.
// Decisiones del dueño n.º 1 y n.º 2 (18-oct-2026).
//
// Escritos ANTES del código (Zone Guard, no-negociable 6). Los tipos nuevos se arman con un tipo
// ampliado para que el archivo se lea sin depender de que `EntradaLiquidacion` ya los tenga.

type Contrato = {
  fechaInicio: string;
  fechaFin: string;
  modalidad: 'mensual' | 'quincenal' | 'semanal' | 'dias';
  cadaDias: number | null;
  sueldoPactado: number;
  tarifaHora?: number | null;
};
type Cambio = { desde: string; modalidad: Contrato['modalidad']; cadaDias: number | null; sueldoPactado: number; tarifaHora?: number | null };
type Entrada = EntradaLiquidacion & { contratoPago?: Contrato; cambiosFrecuencia?: Cambio[] };
type DiaDetalle = { fecha: string; horario: number; trabajadas: number; dentro: number; extra: number; faltaron: number; tarifa: number };
type Resultado = ReturnType<typeof liquidarPeriodo> & {
  modo?: 'horas' | 'fijo';
  base: { tarifaHora?: number; referencia?: number };
  asistencia: { horasDentro?: number; horasExtra?: number; horasFaltaron?: number };
  dias?: DiaDetalle[];
};

// Lunes a sábado 08:00–13:00: 5 h por día, 30 h por semana. Domingo sin horario.
const HORARIO: TurnoContratado[] = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, turno: 1, horaInicio: '08:00', horaFin: '13:00' }));
const CONTRATO: Contrato = {
  fechaInicio: '2026-10-01',
  fechaFin: '2026-12-31',
  modalidad: 'mensual',
  cadaDias: null,
  sueldoPactado: 0,
  tarifaHora: 5,
};

const conHorario = (desde: string, hasta: string) => diasDelPeriodo(desde, hasta).filter((f) => diaSemanaISO(f) !== 7);
const cumple = (desde: string, hasta: string) =>
  conHorario(desde, hasta).map((fecha) => ({ fecha, horaIngreso: '08:00', horaSalida: '13:00' }));

const porHoras = (desde: string, hasta: string, extra: Partial<Entrada> = {}): Entrada => ({
  fechaInicio: desde,
  fechaFin: hasta,
  sueldoPactado: 0,
  horario: HORARIO,
  asistencia: cumple(desde, hasta),
  contratoPago: CONTRATO,
  cambiosFrecuencia: [],
  ...extra,
});
const liq = (e: Entrada): Resultado => liquidarPeriodo(e as EntradaLiquidacion) as Resultado;
const linea = (r: Resultado, concepto: string) => r.lineas.find((l) => l.concepto === concepto);
const conDia = (desde: string, hasta: string, fecha: string, ingreso: string | null, salida: string | null) =>
  cumple(desde, hasta).map((r) => (r.fecha === fecha ? { fecha, horaIngreso: ingreso, horaSalida: salida } : r));

describe('sueldo por horas — spec §7', () => {
  it('1. cumple todo su horario: paga horas × tarifa y el total es la referencia', () => {
    // Octubre 2026: 27 días con horario (4 domingos) × 5 h = 135 h × S/5 = S/675.
    const r = liq(porHoras('2026-10-01', '2026-10-31'));
    expect(r.modo).toBe('horas');
    expect(linea(r, 'Horas trabajadas')?.monto).toBe(675);
    expect(linea(r, 'Horas extra')?.monto).toBe(0);
    expect(linea(r, 'Horas que faltaron')).toBeUndefined();
    expect(linea(r, 'Sueldo')).toBeUndefined();
    expect(linea(r, 'Diferencia de horas')).toBeUndefined();
    expect(linea(r, 'Horas fuera de contrato')).toBeUndefined();
    expect(r.base.tarifaHora).toBe(5);
    expect(r.base.referencia).toBe(675);
    expect(r.base.valorPorHora).toBe(5);
    expect(r.asistencia.horasDentro).toBe(135);
    expect(r.total).toBe(675);
  });

  it('2. liquidar del 06 al 17 paga sólo las horas de esos días (sin cuota ni prorrateo)', () => {
    // 12 días, un domingo (11): 11 × 5 h = 55 h × S/5 = S/275.
    const r = liq(porHoras('2026-10-06', '2026-10-17'));
    expect(linea(r, 'Horas trabajadas')?.monto).toBe(275);
    expect(r.base.referencia).toBe(275);
    expect(r.total).toBe(275);
  });

  it('3. un día con 2 h más que su horario: 2 h extra × tarifa × factor', () => {
    const asistencia = conDia('2026-10-06', '2026-10-17', '2026-10-06', '08:00', '15:00');
    const r = liq(porHoras('2026-10-06', '2026-10-17', { asistencia, parametros: { factorHoraFueraContrato: 1.5 } }));
    expect(linea(r, 'Horas trabajadas')?.monto).toBe(275);
    expect(linea(r, 'Horas extra')?.monto).toBe(15); // 2 × 5 × 1,5
    expect(r.asistencia.horasExtra).toBe(2);
    const d = r.dias?.find((x) => x.fecha === '2026-10-06');
    expect(d).toEqual({ fecha: '2026-10-06', horario: 5, trabajadas: 7, dentro: 5, extra: 2, faltaron: 0, tarifa: 5 });
    expect(r.total).toBe(290);
  });

  it('4. un día sin horario (domingo) trabajado 4 h: todo es extra', () => {
    const r = liq(
      porHoras('2026-10-06', '2026-10-17', {
        horasFueraDeContrato: [{ fecha: '2026-10-11', horaIngreso: '09:00', horaSalida: '13:00' }],
      }),
    );
    expect(linea(r, 'Horas extra')?.monto).toBe(20);
    expect(r.dias?.find((x) => x.fecha === '2026-10-11')).toEqual({
      fecha: '2026-10-11',
      horario: 0,
      trabajadas: 4,
      dentro: 0,
      extra: 4,
      faltaron: 0,
      tarifa: 5,
    });
  });

  it('5. un día con 1 h menos: «Horas que faltaron» se informa y no se paga, sin castigo', () => {
    const asistencia = conDia('2026-10-06', '2026-10-17', '2026-10-07', '08:00', '12:00');
    const r = liq(porHoras('2026-10-06', '2026-10-17', { asistencia }));
    expect(linea(r, 'Horas trabajadas')?.monto).toBe(270); // 54 h
    const f = linea(r, 'Horas que faltaron');
    expect(f?.monto).toBe(0);
    expect(f?.grupo).toBe('ajuste');
    expect(f?.detalle).toContain('1 h');
    expect(r.asistencia.horasFaltaron).toBe(1);
    expect(linea(r, 'Faltas injustificadas')?.monto).toBe(0);
    expect(r.total).toBe(270);
  });

  it('6. falta injustificada: el día no se paga y además un día de castigo a la tarifa', () => {
    const asistencia = conDia('2026-10-06', '2026-10-17', '2026-10-08', null, null);
    const r = liq(porHoras('2026-10-06', '2026-10-17', { asistencia }));
    expect(linea(r, 'Horas trabajadas')?.monto).toBe(250); // 50 h
    expect(r.asistencia.horasFaltaron).toBe(5);
    expect(linea(r, 'Faltas injustificadas')?.monto).toBe(-25); // 5 h × S/5 × 1 día de castigo
    expect(r.total).toBe(225);
  });

  it('7. cambio de tarifa a mitad del rango: cada día con su tarifa', () => {
    const cambios: Cambio[] = [{ desde: '2026-10-10', modalidad: 'mensual', cadaDias: null, sueldoPactado: 0, tarifaHora: 6 }];
    const r = liq(porHoras('2026-10-06', '2026-10-17', { cambiosFrecuencia: cambios }));
    // 6–9 (4 días) a S/5 = 100; 10 y 12–17 (7 días) a S/6 = 210.
    expect(linea(r, 'Horas trabajadas')?.monto).toBe(310);
    expect(r.base.referencia).toBe(310);
    const tarifaDelDia = (S as unknown as { tarifaDelDia: (c: Contrato, cs: Cambio[], f: string) => number }).tarifaDelDia;
    expect(tarifaDelDia(CONTRATO, cambios, '2026-10-09')).toBe(5);
    expect(tarifaDelDia(CONTRATO, cambios, '2026-10-10')).toBe(6);
    // Un cambio sólo de frecuencia (sin tarifa) conserva la tarifa anterior.
    const soloFrecuencia: Cambio[] = [...cambios, { desde: '2026-11-01', modalidad: 'quincenal', cadaDias: null, sueldoPactado: 0, tarifaHora: null }];
    expect(tarifaDelDia(CONTRATO, soloFrecuencia, '2026-11-05')).toBe(6);
  });

  it('8. tardanzas, comisión y bono semanal: iguales que con el sueldo fijo', () => {
    const tarde = cumple('2026-10-05', '2026-10-31').map((r, i) => (i < 4 ? { ...r, horaIngreso: '08:20' } : r));
    const ventas = [
      { fecha: '2026-10-06', monto: 2500 },
      { fecha: '2026-10-07', monto: 100 },
    ];
    const horas = liq(porHoras('2026-10-05', '2026-10-31', { asistencia: tarde, ventas }));
    const fijo = liq({ ...porHoras('2026-10-05', '2026-10-31', { asistencia: tarde, ventas }), contratoPago: undefined, sueldoPactado: 600 });
    for (const c of ['Descuento por tardanzas', 'Bono por metas semanales', 'Almuerzos', 'Adelantos']) {
      expect(linea(horas, c)).toEqual(linea(fijo, c));
    }
    expect(linea(horas, 'Comisión 2%')?.monto).toBe(linea(fijo, 'Comisión 2%')?.monto);
    expect(linea(horas, 'Descuento por tardanzas')?.monto).toBe(-5);
  });

  it('9. regresión: un contrato sin tarifa se liquida exactamente igual que hoy', () => {
    const base = porHoras('2026-10-01', '2026-10-31', { sueldoPactado: 650 });
    const sinContrato = liq({ ...base, contratoPago: undefined, cambiosFrecuencia: undefined });
    const sinTarifa = liq({ ...base, contratoPago: { ...CONTRATO, tarifaHora: null, sueldoPactado: 650 } });
    expect(sinTarifa).toEqual(sinContrato);
    expect(sinTarifa.modo).toBeUndefined();
    expect(linea(sinTarifa, 'Sueldo')?.monto).toBe(650);
    expect(linea(sinTarifa, 'Diferencia de horas')).toBeDefined();
    expect(linea(sinTarifa, 'Horas trabajadas')).toBeUndefined();
  });

  it('un rango sin ningún día con horario se puede liquidar por horas (paga sus extras)', () => {
    const r = liq(
      porHoras('2026-10-11', '2026-10-11', {
        asistencia: [],
        horasFueraDeContrato: [{ fecha: '2026-10-11', horaIngreso: '09:00', horaSalida: '13:00' }],
      }),
    );
    expect(linea(r, 'Horas extra')?.monto).toBe(20);
    expect(r.total).toBe(20);
  });

  it('referenciaPorHoras: horas del horario en el período × tarifa', () => {
    const ref = (S as unknown as { referenciaPorHoras: (h: TurnoContratado[], d: string, a: string, t: number) => number })
      .referenciaPorHoras;
    expect(ref(HORARIO, '2026-10-01', '2026-10-31', 5)).toBe(675);
    expect(ref(HORARIO, '2026-10-11', '2026-10-11', 5)).toBe(0);
  });

  it('MOTOR_VERSION sube por el cambio de regla', () => {
    expect(S.MOTOR_VERSION >= '2026-10-18').toBe(true);
  });
});

describe('resumenLiquidacion con las líneas por horas — spec §5', () => {
  it('10. «Horas trabajadas» suma al sueldo y «Horas extra» a horas extras', () => {
    const r = resumenLiquidacion({
      lineas: [
        { grupo: 'ingreso', concepto: 'Horas trabajadas', monto: 600 },
        { grupo: 'ingreso', concepto: 'Horas extra', monto: 30 },
        { grupo: 'ajuste', concepto: 'Horas que faltaron', monto: 0 },
        { grupo: 'descuento', concepto: 'Adelantos', monto: -100 },
      ],
      ventas: { total: 0, metaPeriodo: 0 },
      total: 530,
      abonos: 0,
    });
    expect(r.sueldo).toBe(600);
    expect(r.horasExtras).toBe(30);
    expect(r.adelantos).toBe(100);
  });
});
