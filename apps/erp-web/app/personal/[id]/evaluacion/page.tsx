import { notFound, redirect } from 'next/navigation';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import {
  listarEvaluaciones,
  leerPesosEval,
  leerEscalaPuntos,
  listarCompetenciasConfig,
  type CompetenciaConfig,
} from '../../../../lib/evaluaciones-repo';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { EvaluacionesCliente } from '../../../evaluaciones/cliente';

// La nota del período. Se reusa el cliente de /evaluaciones con los datos acotados a esta persona:
// la rúbrica de competencias, el auto-cálculo del ciclo y el panel de pago son lógica que ya está
// probada ahí, y tenerla dos veces es cómo se llega a dos notas distintas para la misma persona.
export const dynamic = 'force-dynamic';

export default async function EvaluacionColaboradorPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('evaluacion')) redirect(`/personal/${params.id}`);

  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';

  // competenciasConfig llegó con la 0057: si no está aplicada la tabla ni existe, y se degrada a
  // lista vacía en vez de tumbar la sección entera (lección de la Fase 4/7).
  const [todas, pesos, escala, competenciasConfig] = await Promise.all([
    listarEvaluaciones(),
    leerPesosEval(),
    leerEscalaPuntos(),
    listarCompetenciasConfig().catch(() => [] as CompetenciaConfig[]),
  ]);

  const evaluaciones = todas.filter((e) => e.empleadoId === persona.id);

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="evaluacion"
        nota="La nota sale de los puntos del período (pipeline, extras, actividades, ventas, incidencias), editables en Configuración; se guarda un snapshot del desglose por componente como perfil, y cambiar un parámetro mañana no reescribe una nota de ayer."
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
        escala={escala}
        esAdmin={esAdmin}
        competenciasConfig={competenciasConfig}
      />
    </div>
  );
}
