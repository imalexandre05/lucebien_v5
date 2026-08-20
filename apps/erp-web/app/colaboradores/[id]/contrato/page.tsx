import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { listarAcuerdos } from '../../../../lib/sueldos-repo';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { AcuerdosCliente } from '../../../sueldos/acuerdos/cliente';

// Lo pactado con esta persona: modalidad, sueldo, horario por día y los parámetros del cálculo.
//
// Es el primer paso del hilo y no por orden alfabético: sin contrato no hay horario contra el cual
// medir la tardanza, y sin eso la liquidación no puede calcularse aunque la asistencia esté
// declarada al día.
export const dynamic = 'force-dynamic';

export default async function ContratoColaboradorPage({ params }: { params: { id: string } }) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('contrato')) redirect(`/colaboradores/${params.id}`);

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  if (!esAdmin) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="contrato" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta sección es del administrador">
            Un contrato pacta el sueldo de una persona. Sólo el administrador o el dueño lo editan.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const acuerdos = await listarAcuerdos(persona.id);

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="contrato"
        nota="Un contrato liquidado no se edita: lo que se pagó se calculó contra estos números, y cambiarlos después dejaría la boleta sin poder reconstruirse."
      />
      <AcuerdosCliente
        acuerdos={acuerdos}
        empleados={[{ id: persona.id, nombre: persona.nombre, rol: persona.rol, sedeCod: persona.sedeCod }]}
      />
    </div>
  );
}
