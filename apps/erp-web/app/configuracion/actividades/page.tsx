import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarSedes } from '../../../lib/sedes-repo';
import { listarActividadesAdmin } from '../../../lib/actividades-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { ActividadesCliente } from './cliente';

// Gestionar Actividades (espejo del panel del viejo): qué actividades aparecen en cada
// sede, con qué peso, turno y periodicidad. Solo admin.
export default async function ActividadesPage(props: { searchParams: Promise<{ sede?: string }> }) {
  const searchParams = await props.searchParams;
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const sedes = await listarSedes();
  const sede = searchParams.sede && sedes.some((s) => s.cod === searchParams.sede)
    ? searchParams.sede
    : sedes[0]?.cod ?? 'LB';
  const [actividades, catalogo] = await Promise.all([
    listarActividadesAdmin(sede),
    listarActividadesAdmin(),
  ]);

  // Sedes en las que existe cada cod (para preseleccionar en el modal de edición).
  const sedesPorCod = new Map<string, string[]>();
  for (const a of catalogo) {
    const arr = sedesPorCod.get(a.cod) ?? [];
    arr.push(a.sedeCod);
    sedesPorCod.set(a.cod, arr);
  }

  return (
    <div>
      <PageHeader
        title="Gestionar actividades"
        subtitle="Qué actividades aparecen en cada sede, con qué peso y frecuencia"
      />
      <ActividadesCliente
        sede={sede}
        sedes={sedes}
        actividades={actividades}
        sedesPorCod={Object.fromEntries(sedesPorCod)}
      />
    </div>
  );
}
