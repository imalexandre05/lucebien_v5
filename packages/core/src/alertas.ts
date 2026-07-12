// Motor de alertas (S21) — funciones puras "dado este estado, qué alertas se disparan".
// Sin IO: reciben datos ya cargados y devuelven alertas. El job (cron) y la UI viven en la app;
// aquí solo la lógica, 100% testeable. Umbrales configurables por parámetro (todo configurable).

import { stockBajo } from './compras';

export type Severidad = 'info' | 'warn' | 'critica';
const ORDEN: Record<Severidad, number> = { critica: 0, warn: 1, info: 2 };

export type Alerta = {
  tipo: string;
  titulo: string;
  mensaje: string;
  severidad: Severidad;
  sede?: string | null;
  refTipo?: string;
  refId?: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
function parseUTC(f: string): Date {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
// Días de `hasta` menos `desde` (positivo = hasta está en el futuro).
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((parseUTC(hasta).getTime() - parseUTC(desde).getTime()) / 86400000);
}

// ── Devoluciones de alquiler (W12): vencidas o por vencer ──
export type PedidoDev = { id: string; fechaDevolucion: string | null; estado: string; sedeCod?: string | null; cliente?: string | null };
const DEV_ABIERTOS = ['abierto', 'entregado'];

export function alertasDevoluciones(pedidos: PedidoDev[], hoy: string, proximoDias = 2): Alerta[] {
  const out: Alerta[] = [];
  for (const p of pedidos) {
    if (!p.fechaDevolucion || !DEV_ABIERTOS.includes(p.estado)) continue;
    const dias = diasEntre(hoy, p.fechaDevolucion);
    const quien = p.cliente ? ` de ${p.cliente}` : '';
    if (dias < 0) {
      out.push({
        tipo: 'devolucion_vencida',
        titulo: 'Devolución vencida',
        mensaje: `La devolución${quien} venció hace ${Math.abs(dias)} día(s).`,
        severidad: 'critica',
        sede: p.sedeCod ?? null,
        refTipo: 'pedido',
        refId: p.id,
      });
    } else if (dias <= proximoDias) {
      out.push({
        tipo: 'devolucion_proxima',
        titulo: 'Devolución por vencer',
        mensaje: dias === 0 ? `La devolución${quien} es hoy.` : `La devolución${quien} vence en ${dias} día(s).`,
        severidad: 'warn',
        sede: p.sedeCod ?? null,
        refTipo: 'pedido',
        refId: p.id,
      });
    }
  }
  return out;
}

// ── Stock de material bajo mínimo (S16) ──
export type MaterialStock = { id: string; nombre: string; stockActual: number; stockMinimo: number; sedeCod?: string | null; activo?: boolean };

export function alertasStock(materiales: MaterialStock[]): Alerta[] {
  return materiales.filter((m) => stockBajo(m)).map((m) => ({
    tipo: 'stock_bajo',
    titulo: 'Stock bajo mínimo',
    mensaje: `${m.nombre}: ${m.stockActual} (mínimo ${m.stockMinimo}).`,
    severidad: 'warn',
    sede: m.sedeCod ?? null,
    refTipo: 'material',
    refId: m.id,
  }));
}

// ── Caja sin cerrar de un día anterior ──
export type CajaAbierta = { id: string; sedeCod: string; fecha: string; estado: string };

export function alertasCajaSinCerrar(sesiones: CajaAbierta[], hoy: string): Alerta[] {
  return sesiones
    .filter((s) => s.estado === 'abierta' && diasEntre(s.fecha, hoy) >= 1)
    .map((s) => ({
      tipo: 'caja_sin_cerrar',
      titulo: 'Caja sin cerrar',
      mensaje: `La caja de ${s.sedeCod} del ${s.fecha} sigue abierta.`,
      severidad: 'warn',
      sede: s.sedeCod,
      refTipo: 'caja',
      refId: s.id,
    }));
}

// ── Reportes FR-01 sin evaluar tras un margen de días ──
export type ReporteEval = { id: string; sedeCod: string; fecha: string; evaluado: boolean; noEvaluable?: boolean };

export function alertasReportesSinEvaluar(reportes: ReporteEval[], hoy: string, diasGracia = 2): Alerta[] {
  return reportes
    .filter((r) => !r.evaluado && !r.noEvaluable && diasEntre(r.fecha, hoy) >= diasGracia)
    .map((r) => ({
      tipo: 'reporte_sin_evaluar',
      titulo: 'FR-01 sin evaluar',
      mensaje: `El reporte de ${r.sedeCod} del ${r.fecha} lleva ${diasEntre(r.fecha, hoy)} día(s) sin evaluar.`,
      severidad: 'info',
      sede: r.sedeCod,
      refTipo: 'reporte',
      refId: r.id,
    }));
}

// Ordena por severidad (crítica → info); estable dentro del mismo nivel.
export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad]);
}

export { iso as fechaISO };
