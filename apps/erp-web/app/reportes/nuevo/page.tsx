import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import { listarTiposIncidencia } from '../../../lib/incidencias-repo';
import { leerConfigMap } from '../../../lib/config-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { NuevoReporteForm } from './form';
import { hoyPeru } from '../../../lib/fechas';

// Defaults (Fase 4 tarea 5): MISMOS valores que ya regían hardcodeados en
// packages/db/migrations/0021_reportes_auto_cierre.sql antes de esta fase — no es una hora nueva,
// es el fallback si `config` todavía no tiene las claves turno_*_cierre (migración 0052 pendiente
// de aplicar, o el admin no las tocó). Ver docs/pendientes-negocio.md.
const CIERRE_DEFAULT = { M: '15:00', T: '23:00', C: '23:00' } as const;

export default async function NuevoReportePage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const sede = sesion.usuario.sede;
  const fecha = hoyPeru();
  const [empleados, tiposIncidencia, config] = await Promise.all([
    listarEmpleados(),
    listarTiposIncidencia(),
    leerConfigMap(),
  ]);
  const cierres = {
    M: config.turno_m_cierre || CIERRE_DEFAULT.M,
    T: config.turno_t_cierre || CIERRE_DEFAULT.T,
    C: config.turno_c_cierre || CIERRE_DEFAULT.C,
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
    </div>
  );
}
