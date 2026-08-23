import { Lock, Receipt } from 'lucide-react';
import { getSesion } from '../../../lib/auth';
import { listarAcuerdos, listarLiquidaciones } from '../../../lib/sueldos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { LiquidacionesCliente } from './cliente';

/**
 * Liquidaciones — paso 7 de la spec de sueldos §9.
 *
 * Es la pantalla donde el dinero se vuelve real: se calcula, se mira, y al cerrar queda
 * congelada para siempre. Después de cerrar sólo se puede anular, con motivo y autor.
 *
 * NINGÚN NÚMERO VIAJA DESDE ACÁ. El preview lo calcula el servidor con la entrada de la RPC, y el
 * borrador lo vuelve a calcular igual antes de guardar. La pantalla muestra; no propone totales.
 */
export const dynamic = 'force-dynamic';

export default async function LiquidacionesPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Liquidaciones" />
        <Card>
          <EmptyState icon={Lock} titulo="Esta pantalla es del administrador">
            Una liquidación es el pago de una persona. Sólo el administrador o el dueño las
            calculan y las cierran.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const [acuerdos, liquidaciones] = await Promise.all([listarAcuerdos(), listarLiquidaciones()]);

  if (acuerdos.length === 0) {
    return (
      <div>
        <PageHeader title="Liquidaciones" />
        <Card>
          <EmptyState icon={Receipt} titulo="No hay ningún contrato">
            Una liquidación se calcula sobre el periodo de un contrato. Primero hay que pactar uno.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const cerradas = liquidaciones.filter((l) => l.estado === 'cerrada').length;
  const borradores = liquidaciones.filter((l) => l.estado === 'borrador').length;

  return (
    <div>
      <PageHeader
        title="Liquidaciones"
        subtitle={`${borradores} borrador(es) · ${cerradas} cerrada(s). Una cerrada no se modifica: sólo se anula, con motivo.`}
      />
      <LiquidacionesCliente acuerdos={acuerdos} liquidaciones={liquidaciones} />
    </div>
  );
}
