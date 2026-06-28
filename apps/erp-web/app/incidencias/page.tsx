import { listarIncidencias, listarTiposIncidencia } from '../../lib/incidencias-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { IncidenciasCliente } from './cliente';

export default async function IncidenciasPage() {
  const [incidencias, tipos, empleados, sesion] = await Promise.all([
    listarIncidencias(),
    listarTiposIncidencia(),
    listarEmpleados(),
    getSesion(),
  ]);
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  return (
    <div>
      <PageHeader title="Incidencias" subtitle={`${incidencias.length} registradas`} />
      <IncidenciasCliente incidencias={incidencias} tipos={tipos} empleados={empleados} esAdmin={esAdmin} />
    </div>
  );
}
