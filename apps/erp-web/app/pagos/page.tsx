import { redirect } from 'next/navigation';
import { puede, type MatrizPermisos } from '@scilb/core';
import { listarPagos, empleadosParaPago } from '../../lib/pagos-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { tieneReauth } from '../../lib/reauth';
import { PageHeader } from '../../components/shell/page-header';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { PagosCliente } from './cliente';

// Gate server-side (Fase 1): antes solo se ocultaba del sidebar — cualquiera que supiera la URL
// entraba igual. Ahora valida permiso ('pagos'.'ver') y pide reautenticación (montos/salarios,
// PC compartida) antes de tocar la BD.
export default async function PagosPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'pagos', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';

  if (!(await tieneReauth(sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Pagos" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Pagos muestra montos y salarios del equipo." />
      </div>
    );
  }

  const [pagos, empleados] = await Promise.all([listarPagos(), empleadosParaPago()]);

  return (
    <div>
      <PageHeader title="Pagos" subtitle={`${pagos.length} registrados`} />
      <PagosCliente pagos={pagos} empleados={empleados} esAdmin={esAdmin} />
    </div>
  );
}
