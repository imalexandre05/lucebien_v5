import { notFound, redirect } from 'next/navigation';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { listarPagos, empleadosParaPago } from '../../../../lib/pagos-repo';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { PagosCliente } from '../../../pagos/cliente';

// El registro de pagos de esta persona. Se reusa el cliente de /pagos con la lista acotada.
//
// La liquidación completa —la que calcula el motor contra el contrato, los tramos y los
// movimientos— sigue viviendo en /sueldos/liquidaciones, que trabaja sobre un contrato y no sobre
// un rango libre de fechas. Mudarla acá sin resolver esa diferencia de grano sería mover el
// problema, no arreglarlo. Queda anotado en la spec del módulo.
export const dynamic = 'force-dynamic';

export default async function PagoColaboradorPage({ params }: { params: { id: string } }) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('pago')) redirect(`/colaboradores/${params.id}`);

  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';

  const [todos, empleados] = await Promise.all([listarPagos(), empleadosParaPago()]);
  const pagos = todos.filter((p) => p.empleadoId === persona.id);
  const soloEsta = empleados.filter((e) => e.id === persona.id);

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="pago"
        nota="Un pago anulado se conserva a la vista: borrar el rastro de un pago mal cargado es lo que hace imposible reconstruir después qué se le pagó a quién."
      />
      <PagosCliente
        pagos={pagos}
        empleados={soloEsta.length ? soloEsta : [{ id: persona.id, nombre: persona.nombre, salarioBase: persona.salarioBase, ultimaNota: null }]}
        esAdmin={esAdmin}
      />
    </div>
  );
}
