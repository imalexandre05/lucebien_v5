import { getSesion } from '../../lib/auth';
import { sesionAbierta, movimientosSesion, cobrosPendientes, resumenMovimientos } from '../../lib/caja-repo';
import { PageHeader } from '../../components/shell/page-header';
import { CajaCliente } from './cliente';

export default async function CajaPage() {
  const sesion = await getSesion();
  const sede = sesion?.usuario.sede ?? '';
  const [ses, pendientes] = await Promise.all([sesionAbierta(sede), cobrosPendientes()]);
  const movimientos = ses ? await movimientosSesion(ses.id) : [];
  const resumen = ses ? resumenMovimientos(ses, movimientos) : null;

  return (
    <div>
      <PageHeader title="Caja" subtitle={`Sede ${sede || '—'} · cobros y arqueo diario`} />
      <CajaCliente sede={sede} sesion={ses} movimientos={movimientos} resumen={resumen} pendientes={pendientes} />
    </div>
  );
}
