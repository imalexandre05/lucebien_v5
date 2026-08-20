import { notFound, redirect } from 'next/navigation';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import {
  listarEvaluaciones,
  leerPesosEval,
  listarCompetenciasConfig,
  type CompetenciaConfig,
} from '../../../../lib/evaluaciones-repo';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { EvaluacionesCliente } from '../../../evaluaciones/cliente';

// La nota del período. Se reusa el cliente de /evaluaciones con los datos acotados a esta persona:
// la rúbrica de competencias, el auto-cálculo del ciclo y el panel de pago son lógica que ya está
// probada ahí, y tenerla dos veces es cómo se llega a dos notas distintas para la misma persona.
export const dynamic = 'force-dynamic';

export default async function EvaluacionColaboradorPage({ params }: { params: { id: string } }) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('evaluacion')) redirect(`/colaboradores/${params.id}`);

  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';

  // competenciasConfig llegó con la 0057: si no está aplicada la tabla ni existe, y se degrada a
  // lista vacía en vez de tumbar la sección entera (lección de la Fase 4/7).
  const [todas, pesos, competenciasConfig] = await Promise.all([
    listarEvaluaciones(),
    leerPesosEval(),
    listarCompetenciasConfig().catch(() => [] as CompetenciaConfig[]),
  ]);

  const evaluaciones = todas.filter((e) => e.empleadoId === persona.id);

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="evaluacion"
        nota="La nota se calcula con los pesos que estén cargados en Configuración, y se guarda un snapshot de los pesos usados: cambiar un peso mañana no reescribe una nota de ayer."
      />
      <EvaluacionesCliente
        evaluaciones={evaluaciones}
        empleados={[
          {
            id: persona.id,
            nombre: persona.nombre,
            fechaIngreso: persona.fechaIngreso,
            salarioBase: persona.salarioBase,
          },
        ]}
        pesos={pesos}
        esAdmin={esAdmin}
        competenciasConfig={competenciasConfig}
      />
    </div>
  );
}
