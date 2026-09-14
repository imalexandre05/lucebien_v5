'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Check, PackageCheck } from 'lucide-react';
import type { Compra } from '../../lib/compras-repo';
import { recibirCompraAction, anularCompraAction } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Aviso } from '../../components/ui/form';
import { cn } from '../../lib/cn';

const soles = (n: number) => `S/ ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const ESTADO: Record<Compra['estado'], { label: string; tone: 'amber' | 'green' | 'gray' }> = {
  pendiente: { label: 'Por recibir', tone: 'amber' },
  recibida: { label: 'Recibida', tone: 'green' },
  anulada: { label: 'Anulada', tone: 'gray' },
};

export function ComprasCliente({ compras }: { compras: Compra[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function recibir(c: Compra) {
    if (!confirm(`¿Recibir la compra de ${c.proveedorNombre ?? 'proveedor'}? Subirá el stock de ${c.items.length} material(es).`)) return;
    startTransition(async () => {
      const err = await recibirCompraAction(c.id);
      setError(err);
      if (!err) router.refresh();
    });
  }

  function anular(c: Compra) {
    const aviso = c.estado === 'recibida' ? ' Se revertirá el stock ya ingresado.' : '';
    if (!confirm(`¿Anular esta compra?${aviso}`)) return;
    startTransition(async () => {
      const err = await anularCompraAction(c.id);
      setError(err);
      if (!err) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Proveedor</TH>
                <TH>Sede</TH>
                <TH>Contenido</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH className="pr-5 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {compras.map((c) => {
                const est = ESTADO[c.estado];
                return (
                  <TR key={c.id} className={cn(c.estado === 'anulada' && 'opacity-60')}>
                    <TD className="pl-5 tabular-nums text-dato text-muted">{c.fecha}</TD>
                    <TD className="text-cuerpo font-medium text-navy">{c.proveedorNombre ?? '—'}</TD>
                    <TD className="tabular-nums text-dato text-navy">{c.sedeCod}</TD>
                    <TD className="max-w-[22rem] text-cuerpo text-ink">
                      {c.items.map((i) => `${i.cantidad}× ${i.materialNombre ?? 'material'}`).join(' · ') || '—'}
                      {Boolean(c.obs) && <span className="block text-apoyo text-muted">{c.obs}</span>}
                    </TD>
                    <TD className="text-right tabular-nums text-dato text-navy">{soles(c.total)}</TD>
                    <TD>
                      <Badge tone={est.tone}>{est.label}</Badge>
                    </TD>
                    <TD className="pr-5">
                      <div className="flex items-center justify-end gap-2">
                        {c.estado === 'pendiente' && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => recibir(c)}
                            className="inline-flex items-center gap-1 rounded-r-pastilla bg-exito px-2.5 py-1.5 text-apoyo font-semibold text-white transition hover:bg-exito-deep active:scale-[.97]"
                          >
                            <PackageCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> Recibir
                          </button>
                        )}
                        {c.estado !== 'anulada' && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => anular(c)}
                            className="inline-flex items-center gap-1 rounded-r-pastilla border border-error-line px-2 py-1 text-apoyo text-error-deep transition hover:bg-error-soft"
                          >
                            <Ban className="h-3.5 w-3.5" strokeWidth={2} /> Anular
                          </button>
                        )}
                        {c.estado === 'recibida' && (
                          <span className="inline-flex items-center gap-1 text-apoyo text-exito-deep">
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> en stock
                          </span>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
              {compras.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={7}>
                    Aún no hay compras registradas.
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
