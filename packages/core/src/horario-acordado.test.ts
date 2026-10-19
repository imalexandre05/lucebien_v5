import { describe, it, expect } from 'vitest';
import * as C from './index';
import { liquidarPeriodo, type EntradaLiquidacion, type TurnoContratado } from './sueldos';

// Horario acordado ese día (decisión del dueño n.º 1, 19-oct-2026).
// Spec: docs/superpowers/specs/asistencias/2026-10-19-horario-acordado-design.md §3 y §6.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

// ── Motor del sueldo ────────────────────────────────────────────────────────────────────────
// Lunes a miércoles 09:00-13:00 + 13:00-20:00. 2025-06-16 es lunes.
const HORARIO: TurnoContratado[] = [1, 2, 3].flatMap((diaSemana) => [
  { diaSemana, turno: 1, horaInicio: '09:00', horaFin: '13:00' },
  { diaSemana, turno: 2, horaInicio: '13:00', horaFin: '20:00' },
]);
const dia = (fecha: string, horaIngreso: string, extra: Record<string, unknown> = {}) => ({
  fecha,
  horaIngreso,
  horaSalida: '20:00',
  ...extra,
});
// La semana tiene 3 días contratados (lun 16, mar 17, mié 18): los que la prueba no toca llegan puntuales.
const liquidar = (cambios: ReturnType<typeof dia>[], extra: Partial<EntradaLiquidacion> = {}) => {
  const asistencia = ['2025-06-16', '2025-06-17', '2025-06-18'].map(
    (f) => cambios.find((c) => c.fecha === f) ?? dia(f, '09:00'),
  );
  return liquidarPeriodo({
    fechaInicio: '2025-06-16',
    fechaFin: '2025-06-22',
    sueldoPactado: 600,
    horario: HORARIO,
    asistencia,
    horasFueraDeContrato: [],
    ventas: [],
    adelantos: [],
    reportes: [],
    bonosExtras: [],
    almuerzosEntregados: 0,
    almuerzoHabilitadoPorAdmin: false,
    personasCapacitadas: 0,
    ...extra,
  } as EntradaLiquidacion);
};

describe('horario acordado — motor del sueldo (spec §3)', () => {
  it('contratado 09:00, acordado 10:00, llegó 09:55 → no es tardanza', () => {
    expect(liquidar([dia('2025-06-16', '09:55')]).asistencia.tardanzas).toBe(1); // sin acuerdo: sí
    expect(liquidar([dia('2025-06-16', '09:55', { inicioAcordado: '10:00' })]).asistencia.tardanzas).toBe(0);
  });

  it('con horario acordado, llegar pasada la tolerancia sigue siendo tardanza', () => {
    // Tolerancia por defecto 10 min: 10:20 contra 10:00 → tarde.
    expect(liquidar([dia('2025-06-16', '10:20', { inicioAcordado: '10:00' })]).asistencia.tardanzas).toBe(1);
  });

  it('acordado más temprano que el contratado: llegar a la hora contratada es tardanza', () => {
    expect(liquidar([dia('2025-06-17', '09:00')]).asistencia.tardanzas).toBe(0);
    expect(liquidar([dia('2025-06-17', '09:00', { inicioAcordado: '08:00' })]).asistencia.tardanzas).toBe(1);
  });

  it('sin horario acordado todo queda igual (null = ausente)', () => {
    const a = liquidar([dia('2025-06-16', '09:30')]);
    const b = liquidar([dia('2025-06-16', '09:30', { inicioAcordado: null })]);
    expect(b.asistencia.tardanzas).toBe(a.asistencia.tardanzas);
    expect(b.total).toBe(a.total);
  });

  it('un horario acordado mal escrito se rechaza con un mensaje claro', () => {
    expect(() => liquidar([dia('2025-06-16', '09:00', { inicioAcordado: '25:99' })])).toThrow(/Asistencia 2025-06-16/);
  });

  it('el pasaje se mide contra el horario acordado cuando existe (respuesta del dueño, 19-oct-2026)', () => {
    const conPasaje = (cambios: ReturnType<typeof dia>[]) =>
      liquidar(cambios, { parametros: { montoPasaje: 2, minutosAntesPasaje: 5 } });
    const pasaje = (l: ReturnType<typeof liquidar>) => l.lineas.find((x) => x.regla === 'RN-22')?.monto ?? 0;
    // Contratado 09:00. Los otros dos días llegan 09:00: no ganan pasaje (hay que llegar 08:55 o antes).
    expect(pasaje(conPasaje([dia('2025-06-16', '09:50')]))).toBe(0);
    // Acordado 10:00 y llegó 09:50: 10 min antes del acordado → gana el pasaje de ese día.
    expect(pasaje(conPasaje([dia('2025-06-16', '09:50', { inicioAcordado: '10:00' })]))).toBe(2);
    // Acordado más temprano (08:00): llegar 08:00 no gana; 07:50 sí.
    expect(pasaje(conPasaje([dia('2025-06-17', '08:00', { inicioAcordado: '08:00' })]))).toBe(0);
    expect(pasaje(conPasaje([dia('2025-06-17', '07:50', { inicioAcordado: '08:00' })]))).toBe(2);
  });

  it('no cambia las horas trabajadas ni el pago por horas', () => {
    const a = liquidar([dia('2025-06-16', '09:55')]);
    const b = liquidar([dia('2025-06-16', '09:55', { inicioAcordado: '10:00' })]);
    expect(b.asistencia.horasTrabajadas).toBe(a.asistencia.horasTrabajadas);
    expect(b.asistencia.diferenciaHoras).toBe(a.asistencia.diferenciaHoras);
  });
});

