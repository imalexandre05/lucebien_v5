import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { pedidosRepo } from '../../../lib/pedidos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge, type Tone } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { PedidoAcciones } from './acciones';

const TIPO_TONE: Record<string, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green', confeccion: 'amber' };
const TIPO_LABEL: Record<string, string> = { alquiler: 'Alquiler', venta: 'Venta', servicio: 'Servicio', confeccion: 'Confección' };

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line/60 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy">{children}</dd>
    </div>
  );
}

export default async function PedidoDetalle({ params }: { params: { id: string } }) {
  const p = await pedidosRepo.obtener(params.id);
  if (!p) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Pedido · ${TIPO_LABEL[p.tipo] ?? p.tipo}`}
        subtitle={p.clienteNombre ?? ''}
        action={
          p.tipo === 'alquiler' ? (
            <Link href={`/pedidos/${p.id}/contrato`} className={buttonVariants({ variant: 'outline' })}>
              <FileText className="h-4 w-4" strokeWidth={1.75} />
              Contrato
            </Link>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="pt-2">
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <Campo label="Cliente">{p.clienteNombre ?? '—'}</Campo>
            <Campo label="Tipo">
              <Badge tone={TIPO_TONE[p.tipo] ?? 'gray'}>{TIPO_LABEL[p.tipo] ?? p.tipo}</Badge>
            </Campo>
            <Campo label="Detalle">
              <span className="font-mono">{p.detalle}</span>
            </Campo>
            <Campo label="Sede">{p.sedeCod}</Campo>
            <Campo label="Fecha">
              <span className="font-mono">{p.fecha}</span>
            </Campo>
            <Campo label="Estado">
              <span className="capitalize">{p.estado}</span>
            </Campo>
            {p.tipo === 'alquiler' && (
              <>
                <Campo label="Devolución">
                  <span className="font-mono">{p.fechaDevolucion || '—'}</span>
                </Campo>
                <Campo label="Garantía">
                  <span className="font-mono tabular-nums">S/ {p.garantiaMonto.toFixed(2)}</span>
                </Campo>
              </>
            )}
            {(p.tipo === 'venta' || p.tipo === 'confeccion') && (
              <Campo label="Entrega">
                <span className="font-mono">{p.fechaEntrega || '—'}</span>
              </Campo>
            )}
            {p.tipo === 'confeccion' && (
              <>
                <Campo label="Tela">{p.tela || '—'}</Campo>
                <Campo label="Prueba">
                  <span className="font-mono">{p.fechaPrueba || '—'}</span>
                </Campo>
                <Campo label="2ª prueba">
                  <span className="font-mono">{p.fechaSegundaPrueba || '—'}</span>
                </Campo>
              </>
            )}
            <Campo label="Total">
              <span className="font-mono tabular-nums">S/ {p.total.toFixed(2)}</span>
            </Campo>
            {p.notas && (
              <div className="sm:col-span-2">
                <Campo label="Notas de ajuste">{p.notas}</Campo>
              </div>
            )}
          </dl>
          <PedidoAcciones pedido={p} />
        </CardContent>
      </Card>
      <Link href="/pedidos" className="mt-4 inline-block text-sm text-muted transition-colors duration-150 hover:text-navy">
        ← Volver a pedidos
      </Link>
    </div>
  );
}
