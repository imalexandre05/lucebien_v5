import { redirect } from 'next/navigation';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { listarCapacitaciones, listarItems, notaAprobatoria } from '../../lib/capacitacion-repo';
import { listarEmpleados } from '../../lib/reportes-repo';
import { CapacitacionCliente } from './cliente';

// Sin módulo propio: la base decide qué ve cada quien (RLS de la 0131). El administrador lo ve todo;
// el capacitador, las que dicta; el nuevo, la suya.
export default async function CapacitacionPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  const [capacitaciones, items, minimo, empleados] = await Promise.all([
    listarCapacitaciones(),
    listarItems(),
    notaAprobatoria(),
    esAdmin ? listarEmpleados() : Promise.resolve([]),
  ]);
  return (
    <div>
      <PageHeader
        title="Capacitación"
        subtitle={`${capacitaciones.filter((c) => c.estado === 'en_curso').length} en curso`}
      />
      <CapacitacionCliente
        capacitaciones={capacitaciones}
        items={items}
        notaAprobatoria={minimo}
        empleados={empleados}
        esAdmin={esAdmin}
        yoId={sesion.usuario.id}
      />
    </div>
  );
}
