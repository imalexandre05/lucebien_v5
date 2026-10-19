import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarListaPrecios } from '../../../lib/lista-precios-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { ListaPreciosCliente } from './cliente';

// Lista de precios de confecciones: la edita el administrador y ventas la usa para armar la boleta.
export const dynamic = 'force-dynamic';

export default async function ListaPreciosPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const items = await listarListaPrecios();
  return (
    <div>
      <PageHeader title="Lista de precios" subtitle="Prendas y servicios de confección, con su precio" />
      <ListaPreciosCliente items={items} />
    </div>
  );
}
