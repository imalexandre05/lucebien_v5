import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import { listarTiposIncidencia } from '../../../lib/incidencias-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { NuevoReporteForm } from './form';

// Fecha de hoy en hora de Perú (America/Lima), independiente de la TZ del server.
function fechaPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

export default async function NuevoReportePage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const sede = sesion.usuario.sede;
  const fecha = fechaPeru();
  const [empleados, tiposIncidencia] = await Promise.all([listarEmpleados(), listarTiposIncidencia()]);

  return (
    <div>
      <PageHeader title="Nuevo reporte FR-01" subtitle={`${sede || 'sin sede'} · ${fecha}`} />
      <NuevoReporteForm
        sede={sede}
        fecha={fecha}
        encargadoId={sesion.usuario.id}
        empleados={empleados}
        tiposIncidencia={tiposIncidencia}
      />
    </div>
  );
}
