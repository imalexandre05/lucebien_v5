import { listarSedes } from '../../../lib/sedes-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { RegistrarForm } from './form';

// Alta manual de prendas que llegan al almacén (pestaña Registrar del viejo).
// Pensada para ráfagas: registrar y seguir sin salir del formulario.
export default async function RegistrarPage() {
  const sedes = await listarSedes().catch(() => []);
  return (
    <div>
      <PageHeader title="Registrar prendas" subtitle="Alta de prendas recibidas en Almacén Central — entran en Recepción" />
      <RegistrarForm sedes={sedes.map((s) => s.cod)} />
    </div>
  );
}
