import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarAlertasReglas } from '../../../lib/notificaciones-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { NotificacionesReglasCliente } from './cliente';

// C-6 de la spec de notificaciones (docs/superpowers/specs/notificaciones/
// 2026-09-06-notificaciones-de-control-interno-design.md, paso 5, último). `alertas_reglas` existe
// desde la migración 0041 con la promesa de ser "editable desde Configuración a futuro" — este es
// ese futuro. Mismo patrón que /configuracion/tipos-incidencia: catálogo fijo (acá no se crean ni
// borran reglas, sólo se encienden/apagan y se ajusta su umbral), sólo admin/dueño.
export default async function NotificacionesReglasPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const reglas = await listarAlertasReglas();

  return (
    <div>
      <PageHeader
        title="Reglas de notificaciones"
        subtitle="Qué condiciones avisan, con qué margen, y a quién — cambios con efecto inmediato"
      />
      <NotificacionesReglasCliente reglas={reglas} />
    </div>
  );
}
