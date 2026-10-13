import { redirect } from 'next/navigation';
import { normalizarRango } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { cargarEstadisticas } from '../../lib/estadisticas-repo';
import { PageHeader } from '../../components/shell/page-header';
import { EstadisticasCliente } from './cliente';

export const dynamic = 'force-dynamic';

export default async function EstadisticasPage(
  props: {
    searchParams: Promise<{ desde?: string; hasta?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const rango = normalizarRango(searchParams.desde, searchParams.hasta, 30);
  const data = await cargarEstadisticas(rango.desde, rango.hasta);

  return (
    <div>
      <PageHeader title="Estadísticas del negocio" subtitle="Panel gerencial · cruza caja, pedidos, producción, incidencias y reportes de actividades" />
      <EstadisticasCliente data={data} rango={rango} />
    </div>
  );
}
