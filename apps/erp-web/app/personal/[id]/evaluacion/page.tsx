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
import { leerPeriodo, rangoCorto } from '../../../../lib/periodo';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { EvaluacionesCliente } from '../../../evaluaciones/cliente';

// La nota del período. Se reusa el cliente de /evaluaciones con los datos acotados a esta persona:
// la rúbrica de competencias, el auto-cálculo del ciclo y el panel de pago son lógica que ya está
// probada ahí, y tenerla dos veces es cómo se llega a dos notas distintas para la misma persona.
export const dynamic = 'force-dynamic';

export default async function EvaluacionColaboradorPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
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

  // El período de la barra manda (decisión del dueño n.º 5): una evaluación entra si su ciclo toca el
  // período o, sin ciclo guardado, si su mes cae entre los meses del período.
  const periodo = leerPeriodo(searchParams);
  const deLaPersona = todas.filter((e) => e.empleadoId === persona.id);
  const evaluaciones = deLaPersona.filter((e) =>
    e.cicloDesde && e.cicloHasta
      ? e.cicloDesde <= periodo.hasta && e.cicloHasta >= periodo.desde
      : e.mes >= periodo.desde.slice(0, 7) && e.mes <= periodo.hasta.slice(0, 7),
  );
  const deOtrosPeriodos = deLaPersona.length - evaluaciones.length;

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="evaluacion"
        nota={`Se muestra solo el período elegido arriba (${rangoCorto(periodo.desde, periodo.hasta)})${deOtrosPeriodos > 0 ? `; hay ${deOtrosPeriodos} ${deOtrosPeriodos === 1 ? 'evaluación' : 'evaluaciones'} de otros períodos` : ''}. La nota sale de los puntos del período (pipeline, extras, actividades, ventas, incidencias), editables en Configuración; se guarda un snapshot del desglose por componente como perfil, y cambiar un parámetro mañana no reescribe una nota de ayer.`}
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
