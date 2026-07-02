'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowDownCircle, ArrowUpCircle, Lock, Wallet, Shield } from 'lucide-react';
import type { CajaSesion, CajaMovimiento, CobroPendiente } from '../../lib/caja-repo';
import { accionAbrirCaja, accionCerrarCaja, accionRegistrarCobro, accionRegistrarEgreso, accionRegistrarGarantia } from './actions';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';

type Resumen = {
  ingresos: number;
  egresos: number;
  neto: number;
  efectivoEsperado: number;
  efectivo: number;
  yape: number;
  transferencia: number;
};

const METODOS = ['efectivo', 'yape', 'transferencia'];
const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const fieldCls =
  'w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm text-navy outline-none transition-colors focus:border-gold';

function StatBox({ label, valor, tone }: { label: string; valor: string; tone: string }) {
  return (
    <div className={cn('rounded-xl border p-4 text-center', tone)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md animate-scale-in rounded-2xl border border-line bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-navy">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-navy" aria-label="Cerrar">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}

export function CajaCliente({
  sede,
  sesion,
  movimientos,
  resumen,
  pendientes,
}: {
  sede: string;
  sesion: CajaSesion | null;
  movimientos: CajaMovimiento[];
  resumen: Resumen | null;
  pendientes: CobroPendiente[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [modal, setModal] = useState<null | 'cobro' | 'egreso' | 'cerrar' | 'garantia'>(null);

  // Apertura.
  const [montoApertura, setMontoApertura] = useState(0);
  // Cobro.
  const [cPedido, setCPedido] = useState('');
  const [cMonto, setCMonto] = useState(0);
  const [cMetodo, setCMetodo] = useState('efectivo');
  const [cTipo, setCTipo] = useState<'adelanto' | 'saldo' | 'completo'>('saldo');
  // Egreso.
  const [eMonto, setEMonto] = useState(0);
  const [eMetodo, setEMetodo] = useState('efectivo');
  const [eCat, setECat] = useState<'gasto' | 'devolucion_garantia' | 'otro'>('gasto');
  const [eDesc, setEDesc] = useState('');
  // Garantía.
  const [gMonto, setGMonto] = useState(0);
  const [gMetodo, setGMetodo] = useState('efectivo');
  const [gDesc, setGDesc] = useState('');
  // Cierre.
  const [montoCierre, setMontoCierre] = useState(0);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      onOk?.();
      setModal(null);
      router.refresh();
    });
  };

  // ── Caja cerrada → abrir ──
  if (!sesion) {
    return (
      <Card>
        <CardContent className="mx-auto max-w-md space-y-4 py-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-gold/80" strokeWidth={1.5} />
          <div>
            <p className="font-display text-lg font-semibold text-navy">Caja cerrada</p>
            <p className="mt-1 text-sm text-muted">Abre la caja de {sede || 'tu sede'} para registrar cobros y egresos.</p>
          </div>
          <div className="mx-auto max-w-xs text-left">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Monto de apertura (efectivo inicial)</label>
            <input type="number" step="0.5" value={montoApertura} onChange={(e) => setMontoApertura(Number(e.target.value))} className={fieldCls} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            disabled={pending || !sede}
            onClick={() => run(() => accionAbrirCaja(sede, montoApertura))}
            className={cn(buttonVariants({ variant: 'primary' }), 'px-6', pending && 'opacity-60')}
          >
            {pending ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </CardContent>
      </Card>
    );
  }

  // ── Caja abierta ──
  return (
    <div className="space-y-4">
      {/* Cabecera de la sesión */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-deep px-5 py-4 text-paper shadow-card">
        <div>
          <div className="inline-flex items-center gap-2 font-display text-xl font-semibold leading-none">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Caja abierta · {sesion.sedeCod}
          </div>
          <div className="mt-1 font-mono text-[11px] text-paper/60">
            Apertura {soles(sesion.montoApertura)} · {sesion.aperturaAt.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setModal('cobro')} className="inline-flex items-center gap-1.5 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-navy transition hover:brightness-95">
            <ArrowDownCircle className="h-4 w-4" strokeWidth={2} /> Cobro
          </button>
          <button onClick={() => setModal('egreso')} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-paper transition hover:bg-white/20">
            <ArrowUpCircle className="h-4 w-4" strokeWidth={2} /> Egreso
          </button>
          <button onClick={() => setModal('garantia')} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-paper transition hover:bg-white/20">
            <Shield className="h-4 w-4" strokeWidth={2} /> Garantía
          </button>
          <button onClick={() => { setMontoCierre(resumen?.efectivoEsperado ?? 0); setModal('cerrar'); }} className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-3 py-2 text-sm font-medium text-paper transition hover:bg-white/10">
            <Lock className="h-4 w-4" strokeWidth={2} /> Cerrar caja
          </button>
        </div>
      </div>

      {/* Resumen del día */}
      {resumen && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox label="Ingresos" valor={soles(resumen.ingresos)} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
          <StatBox label="Egresos" valor={soles(resumen.egresos)} tone="border-red-200 bg-red-50 text-red-700" />
          <StatBox label="Neto" valor={soles(resumen.neto)} tone="border-navy/15 bg-navy/5 text-navy" />
          <StatBox label="Efectivo esperado" valor={soles(resumen.efectivoEsperado)} tone="border-gold/30 bg-gold/10 text-[#7a6e0e]" />
        </div>
      )}

      {/* Cobros pendientes */}
      <Card>
        <CardHeader>
          <CardTitle>Cobros pendientes</CardTitle>
          <span className="font-mono text-xs text-muted tabular-nums">{pendientes.length}</span>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Cliente</TH>
                <TH>Tipo</TH>
                <TH>Fecha</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Cobrado</TH>
                <TH className="text-right">Saldo</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {pendientes.map((p) => (
                <TR key={p.pedidoId}>
                  <TD className="pl-5 font-medium text-navy">{p.clienteNombre ?? '—'}</TD>
                  <TD className="capitalize">{p.tipo}</TD>
                  <TD className="font-mono text-xs text-muted">{p.fecha}</TD>
                  <TD className="text-right font-mono tabular-nums">{soles(p.total)}</TD>
                  <TD className="text-right font-mono tabular-nums text-muted">{soles(p.cobrado)}</TD>
                  <TD className="text-right font-mono font-semibold tabular-nums text-navy">{soles(p.saldo)}</TD>
                  <TD className="pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => { setCPedido(p.pedidoId); setCMonto(p.saldo); setCTipo('saldo'); setCMetodo('efectivo'); setModal('cobro'); }}
                      className="rounded-md border border-line px-2.5 py-1 text-xs text-navy transition hover:border-gold"
                    >
                      Cobrar
                    </button>
                  </TD>
                </TR>
              ))}
              {pendientes.length === 0 && (
                <TR>
                  <TD className="px-5 py-6 text-center text-muted" colSpan={7}>
                    Sin cobros pendientes.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Movimientos del día */}
      <Card>
        <CardHeader>
          <CardTitle>Movimientos del día</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Hora</TH>
                <TH>Tipo</TH>
                <TH>Categoría</TH>
                <TH>Método</TH>
                <TH>Registró</TH>
                <TH className="pr-5 text-right">Monto</TH>
              </TR>
            </THead>
            <TBody>
              {movimientos.map((m) => (
                <TR key={m.id}>
                  <TD className="pl-5 font-mono text-xs text-muted">{m.createdAt.slice(11, 16)}</TD>
                  <TD>
                    <Badge tone={m.tipo === 'ingreso' ? 'green' : 'amber'}>{m.tipo}</Badge>
                  </TD>
                  <TD className="capitalize">{m.categoria.replace(/_/g, ' ')}{m.cobroTipo ? ` · ${m.cobroTipo}` : ''}</TD>
                  <TD className="capitalize">{m.metodo ?? '—'}</TD>
                  <TD className="text-sm text-muted">{m.registradoPorNombre ?? '—'}</TD>
                  <TD className={cn('pr-5 text-right font-mono font-semibold tabular-nums', m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700')}>
                    {m.tipo === 'ingreso' ? '+' : '−'} {soles(m.monto)}
                  </TD>
                </TR>
              ))}
              {movimientos.length === 0 && (
                <TR>
                  <TD className="px-5 py-6 text-center text-muted" colSpan={6}>
                    Aún no hay movimientos hoy.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Modales ── */}
      {modal === 'cobro' && (
        <Modal
          title="Registrar cobro"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className={buttonVariants({ variant: 'outline' })}>Cancelar</button>
              <button
                type="button"
                disabled={pending || !cPedido || cMonto <= 0}
                onClick={() => run(() => accionRegistrarCobro({ pedidoId: cPedido, monto: cMonto, metodo: cMetodo, cobroTipo: cTipo }))}
                className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
              >
                {pending ? 'Registrando…' : `Cobrar ${soles(cMonto)}`}
              </button>
            </>
          }
        >
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Pedido</label>
            <select value={cPedido} onChange={(e) => { setCPedido(e.target.value); const p = pendientes.find((x) => x.pedidoId === e.target.value); if (p) setCMonto(p.saldo); }} className={fieldCls}>
              <option value="">Elige un pedido con saldo…</option>
              {pendientes.map((p) => (
                <option key={p.pedidoId} value={p.pedidoId}>
                  {p.clienteNombre ?? '—'} · {p.tipo} · saldo {soles(p.saldo)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Monto</label>
              <input type="number" step="0.5" value={cMonto} onChange={(e) => setCMonto(Number(e.target.value))} className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Método</label>
              <select value={cMetodo} onChange={(e) => setCMetodo(e.target.value)} className={fieldCls}>
                {METODOS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo de cobro</label>
            <select value={cTipo} onChange={(e) => setCTipo(e.target.value as 'adelanto' | 'saldo' | 'completo')} className={fieldCls}>
              <option value="adelanto">Adelanto</option>
              <option value="saldo">Saldo</option>
              <option value="completo">Pago completo</option>
            </select>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </Modal>
      )}

      {modal === 'egreso' && (
        <Modal
          title="Registrar egreso"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className={buttonVariants({ variant: 'outline' })}>Cancelar</button>
              <button
                type="button"
                disabled={pending || eMonto <= 0}
                onClick={() => run(() => accionRegistrarEgreso({ sede: sesion.sedeCod, monto: eMonto, metodo: eMetodo, categoria: eCat, descripcion: eDesc }))}
                className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
              >
                {pending ? 'Registrando…' : `Egresar ${soles(eMonto)}`}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Monto</label>
              <input type="number" step="0.5" value={eMonto} onChange={(e) => setEMonto(Number(e.target.value))} className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Método</label>
              <select value={eMetodo} onChange={(e) => setEMetodo(e.target.value)} className={fieldCls}>
                {METODOS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Categoría</label>
            <select value={eCat} onChange={(e) => setECat(e.target.value as 'gasto' | 'devolucion_garantia' | 'otro')} className={fieldCls}>
              <option value="gasto">Gasto</option>
              <option value="devolucion_garantia">Devolución de garantía</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Descripción</label>
            <input value={eDesc} onChange={(e) => setEDesc(e.target.value)} placeholder="En qué se usó…" className={fieldCls} />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </Modal>
      )}

      {modal === 'garantia' && (
        <Modal
          title="Registrar garantía"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className={buttonVariants({ variant: 'outline' })}>Cancelar</button>
              <button
                type="button"
                disabled={pending || gMonto <= 0}
                onClick={() => run(() => accionRegistrarGarantia({ sede: sesion.sedeCod, monto: gMonto, metodo: gMetodo, descripcion: gDesc }))}
                className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
              >
                {pending ? 'Registrando…' : `Garantía ${soles(gMonto)}`}
              </button>
            </>
          }
        >
          <p className="text-xs text-muted">Depósito reembolsable del alquiler. Su devolución se registra luego como egreso.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Monto</label>
              <input type="number" step="0.5" value={gMonto} onChange={(e) => setGMonto(Number(e.target.value))} className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Método</label>
              <select value={gMetodo} onChange={(e) => setGMetodo(e.target.value)} className={fieldCls}>
                {METODOS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Descripción (cliente / prenda)</label>
            <input value={gDesc} onChange={(e) => setGDesc(e.target.value)} placeholder="Ej. Juan Pérez · terno negro" className={fieldCls} />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </Modal>
      )}

      {modal === 'cerrar' && resumen && (
        <Modal
          title="Cerrar caja (arqueo)"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className={buttonVariants({ variant: 'outline' })}>Cancelar</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => accionCerrarCaja(sesion.id, montoCierre))}
                className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
              >
                {pending ? 'Cerrando…' : 'Cerrar caja'}
              </button>
            </>
          }
        >
          <div className="flex justify-between rounded-md bg-navy/5 px-3 py-2 text-sm">
            <span className="text-muted">Efectivo esperado</span>
            <span className="font-mono font-semibold text-navy">{soles(resumen.efectivoEsperado)}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Efectivo contado (arqueo)</label>
            <input type="number" step="0.5" value={montoCierre} onChange={(e) => setMontoCierre(Number(e.target.value))} className={fieldCls} />
          </div>
          <div className={cn('flex justify-between rounded-md px-3 py-2 text-sm', Math.abs(montoCierre - resumen.efectivoEsperado) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
            <span>Diferencia</span>
            <span className="font-mono font-semibold">{soles(montoCierre - resumen.efectivoEsperado)}</span>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
