import Link from 'next/link';
import { nivelDevolucion } from '@scilb/core';
import { pedidosRepo } from '../../../lib/pedidos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { StatBox } from '../../../components/ui/stat-box';
import { cn } from '../../../lib/cn';
import { hoyPeru } from '../../../lib/fechas';

// Alertas de devolución (contrato S12): alquileres con fecha de devolución, marcados por
// vencimiento (vencido / hoy / próximo). Excluye pedidos ya cerrados/devueltos/anulados.
function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00`).getTime();
  const b = new Date(`${hasta}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Bug real corregido (Fase 8): el core define 'cancelado', nunca 'anulado' — con el literal
// viejo, los pedidos cancelados seguían apareciendo como devoluciones pendientes.
const CERRADOS = ['cerrado', 'devuelto', 'cancelado'];

export default async function DevolucionesPage() {
  const pedidos = await pedidosRepo.listar();
  const hoy = hoyPeru();
  // Fase 9: un pedido 'mixto' (alquiler + venta en la misma visita) también puede tener una
  // devolución pendiente — filtrar por `p.tipo === 'alquiler'` (cabecera) lo excluía. La fuente
  // correcta es si el pedido tiene alguna LÍNEA de alquiler todavía activa.
  const items = pedidos
    .filter((p) => p.items.some((i) => i.tipo === 'alquiler' && i.estado === 'activo') && p.fechaDevolucion && !CERRADOS.includes(p.estado))
    .map((p) => ({ ...p, dias: diasEntre(hoy, p.fechaDevolucion as string) }))
    .sort((a, b) => ((a.fechaDevolucion ?? '') < (b.fechaDevolucion ?? '') ? -1 : 1));

  const vencidos = items.filter((i) => nivelDevolucion(i.dias) === 'vencido').length;
  const deHoy = items.filter((i) => nivelDevolucion(i.dias) === 'hoy').length;
  const proximos = items.filter((i) => nivelDevolucion(i.dias) === 'proximo').length;

  const NIVEL_CLS = {
    vencido: 'bg-error-soft text-error-deep',
    hoy: 'bg-aviso-soft text-aviso-deep',
    proximo: 'bg-gold/20 text-gold-deep',
    futuro: 'bg-ink/10 text-muted',
  } as const;
  const alerta = (dias: number) => {
    const nivel = nivelDevolucion(dias);
    const label = nivel === 'vencido' ? `Vencido ${-dias}d` : nivel === 'hoy' ? 'Hoy' : `En ${dias}d`;
    return { label, cls: NIVEL_CLS[nivel] };
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
        <StatBox index={0} label="Vencidos" valor={vencidos} tone="error" />
        <StatBox index={1} label="Hoy" valor={deHoy} tone="aviso" />
        <StatBox index={2} label="Próximos (3d)" valor={proximos} tone="gold" />
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
                  <TR key={p.id} className={cn(p.dias < 0 && 'bg-error-soft/40')}>
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
