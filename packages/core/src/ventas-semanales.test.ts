import { describe, it, expect } from 'vitest';
import { liquidarPeriodo, diasDelPeriodo, diaSemanaISO, type EntradaLiquidacion, type TurnoContratado } from './sueldos';

// Ventas y metas manuales por semana (decisión del dueño n.º 8, 18-oct-2026).
// Spec: docs/superpowers/specs/sueldos/2026-10-18-ventas-metas-semanales-design.md §5 y §6.
// Escritos ANTES del código (Zone Guard, no-negociable 6).

type Semana = { desde: string; hasta: string; totalBoletasMayores: number; metaCumplida: boolean | null; montoVendido: number | null };
type Entrada = EntradaLiquidacion & { ventasSemanales?: Semana[] };

// Lunes a sábado 08:00–13:00: 30 h/semana → meta sugerida 30 × 1500/33 = 1363,64 por semana.
const HORARIO: TurnoContratado[] = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, horaInicio: '08:00', horaFin: '13:00' }));
// 05 al 18 de octubre de 2026: dos semanas (05–11 y 12–18).
const BASE: Entrada = {
  fechaInicio: '2026-10-05',
  fechaFin: '2026-10-18',
  sueldoPactado: 600,
  horario: HORARIO,
  asistencia: diasDelPeriodo('2026-10-05', '2026-10-18')
    .filter((f) => diaSemanaISO(f) !== 7)
    .map((fecha) => ({ fecha, horaIngreso: '08:00', horaSalida: '13:00' })),
};
const S1 = { desde: '2026-10-05', hasta: '2026-10-11' };
const S2 = { desde: '2026-10-12', hasta: '2026-10-18' };
const liq = (e: Entrada) => liquidarPeriodo(e as EntradaLiquidacion);
const monto = (r: ReturnType<typeof liquidarPeriodo>, c: string) => r.lineas.find((l) => l.concepto === c)?.monto;

describe('ventas y metas por semana — spec §6', () => {
  it('1. dos semanas cargadas: 2.ª = S/30 por la cumplida; 1.ª = 2 % del total de boletas, sin condición de meta del mes', () => {
    const r = liq({
      ...BASE,
      ventasSemanales: [
        { ...S1, totalBoletasMayores: 1000, metaCumplida: true, montoVendido: null },
        { ...S2, totalBoletasMayores: 500, metaCumplida: false, montoVendido: null },
      ],
    });
    expect(monto(r, 'Bono por metas semanales')).toBe(30);
    expect(monto(r, 'Comisión 2%')).toBe(30);
    expect(r.ventas.semanas.map((s) => s.cumplida)).toEqual([true, false]);
    expect(r.advertencias.some((a) => a.includes('No hay ninguna venta'))).toBe(false);
  });

  it('2. monto vendido sin sí/no: cumple si supera la meta de la semana', () => {
    const r = liq({
      ...BASE,
      ventasSemanales: [
        { ...S1, totalBoletasMayores: 0, metaCumplida: null, montoVendido: 2000 },
        { ...S2, totalBoletasMayores: 0, metaCumplida: null, montoVendido: 100 },
      ],
    });
    expect(r.ventas.semanas.map((s) => s.cumplida)).toEqual([true, false]);
    expect(monto(r, 'Bono por metas semanales')).toBe(30);
  });

  it('3. monto vendido en todas las semanas que no llega a la meta del mes: sin 1.ª comisión', () => {
    const r = liq({
      ...BASE,
      ventasSemanales: [
        { ...S1, totalBoletasMayores: 1000, metaCumplida: null, montoVendido: 1000 },
        { ...S2, totalBoletasMayores: 500, metaCumplida: null, montoVendido: 1000 },
      ],
    });
    expect(r.ventas.metaAlcanzada).toBe(false);
    expect(monto(r, 'Comisión 2%')).toBe(0);
  });

  it('4. en una semana cargada las boletas sueltas no suman; en otra sin carga sí', () => {
    const r = liq({
      ...BASE,
      ventas: [
        { fecha: '2026-10-06', monto: 5000 },
        { fecha: '2026-10-13', monto: 300 },
      ],
      ventasSemanales: [{ ...S1, totalBoletasMayores: 1000, metaCumplida: true, montoVendido: null }],
    });
    // Base = 1000 (carga de la semana 1) + 300 (boleta suelta de la semana 2) → 2 % = 26.
    expect(monto(r, 'Comisión 2%')).toBe(26);
    expect(r.ventas.baseComision).toBe(1300);
    // Semana 1 cumplida por la carga; semana 2: 300 no llega a la meta.
    expect(monto(r, 'Bono por metas semanales')).toBe(30);
  });

  it('5. sin cargas: liquidación idéntica a la de hoy', () => {
    const conVentas: Entrada = { ...BASE, ventas: [{ fecha: '2026-10-06', monto: 2000 }] };
    expect(liq({ ...conVentas, ventasSemanales: [] })).toEqual(liq(conVentas));
  });
});
