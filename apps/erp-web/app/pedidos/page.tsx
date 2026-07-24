import { pedidosRepo } from '../../lib/pedidos-repo';
import { clientesRepo } from '../../lib/clientes-repo';
import { inventarioRepo } from '../../lib/inventario-repo';
import { listarSedes } from '../../lib/sedes-repo';
import { PageHeader } from '../../components/shell/page-header';
import { PedidosCliente } from './cliente';

// POS (Fase 9): "nuevo pedido" es MODAL, nunca página nueva — antes era app/pedidos/nuevo
// (eliminada). El modal conecta con inventario (ActivoPicker con buscador) y autocompleta sede
// y precio sugerido según el tipo de pedido.
export default async function PedidosPage() {
  const [pedidos, clientes, activos, sedes] = await Promise.all([
    pedidosRepo.listar(),
    clientesRepo.listar(),
    inventarioRepo.listar(),
    listarSedes().catch(() => []),
  ]);
  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Alquiler · venta · servicios · confección" />
      <PedidosCliente
        pedidosIniciales={pedidos}
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        activos={activos}
        sedes={sedes.map((s) => s.cod)}
      />
    </div>
  );
}
