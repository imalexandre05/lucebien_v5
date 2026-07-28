import { pedidosRepo } from '../../lib/pedidos-repo';
import { clientesRepo } from '../../lib/clientes-repo';
import { inventarioRepo } from '../../lib/inventario-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { PedidosCliente } from './cliente';

// POS (Fase 9): "nuevo pedido" es MODAL, nunca página nueva — antes era app/pedidos/nuevo
// (eliminada). El modal conecta con inventario (ActivoPicker con buscador) y autocompleta el
// precio sugerido según el tipo de pedido.
// Sede (Fase 2, "el dispositivo manda"): ya NO se elige en el formulario — todo pedido nuevo nace
// en sesion.usuario.sede (la sede activa: pre-marcada por el equipo en el login, cambiable solo
// desde el topbar). Era el único selector de sede que quedaba en este módulo.
export default async function PedidosPage() {
  const [pedidos, clientes, activos, sesion] = await Promise.all([
    pedidosRepo.listar(),
    clientesRepo.listar(),
    inventarioRepo.listar(),
    getSesion(),
  ]);
  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Alquiler · venta · servicios · confección" />
      <PedidosCliente
        pedidosIniciales={pedidos}
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        activos={activos}
        sedeActual={sesion?.usuario.sede ?? ''}
      />
    </div>
  );
}
