import { inventarioRepo } from '../../lib/inventario-repo';
import { listarSedes } from '../../lib/sedes-repo';
import { PageHeader } from '../../components/shell/page-header';
import { InventarioCliente } from './cliente';

// Inventario comercial (Fase 8): "nuevo activo" y edición son MODAL, nunca una página nueva —
// múltiples páginas confunden al personal. La tabla permite edición rápida en línea para lo
// cotidiano (estado, precios) y el modal cubre todo lo demás (atributos libres por tipo,
// código, sede...). Cada fila refleja su trazabilidad real: si tiene una pasada de pipeline
// activa, se ve "En pipeline: {etapa}" en vez del estado de reposo.
export default async function InventarioPage() {
  const [activos, sedes] = await Promise.all([inventarioRepo.listar(), listarSedes().catch(() => [])]);
  return (
    <div>
      <PageHeader title="Inventario comercial" subtitle="Activos de alquiler y venta" />
      <InventarioCliente activosIniciales={activos} sedes={sedes.map((s) => s.cod)} />
    </div>
  );
}
