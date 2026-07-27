import { redirect } from 'next/navigation';
import type { MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import { leerMatrizPermisos } from '../../../lib/permisos-repo';
import { listarRoles } from '../../../lib/roles-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { PermisosCliente } from './cliente';

// Matriz de permisos por rol o rol derivado (Fase 1/4): qué módulos ve cada rol y con qué
// acciones (ver/crear/editar/eliminar). admin/dueno siempre ven todo (mecanismo del core, no se
// editan aquí). Solo admin/dueno acceden a esta página.
export default async function PermisosPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  // Roles derivados (migración 0050): si aún no se aplicó, la página sigue funcionando solo con
  // los 7 roles base (no tumba /configuracion/permisos).
  const rolesDerivados = await listarRoles().catch(() => []);

  return (
    <div>
      <PageHeader
        title="Permisos por rol"
        subtitle="Qué módulos ve cada rol y con qué acciones · admin y dueño siempre ven todo"
      />
      <PermisosCliente matrizInicial={matriz} rolesDerivadosIniciales={rolesDerivados} />
    </div>
  );
}
