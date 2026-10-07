import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { listarAcuerdos, parametrosVigentes } from '../../../../lib/sueldos-repo';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Aviso } from '../../../../components/ui/form';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { AcuerdosCliente } from '../../../sueldos/acuerdos/cliente';

// Lo pactado con esta persona: modalidad, sueldo, horario por día y los parámetros del cálculo.
//
// Es el primer paso del hilo y no por orden alfabético: sin contrato no hay horario contra el cual
// medir la tardanza, y sin eso la liquidación no puede calcularse aunque la asistencia esté
// declarada al día.
export const dynamic = 'force-dynamic';

export default async function ContratoColaboradorPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('contrato')) redirect(`/personal/${params.id}`);

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

  const [acuerdos, valoresVigentes] = await Promise.all([listarAcuerdos(persona.id), parametrosVigentes()]);
  // Alta encadenada (R2, spec §2.4): llega directo desde /personal/nuevo. Sin este aviso, aterrizar
  // acá con el editor ya abierto se leería como un salto sin explicación.
  const continuaDeAlta = searchParams?.continuar === 'alta';

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="contrato"
        nota="Un contrato liquidado no se edita: lo que se pagó se calculó contra estos números, y cambiarlos después dejaría la boleta sin poder reconstruirse."
      />
      {continuaDeAlta && <Aviso tono="info">Datos guardados. Ahora el contrato y su horario.</Aviso>}
      <AcuerdosCliente
        acuerdos={acuerdos}
        empleados={[{ id: persona.id, nombre: persona.nombre, rol: persona.rol, sedeCod: persona.sedeCod }]}
        personaFija={{
          id: persona.id,
          nombre: persona.nombre,
          rol: persona.rol,
          sedeCod: persona.sedeCod,
          dni: persona.dni,
          telefono: persona.telefono,
          recomendaciones: persona.recomendaciones,
        }}
        fechaIngresoPersona={persona.fechaIngreso}
        abrirNuevoAlMontar={continuaDeAlta}
        valoresVigentes={valoresVigentes}
      />
    </div>
  );
}
