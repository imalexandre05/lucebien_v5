import { redirect } from 'next/navigation';
import { normalizarRango } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { cargarEstadisticas } from '../../lib/estadisticas-repo';
import { PageHeader } from '../../components/shell/page-header';
import { EstadisticasCliente } from './cliente';

export const dynamic = 'force-dynamic';

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string };
}) {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const rango = normalizarRango(searchParams.desde, searchParams.hasta, 30);
  const data = await cargarEstadisticas(rango.desde, rango.hasta);

  return (
    <div>
      <PageHeader title="Estadísticas del negocio" subtitle="Panel gerencial · cruza caja, pedidos, producción, incidencias y FR-01" />
      <EstadisticasCliente data={data} rango={rango} />
    </div>
  );
}
