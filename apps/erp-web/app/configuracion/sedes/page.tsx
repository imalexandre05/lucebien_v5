import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarSedes } from '../../../lib/sedes-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { SedesCliente } from './cliente';

// Sedes (catálogo configurable): crear una sede la habilita en login, actividades,
// layout y pickers. Solo admin.
export default async function SedesPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const sedes = await listarSedes();
  return (
    <div>
      <PageHeader
        title="Sedes"
        subtitle="Crear una sede la habilita en el login, las actividades y el layout"
      />
      <SedesCliente sedes={sedes} />
    </div>
  );
}
