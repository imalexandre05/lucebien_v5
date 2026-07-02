import type { Cliente } from '@scilb/core';
import { metricasCRM, type SegmentoCliente } from '@scilb/core';
import { clientesRepo } from './clientes-repo';
import { pedidosRepo } from './pedidos-repo';

// CRM (contrato S8). La lógica pura (segmentación/fidelización) vive en @scilb/core y está
// testeada allí; este repo solo carga datos (RLS por sede) y arma las métricas por cliente.
export type { SegmentoCliente };
export { metricasCRM };

export type ClienteCRM = Cliente & {
  pedidos: number;
  totalGastado: number;
  ultimoPedido: string | null;
  diasSinComprar: number | null;
  segmento: SegmentoCliente;
  seguir: boolean;
};

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
