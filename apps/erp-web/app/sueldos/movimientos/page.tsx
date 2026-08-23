import { Lock } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import { listarMovimientos } from '../../../lib/sueldos-repo';
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
 */
export const dynamic = 'force-dynamic';

export default async function MovimientosPage() {
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

  const [empleados, movimientos] = await Promise.all([listarEmpleados(), listarMovimientos({})]);

  const sinLiquidar = movimientos.filter((m) => m.liquidacionId == null).length;

  return (
    <div>
      <PageHeader title="Movimientos" subtitle={`${sinLiquidar} movimiento(s) sin liquidar`} />
      <MovimientosCliente empleados={empleados} movimientos={movimientos} />
    </div>
  );
}
