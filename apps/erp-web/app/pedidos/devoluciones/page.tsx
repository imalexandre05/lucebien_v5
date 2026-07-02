import Link from 'next/link';
import { pedidosRepo } from '../../../lib/pedidos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { cn } from '../../../lib/cn';

// Alertas de devolución (contrato S12): alquileres con fecha de devolución, marcados por
// vencimiento (vencido / hoy / próximo). Excluye pedidos ya cerrados/devueltos/anulados.
function hoyPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}
function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00`).getTime();
  const b = new Date(`${hasta}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function StatBox({ label, valor, tone }: { label: string; valor: number; tone: string }) {
  return (
    <div className={cn('rounded-xl border p-4 text-center', tone)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-2xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

const CERRADOS = ['cerrado', 'devuelto', 'anulado'];

export default async function DevolucionesPage() {
  const pedidos = await pedidosRepo.listar();
  const hoy = hoyPeru();
  const items = pedidos
    .filter((p) => p.tipo === 'alquiler' && p.fechaDevolucion && !CERRADOS.includes(p.estado))
    .map((p) => ({ ...p, dias: diasEntre(hoy, p.fechaDevolucion as string) }))
    .sort((a, b) => ((a.fechaDevolucion ?? '') < (b.fechaDevolucion ?? '') ? -1 : 1));

  const vencidos = items.filter((i) => i.dias < 0).length;
  const deHoy = items.filter((i) => i.dias === 0).length;
  const proximos = items.filter((i) => i.dias > 0 && i.dias <= 3).length;

  const alerta = (dias: number) => {
    if (dias < 0) return { label: `Vencido ${-dias}d`, cls: 'bg-red-50 text-red-700' };
    if (dias === 0) return { label: 'Hoy', cls: 'bg-amber-50 text-amber-700' };
    if (dias <= 3) return { label: `En ${dias}d`, cls: 'bg-gold/20 text-[#7a6e0e]' };
    return { label: `En ${dias}d`, cls: 'bg-ink/10 text-muted' };
  };

  return (
    <div>
      <PageHeader
        title="Devoluciones"
        subtitle="Alquileres pendientes de retorno"
        action={
          <Link href="/pedidos" className="text-sm text-muted transition-colors hover:text-navy">
            ← Pedidos
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatBox label="Vencidos" valor={vencidos} tone="border-red-200 bg-red-50 text-red-700" />
        <StatBox label="Hoy" valor={deHoy} tone="border-amber-200 bg-amber-50 text-amber-700" />
        <StatBox label="Próximos (3d)" valor={proximos} tone="border-gold/30 bg-gold/10 text-[#7a6e0e]" />
      </div>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Cliente</TH>
                <TH>Prenda</TH>
                <TH>Entrega</TH>
                <TH>Devolución</TH>
                <TH>Estado</TH>
                <TH className="pr-5">Alerta</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((p) => {
                const a = alerta(p.dias);
                return (
                  <TR key={p.id} className={cn(p.dias < 0 && 'bg-red-50/40')}>
                    <TD className="pl-5">
                      <Link href={`/pedidos/${p.id}`} className="font-medium text-navy transition-colors hover:text-gold">
                        {p.clienteNombre ?? '—'}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{p.detalle}</TD>
                    <TD className="font-mono text-xs text-muted">{p.fecha}</TD>
                    <TD className="font-mono text-xs text-navy">{p.fechaDevolucion}</TD>
                    <TD className="capitalize">{p.estado}</TD>
                    <TD className="pr-5">
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', a.cls)}>
                        {a.label}
                      </span>
                    </TD>
                  </TR>
                );
              })}
              {items.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={6}>
                    Sin alquileres pendientes de devolución.
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
