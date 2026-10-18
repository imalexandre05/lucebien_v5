import { describe, it, expect } from 'vitest';
import * as C from './index';
import type { TurnoContratado } from './sueldos';

// Asistencia «Por revisar» (decisión del dueño n.º 4, 18-oct-2026).
// Spec: docs/superpowers/specs/sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md §4 y §7.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

type Fila = {
  fecha: string;
  condicion: 'sin_dato' | 'trabajado' | 'falta';
  horaEntrada: string | null;
  horaSalida: string | null;
  tardanzaJustificada?: boolean;
  faltaJustificada?: boolean;
  entradaEstimada?: boolean;
  salidaEstimada?: boolean;
  revisadaEn?: string | null;
};
type Dia = { fecha: string; tipo: string; minutosTarde?: number; falta?: 'entrada' | 'salida'; turno?: string };
const diasPorRevisar = (C as unknown as {
  diasPorRevisar: (p: { desde: string; hasta: string; hoy: string; horario: TurnoContratado[]; filas: Fila[]; toleranciaMinutos: number }) => Dia[];
}).diasPorRevisar;

// Lunes a sábado 08:00–13:00. 2026-10-05 es lunes; 2026-10-11 domingo.
const HORARIO: TurnoContratado[] = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, horaInicio: '08:00', horaFin: '13:00' }));
const ok = (fecha: string, ent = '08:00', sal = '13:00'): Fila => ({ fecha, condicion: 'trabajado', horaEntrada: ent, horaSalida: sal });
const base = (filas: Fila[], extra: Partial<{ desde: string; hasta: string; hoy: string }> = {}) =>
  diasPorRevisar({ desde: '2026-10-05', hasta: '2026-10-07', hoy: '2026-10-18', horario: HORARIO, filas, toleranciaMinutos: 10, ...extra });

