import type { Cliente } from '@scilb/core';
import { clientesRepo } from './clientes-repo';
import { pedidosRepo } from './pedidos-repo';

// CRM (contrato S8): historial de clientes + seguimiento + fidelización.
// La segmentación se deriva de los pedidos del cliente. Umbrales con defaults sensatos;
// a futuro editables desde Configuración (filosofía "todo configurable").
export type SegmentoCliente = 'nuevo' | 'recurrente' | 'vip';

export type ClienteCRM = Cliente & {
  pedidos: number;
  totalGastado: number;
  ultimoPedido: string | null;
  diasSinComprar: number | null;
  segmento: SegmentoCliente;
  seguir: boolean; // tiene historial pero lleva mucho sin comprar → reactivar
};

export const UMBRAL_CRM = { vipMonto: 2000, vipPedidos: 5, recurrentePedidos: 2, inactivoDias: 120 };

function diasDesde(fecha: string | null): number | null {
  if (!fecha) return null;
  const t = new Date(`${fecha}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function segmentar(pedidos: number, totalGastado: number): SegmentoCliente {
  if (totalGastado >= UMBRAL_CRM.vipMonto || pedidos >= UMBRAL_CRM.vipPedidos) return 'vip';
  if (pedidos >= UMBRAL_CRM.recurrentePedidos) return 'recurrente';
  return 'nuevo';
}

// Métricas CRM a partir de una lista de pedidos (para la ficha del cliente).
export function metricasCRM(pedidos: { total: number; fecha: string }[]) {
  const n = pedidos.length;
  const totalGastado = pedidos.reduce((s, p) => s + p.total, 0);
  const ultimoPedido = pedidos.reduce<string | null>((u, p) => (!u || p.fecha > u ? p.fecha : u), null);
  const diasSinComprar = diasDesde(ultimoPedido);
  const segmento = segmentar(n, totalGastado);
  return {
    pedidos: n,
    totalGastado,
    ultimoPedido,
    diasSinComprar,
    segmento,
    seguir: n > 0 && diasSinComprar !== null && diasSinComprar > UMBRAL_CRM.inactivoDias,
  };
}

// Lista de clientes con sus métricas CRM (un solo barrido de pedidos, agrupado en memoria).
export async function listarClientesCRM(): Promise<ClienteCRM[]> {
  const [clientes, pedidos] = await Promise.all([clientesRepo.listar(), pedidosRepo.listar()]);
  const porCliente = new Map<string, { total: number; fecha: string }[]>();
  for (const p of pedidos) {
    const arr = porCliente.get(p.clienteId) ?? [];
    arr.push({ total: p.total, fecha: p.fecha });
    porCliente.set(p.clienteId, arr);
  }
  return clientes.map((c: Cliente) => {
    const m = metricasCRM(porCliente.get(c.id) ?? []);
    return { ...c, ...m };
  });
}
