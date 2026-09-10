'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Undo2, Wallet, CircleDollarSign } from 'lucide-react';
import { nivelDevolucion, type Pedido, type TipoPedido } from '@scilb/core';
import { accionCambiarEstadoPedido, accionCobrarSaldoPedido } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { MetodoPagoBotones } from '../../components/ui/metodo-pago-botones';
import { MontoInput } from '../../components/ui/monto-input';
import { EmptyState } from '../../components/ui/empty-state';
import { Aviso } from '../../components/ui/form';
import { cn } from '../../lib/cn';

const TIPO_TONE: Record<TipoPedido, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green', confeccion: 'amber', mixto: 'gray' };
const TIPO_LABEL: Record<TipoPedido, string> = { alquiler: 'Alquiler', venta: 'Venta', servicio: 'Servicio', confeccion: 'Confección', mixto: 'Mixto' };
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

type FiltroKey = 'saldo' | 'devolucionesHoy' | 'vencidos' | 'delDia';

function Chip({ label, count, active, onClick, testId }: { label: string; count: number; active: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'rounded-r-pastilla border px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
      )}
    >
      {label} <span className="tabular-nums">{count}</span>
    </button>
  );
}

// ⑥ PENDIENTES — con saldo / devoluciones hoy / vencidas / del día, con acciones inline (cobrar
// saldo, devolver, contrato) sin navegar fuera de /pedidos. Recibe la lista completa (ya trae
// items/garantía) y filtra en cliente: el volumen de pedidos de LuceBien es chico, no justifica
// un round-trip por filtro (mismo criterio que ActivoPicker/ClientePanel).
export function PedidosPendientes({
  pedidos,
  hoy,
  metodosPago,
}: {
  pedidos: Pedido[];
  hoy: string;
  metodosPago?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<FiltroKey | null>(null);
  const [filaCobro, setFilaCobro] = useState<string | null>(null);
  const [montoCobro, setMontoCobro] = useState(0);
  const [metodoCobro, setMetodoCobro] = useState('efectivo');
  const [error, setError] = useState<string | null>(null);

  const activos = pedidos.filter((p) => p.estado !== 'cancelado' && p.estado !== 'cerrado');
  const tieneAlquilerActivo = (p: Pedido) => p.items.some((i) => i.tipo === 'alquiler' && i.estado === 'activo');

  const conSaldo = activos.filter((p) => p.saldo > 0);
  const devolucionesHoy = activos.filter((p) => tieneAlquilerActivo(p) && p.fechaDevolucion === hoy);
  const vencidos = activos.filter((p) => tieneAlquilerActivo(p) && p.fechaDevolucion && nivelDevolucion(diasEntre(hoy, p.fechaDevolucion)) === 'vencido');
  const delDia = pedidos.filter((p) => p.fecha === hoy);

  const listas: Record<FiltroKey, Pedido[]> = { saldo: conSaldo, devolucionesHoy, vencidos, delDia };
  const visibles = useMemo(() => {
    const base = filtro ? listas[filtro] : [...activos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15);
    return base;
  }, [filtro, activos, conSaldo, devolucionesHoy, vencidos, delDia]);

  function toggleFiltro(f: FiltroKey) {
    setFiltro((cur) => (cur === f ? null : f));
    setFilaCobro(null);
  }

  function devolver(p: Pedido) {
    setError(null);
    startTransition(async () => {
      const r = await accionCambiarEstadoPedido(p.id, 'devuelto');
      if (!r.ok) {
        setError(r.error ?? 'Error al devolver');
        return;
      }
      router.refresh();
    });
  }

  function abrirCobro(p: Pedido) {
    setFilaCobro(p.id);
    setMontoCobro(p.saldo);
    setMetodoCobro('efectivo');
    setError(null);
  }

  function confirmarCobro(p: Pedido) {
    setError(null);
    startTransition(async () => {
      const r = await accionCobrarSaldoPedido(p.id, montoCobro, metodoCobro);
      if (!r.ok) {
        setError(r.error ?? 'Error al cobrar');
        return;
      }
      setFilaCobro(null);
      router.refresh();
    });
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted">⑥ Pendientes</h2>
          <Chip label="Con saldo" count={conSaldo.length} active={filtro === 'saldo'} onClick={() => toggleFiltro('saldo')} testId="filtro-saldo" />
          <Chip label="Devoluciones hoy" count={devolucionesHoy.length} active={filtro === 'devolucionesHoy'} onClick={() => toggleFiltro('devolucionesHoy')} testId="filtro-dev-hoy" />
          <Chip label="Vencidos" count={vencidos.length} active={filtro === 'vencidos'} onClick={() => toggleFiltro('vencidos')} testId="filtro-vencidos" />
          <Chip label="Del día" count={delDia.length} active={filtro === 'delDia'} onClick={() => toggleFiltro('delDia')} testId="filtro-del-dia" />
        </div>

        {error && <Aviso tono="error" className="mb-2 text-sm">{error}</Aviso>}

        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Pedido</TH>
                <TH>Cliente</TH>
                <TH>Tipo</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Saldo</TH>
                <TH>Devolución</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {visibles.map((p) => (
                <Fragment key={p.id}>
                  <TR data-testid="pendiente-fila">
                    <TD>
                      <Link href={`/pedidos/${p.id}`} className="tabular-nums text-xs font-medium text-navy hover:text-gold">
                        {p.codigo}
                      </Link>
                    </TD>
                    <TD className="text-sm">{p.clienteNombre ?? '—'}</TD>
                    <TD>
                      <Badge tone={TIPO_TONE[p.tipo]}>{TIPO_LABEL[p.tipo]}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums text-xs">{soles(p.total)}</TD>
                    <TD className={cn('text-right tabular-nums text-xs', p.saldo > 0 && 'font-semibold text-aviso-deep')}>{soles(p.saldo)}</TD>
                    <TD className="tabular-nums text-xs text-muted">{p.fechaDevolucion ?? '—'}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {p.saldo > 0 && (
                          <button
                            type="button"
                            data-testid="accion-cobrar-saldo"
                            onClick={() => abrirCobro(p)}
                            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-navy transition-colors hover:border-gold"
                          >
                            <Wallet className="h-3.5 w-3.5" strokeWidth={2} /> Cobrar saldo
                          </button>
                        )}
                        {tieneAlquilerActivo(p) && (
                          <button
                            type="button"
                            data-testid="accion-devolver"
                            disabled={pending}
                            onClick={() => devolver(p)}
                            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-navy transition-colors hover:border-gold disabled:opacity-50"
                          >
                            <Undo2 className="h-3.5 w-3.5" strokeWidth={2} /> Devolver
                          </button>
                        )}
                        {p.items.some((i) => i.tipo === 'alquiler') && (
                          <Link
                            href={`/pedidos/${p.id}/contrato`}
                            className="toque inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-navy transition-colors hover:border-gold"
                          >
                            <FileText className="h-3.5 w-3.5" strokeWidth={2} /> Contrato
                          </Link>
                        )}
                      </div>
                    </TD>
                  </TR>
                  {filaCobro === p.id && (
                    <TR>
                      <TD colSpan={7} className="bg-navy/5">
                        <div className="flex flex-wrap items-end gap-3 py-1">
                          <MontoInput value={montoCobro} onChange={setMontoCobro} total={p.saldo} label="Monto" testId="cobro-saldo-monto" />
                          <div>
                            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Método</label>
                            <MetodoPagoBotones value={metodoCobro} onChange={setMetodoCobro} opciones={metodosPago} />
                          </div>
                          <button
                            type="button"
                            data-testid="cobro-saldo-confirmar"
                            disabled={pending || montoCobro <= 0}
                            onClick={() => confirmarCobro(p)}
                            className="rounded-md bg-navy px-3 py-2 text-xs font-medium text-paper transition-colors hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {pending ? 'Cobrando…' : 'Confirmar cobro'}
                          </button>
                          <button type="button" onClick={() => setFilaCobro(null)} className="text-xs text-muted hover:text-navy">
                            Cancelar
                          </button>
                        </div>
                      </TD>
                    </TR>
                  )}
                </Fragment>
              ))}
              {visibles.length === 0 && (
                <TR>
                  <TD colSpan={7} className="px-5 py-8">
                    <EmptyState icon={CircleDollarSign} titulo="Sin pendientes en este filtro" compacto />
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00`).getTime();
  const b = new Date(`${hasta}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}
