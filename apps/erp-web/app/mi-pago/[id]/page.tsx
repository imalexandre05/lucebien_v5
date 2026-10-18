import { notFound, redirect } from 'next/navigation';
import { getSesion } from '../../../lib/auth';
import { tieneReauth } from '../../../lib/reauth';
import { obtenerMiLiquidacion } from '../../../lib/sueldos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { ReauthGate } from '../../../components/ui/reauth-gate';
import { PrintButton } from '../../../components/print-button';
import { ResumenLiquidacionVista } from '../../../components/liquidacion/resumen-liquidacion';

export default async function MiLiquidacionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  if (!(await tieneReauth(sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Mi pago" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Tu liquidación es información personal." />
      </div>
    );
  }

  // Sólo la propia y cerrada: de otra persona devuelve null → 404, igual que una que no existe.
  const liq = await obtenerMiLiquidacion(sesion.usuario.id, id);
  if (!liq) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mi pago"
        subtitle={`${sesion.nombre} · ${liq.periodoDesde} → ${liq.periodoHasta}`}
        action={<PrintButton />}
      />
      <ResumenLiquidacionVista r={liq.resumen} pagoDisponible={liq.pagoDisponible} horas={liq.horas} />
    </div>
  );
}
