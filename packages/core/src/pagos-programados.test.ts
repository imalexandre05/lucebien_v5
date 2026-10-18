import { describe, it, expect } from 'vitest';
import * as S from './sueldos';
import type { ContratoPago, CambioFrecuencia, TurnoContratado } from './sueldos';

// Pagos programados desde el contrato (decisión del dueño n.º 6, 18-oct-2026).
// Spec: docs/superpowers/specs/sueldos/2026-10-18-pagos-programados-cierre-un-paso-design.md §3 y §7.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

type Liq = { id: string; desde: string; hasta: string; estado: 'borrador' | 'cerrada' | 'anulada'; total: number; pagado: number };
type Pago = { desde: string; hasta: string; corto: boolean; estado: 'por_cerrar' | 'cerrado' | 'pagado'; parcial: boolean; pendientes: { desde: string; hasta: string }[]; liquidaciones: { id: string; total: number; pagado: number }[]; referencia: number | null };
const api = S as unknown as {
  pagosProgramados: (c: ContratoPago, cs: CambioFrecuencia[], l: Liq[], h?: TurnoContratado[]) => Pago[];
  pagoQueContiene: <T extends { desde: string; hasta: string }>(p: T[], f: string) => T | null;
};

const MENSUAL: ContratoPago = { fechaInicio: '2026-08-05', fechaFin: '2026-10-30', modalidad: 'mensual', cadaDias: null, sueldoPactado: 600 };
const liq = (id: string, desde: string, hasta: string, estado: Liq['estado'], total: number, pagado: number): Liq => ({ id, desde, hasta, estado, total, pagado });

describe('pagosProgramados — spec §3', () => {
  it('1. mensual del 05-ago al 30-oct: tres pagos, el último corto', () => {
    const p = api.pagosProgramados(MENSUAL, [], []);
    expect(p.map((x) => [x.desde, x.hasta])).toEqual([
      ['2026-08-05', '2026-09-04'],
      ['2026-09-05', '2026-10-04'],
      ['2026-10-05', '2026-10-30'],
    ]);
    expect(p.map((x) => x.corto)).toEqual([false, false, true]);
    expect(p.every((x) => x.estado === 'por_cerrar' && !x.parcial)).toBe(true);
  });

  it('2. estados: cerrado con saldo, pagado, y anuladas o borradores no cuentan', () => {
    const p = api.pagosProgramados(MENSUAL, [], [
      liq('a', '2026-08-05', '2026-09-04', 'cerrada', 600, 600),
      liq('b', '2026-09-05', '2026-10-04', 'cerrada', 600, 200),
      liq('c', '2026-10-05', '2026-10-30', 'anulada', 500, 0),
      liq('d', '2026-10-05', '2026-10-30', 'borrador', 500, 0),
    ]);
    expect(p.map((x) => x.estado)).toEqual(['pagado', 'cerrado', 'por_cerrar']);
    expect(p[1].liquidaciones).toEqual([{ id: 'b', total: 600, pagado: 200 }]);
    expect(p[2].liquidaciones).toEqual([]);
  });

  it('2b. dos cerradas que cubren el pago lo cierran; una que cubre la mitad lo deja por cerrar parcial', () => {
    const p = api.pagosProgramados(MENSUAL, [], [
      liq('a1', '2026-08-05', '2026-08-20', 'cerrada', 300, 300),
      liq('a2', '2026-08-21', '2026-09-04', 'cerrada', 300, 300),
      liq('b1', '2026-09-05', '2026-09-20', 'cerrada', 300, 0),
    ]);
    expect(p[0].estado).toBe('pagado');
    expect(p[0].liquidaciones.map((l) => l.id)).toEqual(['a1', 'a2']);
    expect(p[1].estado).toBe('por_cerrar');
    expect(p[1].parcial).toBe(true);
    // Ajuste del verificador (spec §9.5): lo que falta cerrar del pago parcial.
    expect(p[1].pendientes).toEqual([{ desde: '2026-09-21', hasta: '2026-10-04' }]);
    expect(p[0].pendientes).toEqual([]);
    expect(p[2].pendientes).toEqual([{ desde: '2026-10-05', hasta: '2026-10-30' }]);
  });

  it('pendientes con un hueco en el medio: dos sub-rangos', () => {
    const p = api.pagosProgramados(MENSUAL, [], [liq('m', '2026-08-10', '2026-08-20', 'cerrada', 100, 100)]);
    expect(p[0].pendientes).toEqual([
      { desde: '2026-08-05', hasta: '2026-08-09' },
      { desde: '2026-08-21', hasta: '2026-09-04' },
    ]);
  });

  it('3. quincenal, semanal y cada N días: los mismos cortes que calendarioDePagos', () => {
    for (const f of [
      { modalidad: 'quincenal' as const, cadaDias: null },
      { modalidad: 'semanal' as const, cadaDias: null },
      { modalidad: 'dias' as const, cadaDias: 10 },
    ]) {
      const c = { ...MENSUAL, ...f };
      const esperados = S.calendarioDePagos(c, []).map((x) => [x.desde, x.hasta]);
      expect(api.pagosProgramados(c, [], []).map((x) => [x.desde, x.hasta])).toEqual(esperados);
    }
  });

  it('referencia por pago en un contrato por horas; null en sueldo fijo', () => {
    const horario: TurnoContratado[] = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, horaInicio: '08:00', horaFin: '13:00' }));
    const porHoras = { ...MENSUAL, sueldoPactado: 0, tarifaHora: 5 };
    const p = api.pagosProgramados(porHoras, [], [], horario);
    // Misma cuenta que referenciaPorHoras sobre las fechas del pago.
    expect(p[0].referencia).toBe(S.referenciaPorHoras(horario, '2026-08-05', '2026-09-04', 5));
    expect(api.pagosProgramados(MENSUAL, [], [], horario)[0].referencia).toBeNull();
  });

  it('4. pagoQueContiene: el pago de hoy, null fuera del contrato', () => {
    const p = api.pagosProgramados(MENSUAL, [], []);
    expect(api.pagoQueContiene(p, '2026-09-10')?.desde).toBe('2026-09-05');
    expect(api.pagoQueContiene(p, '2026-10-30')?.desde).toBe('2026-10-05');
    expect(api.pagoQueContiene(p, '2026-11-01')).toBeNull();
  });
});
