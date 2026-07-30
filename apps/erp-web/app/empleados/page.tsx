import { redirect } from 'next/navigation';
import type { MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { listarEmpleadosAdmin } from '../../lib/empleados-repo';
import { listarSedes } from '../../lib/sedes-repo';
import { listarRoles } from '../../lib/roles-repo';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
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

  const [empleados, sedes, rolesDerivados, matrizPermisos] = await Promise.all([
    listarEmpleadosAdmin(),
    listarSedes().catch(() => []),
    // roles derivados (migración 0050): si aún no se aplicó, no tumbar la página — sin roles
    // derivados el picker solo muestra los 7 base.
    listarRoles().catch(() => []),
    // Fase 10, punto 4: para pintar el toggle "Opera caja" (permiso 'pos_cobro') sin tener que
    // navegar hasta /configuracion/permisos. Si la matriz aún no existe, todos quedan "sin caja"
    // (mismo comportamiento por defecto que puede() en el core).
    leerMatrizPermisos().catch((): MatrizPermisos => ({})),
  ]);
  const activos = empleados.filter((e) => e.activo).length;

  return (
    <div>
      <PageHeader
        title="Gestión de colaboradores"
        subtitle={`${empleados.length} colaboradores · ${activos} activos`}
      />
      <EmpleadosCliente empleados={empleados} sedes={sedes} rolesDerivados={rolesDerivados} matrizPermisos={matrizPermisos} />
    </div>
  );
}
