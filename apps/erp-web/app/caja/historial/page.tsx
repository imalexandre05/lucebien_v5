import Link from 'next/link';
import { historialCaja } from '../../../lib/caja-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { cn } from '../../../lib/cn';

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

export default async function HistorialCajaPage() {
  const sesiones = await historialCaja();

  return (
    <div>
      <PageHeader
        title="Historial de caja"
        subtitle="Sesiones y arqueos"
        action={
          <Link href="/caja" className="text-sm text-muted transition-colors hover:text-navy">
            ← Caja
          </Link>
        }
      />

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Sede</TH>
                <TH className="text-right">Apertura</TH>
                <TH className="text-right">Ingresos</TH>
                <TH className="text-right">Egresos</TH>
                <TH className="text-right">Arqueo</TH>
                <TH className="text-right">Diferencia</TH>
                <TH className="pr-5">Estado</TH>
              </TR>
            </THead>
            <TBody>
              {sesiones.map((s) => (
                <TR key={s.id}>
                  <TD className="pl-5 tabular-nums text-xs text-muted">{s.fecha}</TD>
                  <TD className="tabular-nums">{s.sedeCod}</TD>
                  <TD className="text-right tabular-nums">{soles(s.montoApertura)}</TD>
                  <TD className="text-right tabular-nums text-exito-deep">{soles(s.ingresos)}</TD>
                  <TD className="text-right tabular-nums text-error-deep">{soles(s.egresos)}</TD>
                  <TD className="text-right tabular-nums">{s.montoCierre == null ? '—' : soles(s.montoCierre)}</TD>
                  <TD className="text-right">
                    {s.diferencia == null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span
                        className={cn(
                          'tabular-nums text-xs font-medium',
                          Math.abs(s.diferencia) < 0.01 ? 'text-exito-deep' : 'text-aviso-deep',
                        )}
                      >
                        {soles(s.diferencia)}
                      </span>
                    )}
                  </TD>
                  <TD className="pr-5">
                    <Badge tone={s.estado === 'abierta' ? 'green' : 'gray'}>{s.estado}</Badge>
                  </TD>
                </TR>
              ))}
              {sesiones.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={8}>
                    Sin sesiones de caja todavía.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
