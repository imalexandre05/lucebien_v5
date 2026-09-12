import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados, listarReportesDe } from '../../../lib/reportes-repo';
import { listarTiposIncidencia } from '../../../lib/incidencias-repo';
import { leerConfigMap, CIERRE_TURNO_DEFAULT } from '../../../lib/config-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { NuevoReporteForm } from './form';
import { MisReportes } from '../mis-reportes';
import { hoyPeru } from '../../../lib/fechas';

export default async function NuevoReportePage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const sede = sesion.usuario.sede;
  const fecha = hoyPeru();
  const [empleados, tiposIncidencia, config, misReportes] = await Promise.all([
    listarEmpleados(),
    listarTiposIncidencia(),
    leerConfigMap(),
    // Degradado (mismo criterio que leerMatrizPermisos en reportes/[id]/page.tsx): si esta
    // consulta falla, el formulario del turno -- lo que de verdad importa ese día -- sigue
    // funcionando. El bloque de abajo simplemente queda vacío.
    listarReportesDe(sesion.usuario.id).catch(() => []),
  ]);
  const cierres = {
    M: config.turno_m_cierre || CIERRE_TURNO_DEFAULT.M,
    T: config.turno_t_cierre || CIERRE_TURNO_DEFAULT.T,
    C: config.turno_c_cierre || CIERRE_TURNO_DEFAULT.C,
  };

  return (
    <div>
      <PageHeader title="Nuevo reporte de actividades" subtitle={`${sede || 'sin sede'} · ${fecha}`} />
      <NuevoReporteForm
        sede={sede}
        fecha={fecha}
        encargadoId={sesion.usuario.id}
        empleados={empleados}
        tiposIncidencia={tiposIncidencia}
        cierres={cierres}
      />
      <MisReportes reportes={misReportes} />
    </div>
  );
}
