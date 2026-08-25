import { redirect } from 'next/navigation';
import { puede, type MatrizPermisos } from '@scilb/core';
import {
  listarEvaluaciones,
  leerPesosEval,
  leerEscalaPuntos,
  empleadosParaEvaluacion,
  listarCompetenciasConfig,
  type CompetenciaConfig,
} from '../../lib/evaluaciones-repo';
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

  // competenciasConfig (migración 0057, tabla nueva): si todavía no se aplicó, la tabla ni existe
  // — se degrada a [] en vez de tumbar toda la página (lección de la Fase 4/7). El resto de la
  // herramienta (auto-cálculo, guardar, pago) sigue funcionando; solo la rúbrica de competencias
  // queda vacía con un aviso, ver EvaluacionesCliente.
  const [evaluaciones, empleados, pesos, escala, competenciasConfig] = await Promise.all([
    listarEvaluaciones(),
    empleadosParaEvaluacion(),
    leerPesosEval(),
    leerEscalaPuntos(),
    listarCompetenciasConfig().catch(() => [] as CompetenciaConfig[]),
  ]);

  return (
    <div>
      <PageHeader title="Evaluaciones mensuales" subtitle={`${evaluaciones.length} registradas · la nota sale de los puntos, editable en Configuración`} />
      <EvaluacionesCliente
        evaluaciones={evaluaciones}
        empleados={empleados}
        pesos={pesos}
        escala={escala}
        esAdmin={esAdmin}
        competenciasConfig={competenciasConfig}
      />
    </div>
  );
}
