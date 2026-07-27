import { redirect } from 'next/navigation';
import { puede, type MatrizPermisos } from '@scilb/core';
import { listarEvaluaciones, leerPesosEval } from '../../lib/evaluaciones-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { tieneReauth } from '../../lib/reauth';
import { PageHeader } from '../../components/shell/page-header';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { EvaluacionesCliente } from './cliente';

// Gate server-side + reautenticación (Fase 1): ver también /app/pagos/page.tsx — mismo criterio,
// evaluaciones es tan confidencial como el pago (nota final, comentarios de desempeño).
export default async function EvaluacionesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'evaluaciones', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';

  if (!(await tieneReauth(sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Evaluaciones mensuales" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Evaluaciones muestra notas y comentarios de desempeño del equipo." />
      </div>
    );
  }

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
