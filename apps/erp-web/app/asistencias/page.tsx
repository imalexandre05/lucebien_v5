import { listarAsistencias } from '../../lib/asistencias-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { AsistenciasCliente } from './cliente';

export default async function AsistenciasPage() {
  const [asistencias, empleados, sesion] = await Promise.all([
    listarAsistencias(),
    listarEmpleados(),
    getSesion(),
  ]);
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  return (
    <div>
      <PageHeader title="Asistencias" subtitle={`${asistencias.length} registros`} />
      <AsistenciasCliente asistencias={asistencias} empleados={empleados} esAdmin={esAdmin} />
    </div>
  );
}
