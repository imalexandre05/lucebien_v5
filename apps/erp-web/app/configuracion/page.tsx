import { redirect } from 'next/navigation';
import { listarConfig } from '../../lib/config-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { ConfigCliente } from './cliente';

export default async function ConfiguracionPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const items = await listarConfig();
  return (
    <div>
      <PageHeader title="Configuración" subtitle="Parámetros del sistema · editables" />
      <ConfigCliente items={items} />
    </div>
  );
}
