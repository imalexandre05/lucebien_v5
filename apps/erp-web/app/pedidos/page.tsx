import Link from 'next/link';
import { Plus, CalendarClock } from 'lucide-react';
import type { TipoPedido } from '@scilb/core';
import { pedidosRepo } from '../../lib/pedidos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';

const TIPO_TONE: Record<TipoPedido, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green' };

export default async function PedidosPage() {
  const pedidos = await pedidosRepo.listar();
  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Alquiler · venta · servicios"
        action={
          <div className="flex items-center gap-2">
            <Link href="/pedidos/devoluciones" className={buttonVariants({ variant: 'outline' })}>
              <CalendarClock className="h-4 w-4" strokeWidth={2} />
              Devoluciones
            </Link>
            <Link href="/pedidos/nuevo" className={buttonVariants({ variant: 'primary' })}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nuevo pedido
            </Link>
          </div>
        }
      />
      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Cliente</TH>
                <TH>Tipo</TH>
                <TH>Detalle</TH>
                <TH>Fecha</TH>
                <TH>Devolución</TH>
                <TH>Estado</TH>
                <TH className="pr-5 text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {pedidos.map((p) => (
                <TR key={p.id}>
                  <TD className="pl-5">
                    <Link href={`/pedidos/${p.id}`} className="font-medium text-navy transition-colors duration-150 hover:text-gold">
                      {p.clienteNombre ?? '—'}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={TIPO_TONE[p.tipo]}>{p.tipo}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{p.detalle}</TD>
                  <TD className="font-mono text-muted">{p.fecha}</TD>
                  <TD className="font-mono text-muted">{p.fechaDevolucion || '—'}</TD>
                  <TD className="capitalize">{p.estado}</TD>
                  <TD className="pr-5 text-right font-mono tabular-nums">S/ {p.total.toFixed(2)}</TD>
                </TR>
              ))}
              {pedidos.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={7}>
                    Sin pedidos todavía. Crea el primero.
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
