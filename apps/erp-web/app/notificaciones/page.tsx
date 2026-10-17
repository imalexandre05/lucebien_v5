import { redirect } from 'next/navigation';

// Las notificaciones viven en la campana del topbar. Esta ruta queda sólo para enlaces viejos.
export default function NotificacionesPage() {
  redirect('/');
}
