import { Lock } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import { listarMovimientos } from '../../../lib/sueldos-repo';
import { leerPeriodo } from '../../../lib/periodo';
import { BarraPeriodo } from '../../../components/colaboradores/barra-periodo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { MovimientosCliente } from './cliente';

/**
 * Adelantos, descuentos y bonos — paso 8 de la spec de sueldos §9.
 *
 * Las ventas se mudaron a `/sueldos/ventas` (Tarea 3 del rediseño de sueldos F1, 22-ago-2026): son
 * un trabajo distinto — se transcriben desde tuxedo en tandas, no se cargan de a una como esto.
 *
 * Lo que se carga acá lo consume la liquidación **por rango** —persona y periodo, con la
 * liquidación en null—, no por lista de ids. Por eso una fila cargada después de calcular y antes
 * de cerrar hace que el cierre corte con `DESACTUALIZADA`: si no, quedaría sellada sin estar en el
 * pago.
 *
 * Se lista el período de la barra (default: mes en curso) MÁS todo lo que siga sin liquidar, de la
 * fecha que sea: antes se traía el historial entero en cada alta. Lo sin liquidar no se acota
 * porque es lo que entra en el próximo pago; lo ya pagado de otros meses se ve cambiando el
 * período (spec 2026-10-03-adelantos-rendimiento-design.md).
 */
export const dynamic = 'force-dynamic';

export default async function MovimientosPage(props: {
  searchParams?: Promise<{ desde?: string; hasta?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Movimientos" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Un adelanto o un descuento cambia lo que cobra una persona. Sólo el administrador o el
            dueño los cargan.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const periodo = leerPeriodo(searchParams);
  const [empleados, movimientos] = await Promise.all([
    listarEmpleados(),
    listarMovimientos({ desde: periodo.desde, hasta: periodo.hasta, incluirSinLiquidar: true }),
  ]);

  const sinLiquidar = movimientos.filter((m) => m.liquidacionId == null).length;

  return (
    <div>
      <PageHeader title="Movimientos" subtitle={`${sinLiquidar} movimiento(s) sin liquidar`} />
      <BarraPeriodo className="mb-3" />
      <p className="mb-6 text-apoyo text-muted">
        Se ven los movimientos de este período y, además, todo lo que siga sin liquidar aunque sea
        de otro mes. Para ver lo ya liquidado de meses anteriores, cambie el período.
      </p>
      <MovimientosCliente empleados={empleados} movimientos={movimientos} />
    </div>
  );
}
