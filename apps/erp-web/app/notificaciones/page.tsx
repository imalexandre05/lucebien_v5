import { redirect } from 'next/navigation';
import { getSesion } from '../../lib/auth';
import { listarNotificaciones } from '../../lib/notificaciones-repo';
import { PageHeader } from '../../components/shell/page-header';
import { NotificacionesCliente } from './cliente';

export const dynamic = 'force-dynamic';

export default async function NotificacionesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';

  const notificaciones = await listarNotificaciones();
  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle={noLeidas ? `${noLeidas} sin leer` : 'Todo al día'}
      />
      <NotificacionesCliente notificaciones={notificaciones} esAdmin={esAdmin} />
    </div>
  );
}
