// CRM — segmentación/fidelización de clientes (lógica pura del oficio). Contrato S8.
// Sin dependencias de IO: recibe datos ya cargados y calcula. Testeable con `hoy` inyectable.

export type SegmentoCliente = 'nuevo' | 'recurrente' | 'vip';

export type UmbralesCRM = {
  vipMonto: number;
  vipPedidos: number;
  recurrentePedidos: number;
  inactivoDias: number;
};

// Defaults sensatos; a futuro editables desde Configuración.
export const UMBRAL_CRM: UmbralesCRM = { vipMonto: 2000, vipPedidos: 5, recurrentePedidos: 2, inactivoDias: 120 };

export function segmentar(pedidos: number, totalGastado: number, u: UmbralesCRM = UMBRAL_CRM): SegmentoCliente {
  if (totalGastado >= u.vipMonto || pedidos >= u.vipPedidos) return 'vip';
  if (pedidos >= u.recurrentePedidos) return 'recurrente';
  return 'nuevo';
}

// Días transcurridos desde una fecha ISO (YYYY-MM-DD) hasta `hoy` (inyectable para test).
export function diasDesde(fecha: string | null, hoy: Date = new Date()): number | null {
  if (!fecha) return null;
  const t = new Date(`${fecha}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((hoy.getTime() - t) / 86_400_000);
}

export type MetricasCRM = {
  pedidos: number;
  totalGastado: number;
  ultimoPedido: string | null;
  diasSinComprar: number | null;
  segmento: SegmentoCliente;
  seguir: boolean; // tiene historial pero lleva mucho sin comprar → reactivar
};

export function metricasCRM(
  pedidos: { total: number; fecha: string }[],
  u: UmbralesCRM = UMBRAL_CRM,
  hoy: Date = new Date(),
): MetricasCRM {
  const n = pedidos.length;
  const totalGastado = Math.round(pedidos.reduce((s, p) => s + p.total, 0) * 100) / 100;
  const ultimoPedido = pedidos.reduce<string | null>((acc, p) => (!acc || p.fecha > acc ? p.fecha : acc), null);
  const diasSinComprar = diasDesde(ultimoPedido, hoy);
  const segmento = segmentar(n, totalGastado, u);
  return {
    pedidos: n,
    totalGastado,
    ultimoPedido,
    diasSinComprar,
    segmento,
    seguir: n > 0 && diasSinComprar !== null && diasSinComprar > u.inactivoDias,
  };
}
