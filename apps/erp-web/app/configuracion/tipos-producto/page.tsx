import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarTiposProducto } from '../../../lib/producto-tipos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { TiposProductoCliente } from './cliente';

// Catálogo de tipos de producto (Fase 7): qué tipos existen (terno, saco, camisa...), su prefijo
// de código (TN, SC, CM...) y qué atributos sugiere para cada uno. Solo admin/dueño, mismo patrón
// que /configuracion/actividades. Si la migración 0055 no está aplicada, listarTiposProducto()
// devuelve [] con elegancia — la pantalla muestra el vacío en vez de romperse.
export default async function TiposProductoPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const tipos = await listarTiposProducto();

  return (
    <div>
      <PageHeader
        title="Tipos de producto"
        subtitle="Catálogo de tipos, prefijo de código y atributos sugeridos"
      />
      <TiposProductoCliente tipos={tipos} />
    </div>
  );
}
