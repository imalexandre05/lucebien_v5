import { redirect } from 'next/navigation';
import { categoriasProveedor } from '@scilb/adapter-lucebien';
import { getSesion } from '../../lib/auth';
import { listarProveedores } from '../../lib/proveedores-repo';
import { PageHeader } from '../../components/shell/page-header';
import { ProveedoresCliente } from './cliente';

export const dynamic = 'force-dynamic';

export default async function ProveedoresPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const proveedores = await listarProveedores();
  const activos = proveedores.filter((p) => p.activo).length;

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle={`${proveedores.length} registrados · ${activos} activos`}
      />
      <ProveedoresCliente proveedores={proveedores} categorias={[...categoriasProveedor]} />
    </div>
  );
}
