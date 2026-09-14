import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { type TipoPedido } from '@scilb/core';
import { pedidosRepo } from '../../../lib/pedidos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge, type Tone } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';

const TIPO_TONE: Record<TipoPedido, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green', confeccion: 'amber', mixto: 'gray' };
const TIPO_LABEL: Record<TipoPedido, string> = { alquiler: 'Alquiler', venta: 'Venta', servicio: 'Servicio', confeccion: 'Confección', mixto: 'Mixto' };

// Historial (Fase 9): navegar/buscar TODOS los pedidos — la tabla completa que antes vivía en el
// modal de /pedidos (app/pedidos/cliente.tsx, reemplazado por el constructor). No es el flujo
// principal (crear un pedido), es la vista de consulta — de ahí que sí sea una ruta propia, igual
// que /pedidos/devoluciones y /caja/historial.
export default async function PedidosHistorialPage() {
  const pedidos = await pedidosRepo.listar();

  return (
    <div>
      <PageHeader
        title="Historial de pedidos"
        subtitle={`${pedidos.length} pedido(s) registrados`}
        action={
          <Link href="/pedidos" className="text-cuerpo text-muted transition-colors hover:text-navy">
            ← Pedidos
          </Link>
        }
      />

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Pedido</TH>
                <TH>Cliente</TH>
                <TH>Tipo</TH>
                <TH>Detalle</TH>
                <TH>Fecha</TH>
                <TH>Devolución / Entrega</TH>
                <TH>Estado</TH>
                <TH className="pr-5 text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {pedidos.map((p) => (
                <TR key={p.id}>
                  <TD className="pl-5">
                    <Link href={`/pedidos/${p.id}`} className="tabular-nums text-dato font-medium text-navy transition-colors duration-150 hover:text-gold">
                      {p.codigo}
                    </Link>
                  </TD>
                  <TD className="font-medium text-navy">{p.clienteNombre ?? '—'}</TD>
                  <TD>
                    <Badge tone={TIPO_TONE[p.tipo]}>{TIPO_LABEL[p.tipo]}</Badge>
                  </TD>
                  <TD className="tabular-nums text-dato">{p.detalle}</TD>
                  <TD className="tabular-nums text-muted">{p.fecha}</TD>
                  <TD className="tabular-nums text-muted">{p.fechaDevolucion || p.fechaEntrega || '—'}</TD>
                  <TD className="capitalize">{p.estado}</TD>
                  <TD className="pr-5 text-right tabular-nums">S/ {p.total.toFixed(2)}</TD>
                </TR>
              ))}
              {pedidos.length === 0 && (
                <TR>
                  <TD colSpan={8} className="px-5 py-10">
                    <EmptyState icon={ShoppingBag} titulo="Sin pedidos todavía">
                      Créalo desde &ldquo;Pedidos&rdquo; con el constructor.
                    </EmptyState>
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