// ── Lista «Por revisar» ─────────────────────────────────────────────────────────────────────
type Fila = {
  fecha: string;
  condicion: 'sin_dato' | 'trabajado' | 'falta';
  horaEntrada: string | null;
  horaSalida: string | null;
  inicioAcordado?: string | null;
};
type Dia = { fecha: string; tipo: string; minutosTarde?: number };
const diasPorRevisar = (C as unknown as {
  diasPorRevisar: (p: { desde: string; hasta: string; hoy: string; horario: TurnoContratado[]; filas: Fila[]; toleranciaMinutos: number }) => Dia[];
}).diasPorRevisar;
const HORARIO_REV: TurnoContratado[] = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, horaInicio: '08:00', horaFin: '14:00' }));
const revisar = (filas: Fila[]) =>
  diasPorRevisar({ desde: '2026-10-05', hasta: '2026-10-05', hoy: '2026-10-18', horario: HORARIO_REV, filas, toleranciaMinutos: 10 });
const fila = (ent: string, extra: Partial<Fila> = {}): Fila => ({ fecha: '2026-10-05', condicion: 'trabajado', horaEntrada: ent, horaSalida: '15:00', ...extra });

describe('horario acordado — «Por revisar» (spec §3)', () => {
  it('contratado 08:00, acordado 09:00, llegó 08:55 → no aparece', () => {
    expect(revisar([fila('08:55')])).toEqual([{ fecha: '2026-10-05', tipo: 'tardanza', minutosTarde: 55 }]);
    expect(revisar([fila('08:55', { inicioAcordado: '09:00' })])).toEqual([]);
  });

  it('llegó 09:20 con acordado 09:00 → tardanza de 20 min (no 80)', () => {
    expect(revisar([fila('09:20', { inicioAcordado: '09:00' })])).toEqual([{ fecha: '2026-10-05', tipo: 'tardanza', minutosTarde: 20 }]);
  });

  it('acordado más temprano: llegar a las 08:00 con acordado 07:00 → tardanza de 60', () => {
    expect(revisar([fila('08:00', { inicioAcordado: '07:00' })])).toEqual([{ fecha: '2026-10-05', tipo: 'tardanza', minutosTarde: 60 }]);
  });

  it('si un tramo del día trae la hora acordada, vale para todo el día', () => {
    const f = [fila('08:55', { inicioAcordado: '09:00' }), { ...fila('08:55'), horaEntrada: null, horaSalida: null, condicion: 'trabajado' as const }];
    expect(revisar(f)).toEqual([]);
  });
});

