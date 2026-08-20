import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { accesoColaboradores } from '../../../../lib/colaboradores-acceso';
import { obtenerColaborador } from '../../../../lib/colaboradores-repo';
import { listarMovimientos, listarVentas } from '../../../../lib/sueldos-repo';
import { leerPeriodo } from '../../../../lib/periodo';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SeccionHeader } from '../../../../components/colaboradores/seccion-header';
import { MovimientosCliente } from '../../../sueldos/movimientos/cliente';

// Adelantos, descuentos, bonos y ventas de esta persona en el período.
//
// Acá el período de la barra SÍ manda, a diferencia de asistencias: la liquidación consume estos
// movimientos por rango (persona y período, con la liquidación en null), no por lista de ids. Así
// que mirarlos por rango es mirarlos como los mira el motor.
export const dynamic = 'force-dynamic';

export default async function MovimientosColaboradorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');
  if (!acceso.secciones.includes('movimientos')) redirect(`/colaboradores/${params.id}`);

  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  if (!esAdmin) {
    return (
      <div className="space-y-3">
        <SeccionHeader seccion="movimientos" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta sección es del administrador">
            Un adelanto o un descuento cambia lo que cobra una persona. Sólo el administrador o el
            dueño los cargan.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const periodo = leerPeriodo(searchParams);
  const [movimientos, ventas] = await Promise.all([
    listarMovimientos({ empleadoId: persona.id, desde: periodo.desde, hasta: periodo.hasta }),
    listarVentas({ empleadoId: persona.id, desde: periodo.desde, hasta: periodo.hasta }),
  ]);

  const sinLiquidar = movimientos.filter((m) => m.liquidacionId == null).length;

  return (
    <div className="space-y-3">
      <SeccionHeader
        seccion="movimientos"
        nota={
          sinLiquidar > 0
            ? `${sinLiquidar} sin liquidar en este período. Una fila cargada después de calcular y antes de cerrar hace que el cierre corte con DESACTUALIZADA, para que no quede sellado un pago que no la incluye.`
            : 'Las ventas sin vendedor asignado no aparecen acá: se asignan desde Adelantos y ventas, que las lista aparte.'
        }
      />
      <MovimientosCliente
        empleados={[{ id: persona.id, nombre: persona.nombre, rol: persona.rol, sedeCod: persona.sedeCod }]}
        movimientos={movimientos}
        ventas={ventas}
      />
    </div>
  );
}
