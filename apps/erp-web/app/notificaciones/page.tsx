import { redirect } from 'next/navigation';
import { getSesion } from '../../lib/auth';
import { listarNotificaciones } from '../../lib/notificaciones-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Aviso } from '../../components/ui/form';
import { NotificacionesCliente } from './cliente';

export const dynamic = 'force-dynamic';

export default async function NotificacionesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';

  // NO TUMBA LA PÁGINA SI LA BASE NO CONTESTA. Esta lectura estaba sin proteger y un timeout de
  // red contra Supabase —uno real, de unos segundos— reventaba el render entero: pantalla de
  // Server Error en vez de la pantalla. El mismo repo ya se lee con try/catch en el topbar por
  // esta razón ("nunca deben tumbar el topbar", topbar.tsx); acá faltaba.
  //
  // Degradar es mejor que romper: la lista aparece vacía con un aviso que dice qué pasó y que se
  // arregla recargando, y el resto de la pantalla sigue en pie.
  let notificaciones: Awaited<ReturnType<typeof listarNotificaciones>> = [];
  let fallo = false;
  try {
    notificaciones = await listarNotificaciones();
  } catch {
    fallo = true;
  }
  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle={fallo ? 'No se pudieron cargar' : noLeidas ? `${noLeidas} sin leer` : 'Todo al día'}
      />
      {fallo && (
        <Aviso tono="error" titulo="No se pudo conectar con la base" className="mb-4">
          Es un problema de conexión, no de tus datos: no se perdió nada. Vuelve a cargar la página
          en un momento.
        </Aviso>
      )}
      <NotificacionesCliente notificaciones={notificaciones} esAdmin={esAdmin} />
    </div>
  );
}
