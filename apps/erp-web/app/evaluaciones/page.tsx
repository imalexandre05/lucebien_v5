import { listarEvaluaciones, leerPesosEval } from '../../lib/evaluaciones-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { EvaluacionesCliente } from './cliente';

export default async function EvaluacionesPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  const [evaluaciones, empleados, pesos] = await Promise.all([
    listarEvaluaciones(),
    listarEmpleados(),
    leerPesosEval(),
  ]);

  return (
    <div>
      <PageHeader title="Evaluaciones mensuales" subtitle={`${evaluaciones.length} registradas · pesos editables en Configuración`} />
      <EvaluacionesCliente evaluaciones={evaluaciones} empleados={empleados} pesos={pesos} esAdmin={esAdmin} />
    </div>
  );
}
