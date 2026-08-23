import { redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { listarEmpleados } from '../../../lib/reportes-repo';
import {
  listarDispositivos,
  listarMapeos,
  listarSinAsignar,
  listarDiasPendientes,
} from '../../../lib/huellero-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { HuelleroCliente } from './cliente';

export default async function HuelleroPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  // Las cuatro tablas son solo-administrador bajo RLS, así que un no-admin vería todo vacío.
  // Mejor mandarlo a la pantalla que sí puede ver, en vez de dejarlo mirando una página muerta.
  if (!esAdmin) redirect('/asistencias');

  const [dispositivos, mapeos, sinAsignar, pendientes, empleados] = await Promise.all([
    listarDispositivos(),
    listarMapeos(),
    listarSinAsignar(),
    listarDiasPendientes(),
    listarEmpleados(),
  ]);

  return (
    <div>
      <PageHeader
        title="Huellero"
        subtitle="Equipos, identificadores y días por completar"
      />
      <HuelleroCliente
        dispositivos={dispositivos}
        mapeos={mapeos}
        sinAsignar={sinAsignar}
        pendientes={pendientes}
        empleados={empleados}
      />
    </div>
  );
}
