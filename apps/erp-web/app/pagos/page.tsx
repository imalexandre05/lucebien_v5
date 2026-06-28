import { listarPagos, empleadosParaPago } from '../../lib/pagos-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { PagosCliente } from './cliente';

export default async function PagosPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  const [pagos, empleados] = await Promise.all([listarPagos(), empleadosParaPago()]);

  return (
    <div>
      <PageHeader title="Pagos" subtitle={`${pagos.length} registrados`} />
      <PagosCliente pagos={pagos} empleados={empleados} esAdmin={esAdmin} />
    </div>
  );
}
