import { inventarioRepo } from '../../lib/inventario-repo';
import { listarTiposProducto } from '../../lib/producto-tipos-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { InventarioCliente } from './cliente';

// Inventario comercial (Fase 8): "nuevo activo" y edición son MODAL, nunca una página nueva —
// múltiples páginas confunden al personal. La tabla permite edición rápida en línea para lo
// cotidiano (estado, precios) y el modal cubre todo lo demás (atributos libres por tipo,
// código...). Cada fila refleja su trazabilidad real: si tiene una pasada de pipeline
// activa, se ve "En pipeline: {etapa}" en vez del estado de reposo.
// Sede (Fase 2): ya no se elige al registrar un activo — nace en sesion.usuario.sede.
// Catálogo de tipos (Fase 7): listarTiposProducto() devuelve [] con elegancia si la migración
// 0055 no está aplicada — el modal cae al input de texto libre de siempre (ver cliente.tsx).
export default async function InventarioPage() {
  const [activos, sesion, tiposProducto] = await Promise.all([
    inventarioRepo.listar(),
    getSesion(),
    listarTiposProducto(true),
  ]);
  return (
    <div>
      <PageHeader title="Inventario comercial" subtitle="Activos de alquiler y venta" />
      <InventarioCliente activosIniciales={activos} sedeActual={sesion?.usuario.sede ?? ''} tiposProducto={tiposProducto} />
    </div>
  );
}
