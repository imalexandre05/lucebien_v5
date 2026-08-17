import { Lock } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import { listarMovimientos, listarVentas } from '../../../lib/sueldos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { MovimientosCliente } from './cliente';

/**
 * Adelantos, descuentos, bonos y ventas — paso 8 de la spec de sueldos §9.
 *
 * Es lo último que le faltaba a la cadena para funcionar de punta a punta sin la API del otro
 * sistema: las ventas se cargan a mano hasta que exista el contrato de datos, y los movimientos
 * administrativos no van a tener nunca otro origen que éste.
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
        <PageHeader title="Adelantos y ventas" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Un adelanto o un descuento cambia lo que cobra una persona. Sólo el administrador o el
            dueño los cargan.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const [empleados, movimientos, ventas] = await Promise.all([
    listarEmpleados(),
    listarMovimientos({}),
    listarVentas({}),
  ]);

  const sinAsignar = ventas.filter((v) => v.empleadoId == null).length;
  const sinLiquidar = movimientos.filter((m) => m.liquidacionId == null).length;

  return (
    <div>
      <PageHeader
        title="Adelantos y ventas"
        subtitle={`${sinLiquidar} movimiento(s) sin liquidar${sinAsignar > 0 ? ` · ${sinAsignar} venta(s) sin vendedor` : ''}`}
      />
      <MovimientosCliente empleados={empleados} movimientos={movimientos} ventas={ventas} />
    </div>
  );
}
