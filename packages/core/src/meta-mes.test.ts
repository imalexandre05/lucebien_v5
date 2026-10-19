import { describe, it, expect } from 'vitest';
import { liquidarPeriodo, type EntradaLiquidacion, type TurnoContratado } from './sueldos';

// «¿Cumplió la meta del mes?» y la 1.ª comisión (decisión del dueño n.º 2, 19-oct-2026).
// Spec: docs/superpowers/specs/sueldos/2026-10-19-meta-del-mes-primera-comision-design.md §3 y §5.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

const HORARIO: TurnoContratado[] = [1, 2, 3].flatMap((diaSemana) => [
  { diaSemana, turno: 1, horaInicio: '09:00', horaFin: '13:00' },
  { diaSemana, turno: 2, horaInicio: '13:00', horaFin: '20:00' },
]);
const asistencia = ['2025-06-16', '2025-06-17', '2025-06-18'].map((fecha) => ({ fecha, horaIngreso: '09:00', horaSalida: '20:00' }));
const liquidar = (ventasMonto: number, extra: Partial<EntradaLiquidacion> = {}) =>
  liquidarPeriodo({
    fechaInicio: '2025-06-16',
    fechaFin: '2025-06-22',
    sueldoPactado: 600,
    horario: HORARIO,
    asistencia,
    horasFueraDeContrato: [],
    ventas: [{ fecha: '2025-06-16', monto: ventasMonto, tipo: 'venta' }],
    adelantos: [],
    reportes: [],
    bonosExtras: [],
    almuerzosEntregados: 0,
    almuerzoHabilitadoPorAdmin: false,
    personasCapacitadas: 0,
    ...extra,
  } as EntradaLiquidacion);
const linea = (l: ReturnType<typeof liquidar>, regla: string) => l.lineas.find((x) => x.regla === regla)?.monto ?? 0;

describe('meta del mes — 1.ª comisión (spec §3)', () => {
  it('casilla marcada → paga el 2% de la base, aunque las ventas no lleguen a la meta', () => {
    expect(linea(liquidar(200), 'RN-13')).toBe(0); // sin la clave: regla anterior, no llega a la meta
    expect(linea(liquidar(200, { metaMesCumplida: true }), 'RN-13')).toBe(4);
  });

  it('casilla sin marcar → comisión 0, aunque las ventas superen la meta', () => {
    expect(linea(liquidar(100000), 'RN-13')).toBe(2000); // sin la clave: regla anterior
    expect(linea(liquidar(100000, { metaMesCumplida: false }), 'RN-13')).toBe(0);
  });

  it('la línea sin casilla explica qué hacer', () => {
    const l = liquidar(100000, { metaMesCumplida: false });
    expect(l.lineas.find((x) => x.regla === 'RN-13')?.detalle).toMatch(/Cumplió la meta del mes/);
  });

  it('la 2.ª comisión (bono por meta semanal) no cambia con la casilla', () => {
    const base = linea(liquidar(100000), 'RN-12');
    expect(base).toBeGreaterThan(0);
    expect(linea(liquidar(100000, { metaMesCumplida: false }), 'RN-12')).toBe(base);
    expect(linea(liquidar(100000, { metaMesCumplida: true }), 'RN-12')).toBe(base);
  });

  it('la base de comisión se sigue informando aunque la casilla esté sin marcar', () => {
    expect(liquidar(500, { metaMesCumplida: false }).ventas.baseComision).toBe(500);
  });
});
