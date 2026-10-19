import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarEmpleadosActivos } from '../../../lib/reportes-repo';
import { listarTiposIncidencia } from '../../../lib/incidencias-repo';
import { leerConfigMap, CIERRE_TURNO_DEFAULT, TOPE_EXTRA_DEFAULT } from '../../../lib/config-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { NuevoReporteForm } from './form';
import { hoyPeru } from '../../../lib/fechas';
import { pedirCodigoEnPantalla } from '../../../lib/pipeline-operador';

export default async function NuevoReportePage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const sede = sesion.usuario.sede;
  const fecha = hoyPeru();
  // Mismo criterio que incidencias/sueldos. Quien no es admin queda fijo como encargado (0122, H14).
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  const [empleados, tiposIncidencia, config, compartido] = await Promise.all([
    listarEmpleadosActivos(),
    listarTiposIncidencia(),
    leerConfigMap(),
    pedirCodigoEnPantalla().catch(() => false),
  ]);
  const cierres = {
    M: config.turno_m_cierre || CIERRE_TURNO_DEFAULT.M,
    T: config.turno_t_cierre || CIERRE_TURNO_DEFAULT.T,
    C: config.turno_c_cierre || CIERRE_TURNO_DEFAULT.C,
  };
  // Mismo tope que valida reportes_crear (0171); el default vive en config-catalogo.
  const topeExtra = Math.max(1, Math.floor(Number(config.reporte_extra_cantidad_max)) || TOPE_EXTRA_DEFAULT);

  return (
    <div>
      <PageHeader title="Nuevo reporte de actividades" subtitle={`${sede || 'sin sede'} · ${fecha}`} />
      <NuevoReporteForm
        sede={sede}
        fecha={fecha}
        encargadoId={sesion.usuario.id}
        esAdmin={esAdmin}
        empleados={empleados}
        tiposIncidencia={tiposIncidencia}
        cierres={cierres}
        compartido={compartido}
        topeExtra={topeExtra}
      />
    </div>
  );
}
