import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarTemporadas } from '../../../lib/temporadas-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { TemporadasCliente } from './cliente';

// Temporadas: el administrador define fechas, pago por hora y metas. Sin temporadas se usan los
// valores normales. Solo admin/dueño.
export const dynamic = 'force-dynamic';

export default async function TemporadasPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const temporadas = await listarTemporadas();
  return (
    <div>
      <PageHeader
        title="Temporadas"
        subtitle="Cambia el pago por hora y las metas en las fechas que tú elijas"
      />
      <TemporadasCliente temporadas={temporadas} />
    </div>
  );
}
