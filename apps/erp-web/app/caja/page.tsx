import Link from 'next/link';
import { History } from 'lucide-react';
import { getSesion } from '../../lib/auth';
import { sesionAbierta, movimientosSesion, cobrosPendientes, resumenMovimientos } from '../../lib/caja-repo';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { CajaCliente } from './cliente';

export default async function CajaPage() {
  const sesion = await getSesion();
  const sede = sesion?.usuario.sede ?? '';
  const [ses, pendientes] = await Promise.all([sesionAbierta(sede), cobrosPendientes()]);
  const movimientos = ses ? await movimientosSesion(ses.id) : [];
  const resumen = ses ? resumenMovimientos(ses, movimientos) : null;

  return (
    <div>
      <PageHeader
        title="Caja"
        subtitle={`Sede ${sede || '—'} · cobros y arqueo diario`}
        action={
          <Link href="/caja/historial" className={buttonVariants({ variant: 'outline' })}>
            <History className="h-4 w-4" strokeWidth={1.75} /> Historial
          </Link>
        }
      />
      <CajaCliente sede={sede} sesion={ses} movimientos={movimientos} resumen={resumen} pendientes={pendientes} />
    </div>
  );
}
