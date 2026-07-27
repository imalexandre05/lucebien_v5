import { redirect } from 'next/navigation';
import { getSesion } from '../../lib/auth';
import { listarEmpleadosAdmin } from '../../lib/empleados-repo';
import { listarSedes } from '../../lib/sedes-repo';
import { listarRoles } from '../../lib/roles-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { EmpleadosCliente } from './cliente';

export default async function EmpleadosPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Colaboradores" subtitle="Gestión del equipo" />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            Solo los administradores pueden gestionar colaboradores.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [empleados, sedes, rolesDerivados] = await Promise.all([
    listarEmpleadosAdmin(),
    listarSedes().catch(() => []),
    // roles derivados (migración 0050): si aún no se aplicó, no tumbar la página — sin roles
    // derivados el picker solo muestra los 7 base.
    listarRoles().catch(() => []),
  ]);
  const activos = empleados.filter((e) => e.activo).length;

  return (
    <div>
      <PageHeader
        title="Gestión de colaboradores"
        subtitle={`${empleados.length} colaboradores · ${activos} activos`}
      />
      <EmpleadosCliente empleados={empleados} sedes={sedes} rolesDerivados={rolesDerivados} />
    </div>
  );
}
