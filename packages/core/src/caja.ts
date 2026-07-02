// Caja — cálculos puros de arqueo y alertas (lógica del oficio). Contrato S13/S12.
// Sin IO: recibe movimientos ya cargados y calcula. Los repos de la app aportan la persistencia.

export type MovimientoCaja = { tipo: 'ingreso' | 'egreso'; monto: number; metodo: string | null };

export type ResumenCaja = {
  ingresos: number;
  egresos: number;
  neto: number;
  efectivoEsperado: number;
  efectivo: number;
  yape: number;
  transferencia: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// Arqueo del día: totales + efectivo esperado = apertura + ingresos_efectivo − egresos_efectivo.
export function resumenCaja(montoApertura: number, movimientos: MovimientoCaja[]): ResumenCaja {
  const suma = (pred: (m: MovimientoCaja) => boolean) =>
    movimientos.filter(pred).reduce((s, m) => s + m.monto, 0);
  const ingresos = suma((m) => m.tipo === 'ingreso');
  const egresos = suma((m) => m.tipo === 'egreso');
  const efIn = suma((m) => m.tipo === 'ingreso' && m.metodo === 'efectivo');
  const efOut = suma((m) => m.tipo === 'egreso' && m.metodo === 'efectivo');
  const porMetodo = (metodo: string) => suma((m) => m.tipo === 'ingreso' && m.metodo === metodo);
  return {
    ingresos: r2(ingresos),
    egresos: r2(egresos),
    neto: r2(ingresos - egresos),
    efectivoEsperado: r2(montoApertura + efIn - efOut),
    efectivo: r2(porMetodo('efectivo')),
    yape: r2(porMetodo('yape')),
    transferencia: r2(porMetodo('transferencia')),
  };
}

// Alerta de devolución (S12): según los días hasta la fecha de devolución.
export type NivelDevolucion = 'vencido' | 'hoy' | 'proximo' | 'futuro';

export function nivelDevolucion(dias: number, proximoDias = 3): NivelDevolucion {
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  if (dias <= proximoDias) return 'proximo';
  return 'futuro';
}