describe('diasPorRevisar — spec §4', () => {
  it('días completos sin tardanza no aparecen', () => {
    expect(base([ok('2026-10-05'), ok('2026-10-06'), ok('2026-10-07')])).toEqual([]);
  });

  it('día con horario sin filas → sin_marca; una marca → una_marca con el lado que falta', () => {
    const r = base([ok('2026-10-05'), { fecha: '2026-10-06', condicion: 'sin_dato', horaEntrada: null, horaSalida: '13:02' }]);
    expect(r).toEqual([
      { fecha: '2026-10-06', tipo: 'una_marca', falta: 'entrada' },
      { fecha: '2026-10-07', tipo: 'sin_marca' },
    ]);
  });

  it('una fila sin_dato sin horas cuenta como sin marca', () => {
    const r = base([ok('2026-10-05'), ok('2026-10-06'), { fecha: '2026-10-07', condicion: 'sin_dato', horaEntrada: null, horaSalida: null }]);
    expect(r).toEqual([{ fecha: '2026-10-07', tipo: 'sin_marca' }]);
  });

  it('tardanza de 15 min con tolerancia 10 → tardanza; justificada no aparece; 10 min justos no es tardanza', () => {
    expect(base([ok('2026-10-05', '08:15'), ok('2026-10-06', '08:10'), { ...ok('2026-10-07', '08:30'), tardanzaJustificada: true }])).toEqual([
      { fecha: '2026-10-05', tipo: 'tardanza', minutosTarde: 15 },
    ]);
  });

  it('falta → falta; justificada no aparece', () => {
    const f = (fecha: string, just = false): Fila => ({ fecha, condicion: 'falta', horaEntrada: null, horaSalida: null, faltaJustificada: just });
    expect(base([f('2026-10-05'), f('2026-10-06', true), ok('2026-10-07')])).toEqual([{ fecha: '2026-10-05', tipo: 'falta' }]);
  });

  it('hora puesta por el sistema → hora_estimada', () => {
    expect(base([ok('2026-10-05'), ok('2026-10-06'), { ...ok('2026-10-07'), salidaEstimada: true }])).toEqual([
      { fecha: '2026-10-07', tipo: 'hora_estimada' },
    ]);
  });

  it('revisado: oculta tardanza, falta y hora estimada; nunca oculta sin_marca ni una_marca', () => {
    const r = base([
      { ...ok('2026-10-05', '08:30'), revisadaEn: '2026-10-08T10:00:00Z' },
      { fecha: '2026-10-06', condicion: 'sin_dato', horaEntrada: '08:00', horaSalida: null, revisadaEn: '2026-10-08T10:00:00Z' },
    ]);
    expect(r).toEqual([
      { fecha: '2026-10-06', tipo: 'una_marca', falta: 'salida' },
      { fecha: '2026-10-07', tipo: 'sin_marca' },
    ]);
  });

  it('días futuros no aparecen; un domingo sin filas tampoco', () => {
    expect(base([ok('2026-10-05')], { hasta: '2026-10-11', hoy: '2026-10-05' })).toEqual([]);
    const semana = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((f) => ok(f));
    expect(base(semana, { hasta: '2026-10-11' })).toEqual([]);
  });

  it('un domingo trabajado con una sola marca sí aparece (pendiente de resolver)', () => {
    const semana = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((f) => ok(f));
    const r = base([...semana, { fecha: '2026-10-11', condicion: 'sin_dato', horaEntrada: '09:00', horaSalida: null }], { hasta: '2026-10-11' });
    expect(r).toEqual([{ fecha: '2026-10-11', tipo: 'una_marca', falta: 'salida' }]);
  });

  // ── Ajustes del verificador (spec §9) ───────────────────────────────────────────────────
  it('9.1 una fila sin_dato con las dos horas → revisar, aunque esté revisada', () => {
    const r = base([
      ok('2026-10-05'),
      { fecha: '2026-10-06', condicion: 'sin_dato', horaEntrada: '08:00', horaSalida: '10:00', revisadaEn: '2026-10-08T10:00:00Z' },
      { fecha: '2026-10-06', condicion: 'sin_dato', horaEntrada: '11:00', horaSalida: '12:00' },
      ok('2026-10-07'),
    ]);
    expect(r).toEqual([{ fecha: '2026-10-06', tipo: 'revisar' }]);
  });

  it('9.2 se oculta sólo si TODAS las filas del día están revisadas', () => {
    const tarde = (rev: string | null): Fila => ({ ...ok('2026-10-05', '08:30', '10:00'), revisadaEn: rev });
    const segunda: Fila = { fecha: '2026-10-05', condicion: 'trabajado', horaEntrada: '10:30', horaSalida: '13:00' };
    const uno = base([tarde('2026-10-08T10:00:00Z'), segunda, ok('2026-10-06'), ok('2026-10-07')]);
    expect(uno).toEqual([{ fecha: '2026-10-05', tipo: 'tardanza', minutosTarde: 30 }]);
    const todos = base([tarde('2026-10-08T10:00:00Z'), { ...segunda, revisadaEn: '2026-10-08T10:00:00Z' }, ok('2026-10-06'), ok('2026-10-07')]);
    expect(todos).toEqual([]);
  });

  const DOS_TURNOS: TurnoContratado[] = [1, 2, 3, 4, 5, 6].flatMap((diaSemana) => [
    { diaSemana, horaInicio: '08:00', horaFin: '13:00' },
    { diaSemana, horaInicio: '15:00', horaFin: '19:00' },
  ]);
  const dos = (filas: Fila[]) =>
    diasPorRevisar({ desde: '2026-10-05', hasta: '2026-10-05', hoy: '2026-10-18', horario: DOS_TURNOS, filas, toleranciaMinutos: 10 });

  it('9.3 un turno sin ninguna marca → turno_sin_marcas', () => {
    expect(dos([ok('2026-10-05', '08:00', '13:00')])).toEqual([{ fecha: '2026-10-05', tipo: 'turno_sin_marcas', turno: '15:00' }]);
  });

  it('9.4 marcó de corrido entre los dos turnos → pausa_trabajada', () => {
    expect(dos([ok('2026-10-05', '08:00', '19:00')])).toEqual([{ fecha: '2026-10-05', tipo: 'pausa_trabajada' }]);
    expect(dos([ok('2026-10-05', '08:00', '13:00'), ok('2026-10-05', '15:00', '19:00')])).toEqual([]);
  });

  it('9.5 hoy no entra: una entrada sin salida de hoy no aparece', () => {
    const r = diasPorRevisar({
      desde: '2026-10-05', hasta: '2026-10-06', hoy: '2026-10-06', horario: HORARIO, toleranciaMinutos: 10,
      filas: [ok('2026-10-05'), { fecha: '2026-10-06', condicion: 'sin_dato', horaEntrada: '08:00', horaSalida: null }],
    });
    expect(r).toEqual([]);
  });
});
