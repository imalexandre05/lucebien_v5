import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { TipoPedido } from '@scilb/core';
import { clientesRepo } from '../../../lib/clientes-repo';
import { pedidosRepo } from '../../../lib/pedidos-repo';
import { metricasCRM, type SegmentoCliente } from '../../../lib/crm-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge, type Tone } from '../../../components/ui/badge';
import { cn } from '../../../lib/cn';

const TIPO_TONE: Record<TipoPedido, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green', confeccion: 'amber', mixto: 'gray' };
const SEG_LABEL: Record<SegmentoCliente, string> = { vip: 'VIP', recurrente: 'Recurrente', nuevo: 'Nuevo' };
const SEG_CLS: Record<SegmentoCliente, string> = {
  vip: 'bg-gold/20 text-gold-deep',
  recurrente: 'bg-navy/10 text-navy',
  nuevo: 'bg-ink/10 text-muted',
};

export default async function ClienteDetalle({ params }: { params: { id: string } }) {
  const [clientes, pedidos] = await Promise.all([
    clientesRepo.listar(),
    pedidosRepo.porCliente(params.id),
  ]);
  const cliente = clientes.find((c) => c.id === params.id);
  if (!cliente) notFound();

  const m = metricasCRM(pedidos);
  const totalGastado = m.totalGastado;
  const kpis = [
    { label: 'Pedidos', value: String(pedidos.length) },
    { label: 'Total gastado', value: `S/ ${totalGastado.toFixed(2)}` },
    { label: 'Sede', value: cliente.sedeCod || '—' },
  ];

  return (
    <div>
      <PageHeader title={cliente.nombre} subtitle="Ficha 360 · historial del cliente" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k, i) => (
          <Card key={k.label} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="pt-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">{k.label}</div>
              <div className="mt-2 tabular-nums text-2xl font-semibold text-navy">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-line/60 py-1.5">
              <span className="text-muted">DNI</span>
              <span className="tabular-nums text-navy">{cliente.dni || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-line/60 py-1.5">
              <span className="text-muted">Teléfono</span>
              <span className="tabular-nums text-navy">{cliente.telefono || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-line/60 py-1.5">
              <span className="text-muted">Talla</span>
              <span className="text-navy">{cliente.medidas.talla || '—'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line/60 py-1.5">
              <span className="text-muted">Segmento</span>
              <span className={cn('inline-flex items-center rounded-r-pastilla px-2.5 py-0.5 text-xs font-medium', SEG_CLS[m.segmento])}>
                {SEG_LABEL[m.segmento]}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted">Última compra</span>
              <span className="text-navy">{m.diasSinComprar == null ? '—' : `hace ${m.diasSinComprar} d`}</span>
            </div>
            {m.seguir && (
              <p className="mt-1 rounded bg-aviso-soft px-2 py-1 text-micro text-aviso-deep">
                Cliente inactivo — conviene reactivar.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Historial de pedidos</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-1">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Tipo</TH>
                  <TH>Detalle</TH>
                  <TH>Fecha</TH>
                  <TH className="pr-5 text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {pedidos.map((p) => (
                  <TR key={p.id}>
                    <TD className="pl-5">
                      <Badge tone={TIPO_TONE[p.tipo]}>{p.tipo}</Badge>
                    </TD>
                    <TD className="tabular-nums text-xs">{p.detalle}</TD>
                    <TD className="tabular-nums text-muted">{p.fecha}</TD>
                    <TD className="pr-5 text-right tabular-nums">S/ {p.total.toFixed(2)}</TD>
                  </TR>
                ))}
                {pedidos.length === 0 && (
                  <TR>
                    <TD className="px-5 py-6 text-center text-muted" colSpan={4}>
                      Sin pedidos registrados.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Link href="/clientes" className="mt-4 inline-block text-sm text-muted transition-colors duration-150 hover:text-navy">
        ← Volver a clientes
      </Link>
    </div>
  );
}
