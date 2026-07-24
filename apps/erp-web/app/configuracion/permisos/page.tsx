import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { leerMatrizPermisos } from '../../../lib/permisos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { PermisosCliente } from './cliente';

// Matriz de permisos por rol (Fase 4): qué módulos ve cada rol en la navegación. admin/dueno
// siempre ven todo (mecanismo del core, no se editan aquí). Solo admin/dueno acceden a esta página.
export default async function PermisosPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const matriz = await leerMatrizPermisos();
  return (
    <div>
      <PageHeader
        title="Permisos por rol"
        subtitle="Qué módulos ve cada rol en el menú · admin y dueño siempre ven todo"
      />
      <PermisosCliente matrizInicial={matriz} />
    </div>
  );
}
