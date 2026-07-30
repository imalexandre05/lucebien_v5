import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { pedidosRepo } from '../../../lib/pedidos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge, type Tone } from '../../../components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { buttonVariants } from '../../../components/ui/button';
import { PedidoAcciones } from './acciones';

const TIPO_TONE: Record<string, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green', confeccion: 'amber', mixto: 'gray' };
const TIPO_LABEL: Record<string, string> = { alquiler: 'Alquiler', venta: 'Venta', servicio: 'Servicio', confeccion: 'Confección', mixto: 'Mixto' };
const ESTADO_ITEM_LABEL: Record<string, string> = { activo: 'Activo', devuelto: 'Devuelto', cancelado: 'Cancelado' };
const GARANTIA_LABEL: Record<string, string> = { efectivo: 'Efectivo', documento: 'Documento', ninguna: 'Ninguna' };

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
    <div className="max-w-3xl">
      <PageHeader
        title={`Pedido ${p.codigo} · ${TIPO_LABEL[p.tipo] ?? p.tipo}`}
        subtitle={p.clienteNombre ?? ''}
        action={
          p.items.some((i) => i.tipo === 'alquiler') ? (
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
            <Campo label="Sede">{p.sedeCod}</Campo>
            <Campo label="Fecha">
              <span className="font-mono">{p.fecha}</span>
            </Campo>
            <Campo label="Estado">
              <span className="capitalize">{p.estado}</span>
            </Campo>
            <Campo label="Vendido por">
              <span className="font-mono">{p.creadoPorCod ?? '—'}</span>
            </Campo>
            {p.fechaDevolucion && (
              <Campo label="Devolución">
                <span className="font-mono">{p.fechaDevolucion}</span>
              </Campo>
            )}
            {p.fechaEntrega && (
              <Campo label="Entrega">
                <span className="font-mono">{p.fechaEntrega}</span>
              </Campo>
            )}
          </dl>

          <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-muted">Ítems ({p.items.length})</p>
          <div className="overflow-x-auto rounded-md border border-line">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-3">Tipo</TH>
                  <TH>Detalle</TH>
                  <TH className="text-right">Cant.</TH>
                  <TH className="text-right">P. unit.</TH>
                  <TH className="text-right">Subtotal</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {p.items.map((it) => (
                  <TR key={it.id}>
                    <TD className="pl-3">
                      <Badge tone={TIPO_TONE[it.tipo] ?? 'gray'}>{TIPO_LABEL[it.tipo] ?? it.tipo}</Badge>
                    </TD>
                    <TD className="font-mono text-xs">
                      {it.activoCodigo ?? it.descripcion ?? '—'}
                      {it.esCortesia && <Badge tone="green" className="ml-2">CORTESÍA</Badge>}
                    </TD>
                    <TD className="text-right font-mono">{it.cantidad}</TD>
                    <TD className="text-right font-mono tabular-nums">S/ {it.precioUnitario.toFixed(2)}</TD>
                    <TD className="text-right font-mono tabular-nums">S/ {it.subtotal.toFixed(2)}</TD>
                    <TD className="capitalize">{ESTADO_ITEM_LABEL[it.estado] ?? it.estado}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-8 sm:grid-cols-4">
            <Campo label="Total">
              <span className="font-mono tabular-nums">S/ {p.total.toFixed(2)}</span>
            </Campo>
            <Campo label="Cobrado">
              <span className="font-mono tabular-nums">S/ {p.cobrado.toFixed(2)}</span>
            </Campo>
            <Campo label="Saldo">
              <span className="font-mono tabular-nums font-semibold text-navy">S/ {p.saldo.toFixed(2)}</span>
            </Campo>
            <Campo label="Estado de pago">
              <span className="capitalize">{p.estadoPago}</span>
            </Campo>
          </dl>

          {p.garantia && p.garantia.tipo !== 'ninguna' && (
            <dl className="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-3">
              <Campo label="Garantía">{GARANTIA_LABEL[p.garantia.tipo]}</Campo>
              {p.garantia.tipo === 'efectivo' && (
                <Campo label="Monto">
                  <span className="font-mono tabular-nums">S/ {(p.garantia.monto ?? 0).toFixed(2)}</span>
                </Campo>
              )}
              {p.garantia.tipo === 'documento' && (
                <Campo label="Documento">
                  {p.garantia.documentoTipo} · {p.garantia.documentoNum}
                </Campo>
              )}
              <Campo label="Estado de la garantía">
                <span className="capitalize">{p.garantia.estado}</span>
              </Campo>
            </dl>
          )}

          {p.notas && (
            <div className="mt-2">
              <Campo label="Notas de ajuste">{p.notas}</Campo>
            </div>
          )}

          <PedidoAcciones pedido={p} />
        </CardContent>
      </Card>
      <Link href="/pedidos" className="mt-4 inline-block text-sm text-muted transition-colors duration-150 hover:text-navy">
        ← Volver a pedidos
      </Link>
    </div>
  );
}
