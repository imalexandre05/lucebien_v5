import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSesion } from '../../lib/auth';
import { tieneReauth } from '../../lib/reauth';
import { listarMisLiquidaciones } from '../../lib/sueldos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Wallet } from 'lucide-react';
import { EmptyState } from '../../components/ui/empty-state';

// tablero#32. Cada persona ve SOLO sus liquidaciones cerradas. El aislamiento (no-negociable 3) lo
// pone la RLS de sueldo_liquidaciones; el cliente es el de la sesión, nunca el admin.
const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function MiPagoPage() {
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

  const liquidaciones = await listarMisLiquidaciones(sesion.usuario.id);

  return (
    <div>
      <PageHeader title="Mi pago" subtitle="Tus liquidaciones cerradas" />
      {liquidaciones.length === 0 ? (
        <EmptyState icon={Wallet} titulo="Todavía no hay liquidaciones">Cuando se cierre tu primer período, aparecerá aquí.</EmptyState>
      ) : (
        <ul className="mx-auto max-w-2xl space-y-3">
          {liquidaciones.map((l) => (
            <li key={l.id}>
              <Link href={`/mi-pago/${l.id}`} className="block">
                <Card interactive>
                  <CardContent className="flex items-center justify-between gap-4 pt-4">
                    <div>
                      <div className="tabular-nums text-dato font-semibold text-navy">
                        {l.periodoDesde} → {l.periodoHasta}
                      </div>
                      <div className="mt-1 tabular-nums text-apoyo text-muted">Total {soles(l.total)}</div>
                    </div>
                    <Badge tone={l.resumen.cancelado ? 'green' : 'amber'}>
                      {l.resumen.cancelado ? 'Cancelado' : `Falta ${soles(l.resumen.restante)}`}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
