'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, Lock, Wallet, Shield } from 'lucide-react';
import type { CajaSesion, CajaMovimiento, CobroPendiente } from '../../lib/caja-repo';
import { accionAbrirCaja, accionCerrarCaja, accionRegistrarCobro, accionRegistrarEgreso, accionRegistrarGarantia } from './actions';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { MetodoPagoBotones } from '../../components/ui/metodo-pago-botones';
import { StatBox } from '../../components/ui/stat-box';
import { Modal as SharedModal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { Aviso, campoCls } from '../../components/ui/form';
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

const OPC_CATEGORIA_EGRESO: Opcion<'gasto' | 'devolucion_garantia' | 'otro'>[] = [
  { value: 'gasto', label: 'Gasto' },
  { value: 'devolucion_garantia', label: 'Devolución de garantía' },
  { value: 'otro', label: 'Otro' },
];
const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const fieldCls = cn(campoCls, 'w-full py-2');

// Adapter sobre el Modal compartido: conserva la API local (title/children/footer) y hereda
// Escape, bloqueo de scroll, foco al abrir, blur y a11y — sin tocar los 4 modales que lo usan.
function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <SharedModal open onClose={onClose} title={title}>
      <ModalBody className="space-y-3">{children}</ModalBody>
      <ModalFooter>{footer}</ModalFooter>
    </SharedModal>
  );
}

export function CajaCliente({
  sede,
  sesion,
  movimientos,
  resumen,
  pendientes,
  puedeCobrar,
  metodosPago,
}: {
  sede: string;
  sesion: CajaSesion | null;
  movimientos: CajaMovimiento[];
  resumen: Resumen | null;
  pendientes: CobroPendiente[];
  puedeCobrar: boolean;
  metodosPago?: { value: string; label: string }[];
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

  // ── Caja cerrada → abrir (solo cajeros: permiso pos_cobro) ──
  if (!sesion) {
    if (!puedeCobrar) {
      return (
        <Card>
          <CardContent className="mx-auto max-w-md space-y-2 py-10 text-center">
            <Wallet className="mx-auto h-10 w-10 text-line" strokeWidth={1.5} />
            <p className="text-seccion font-display font-semibold text-navy">Caja cerrada</p>
            <p className="text-cuerpo text-muted">No tienes el permiso de cajero para abrirla. Pide a un cajero de {sede || 'tu sede'} que la abra.</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="mx-auto max-w-md space-y-4 py-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-gold/80" strokeWidth={1.5} />
          <div>
            <p className="text-seccion font-display font-semibold text-navy">Caja cerrada</p>
            <p className="mt-1 text-cuerpo text-muted">Abre la caja de {sede || 'tu sede'} para registrar cobros y egresos.</p>
          </div>
          <div className="mx-auto max-w-xs text-left">
            <label className="mb-1 block text-rotulo uppercase text-muted">Monto de apertura (efectivo inicial)</label>
            <input type="number" step="0.5" data-testid="monto-apertura" value={montoApertura} onChange={(e) => setMontoApertura(Number(e.target.value))} className={fieldCls} />
          </div>
          {error && <p className="text-cuerpo text-error">{error}</p>}
          <Button
            type="button"
            data-testid="abrir-caja"
            disabled={!sede}
            pending={pending}
            onClick={() => run(() => accionAbrirCaja(sede, montoApertura))}
            className="px-6"
          >
            {pending ? 'Abriendo…' : 'Abrir caja'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Caja abierta ──
  return (
    <div className="space-y-4">
      {/* Cabecera de la sesión */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-r-grande bg-navy-deep px-5 py-4 text-paper shadow-card">
        <div>
          <div className="inline-flex items-center gap-2 text-seccion font-display font-semibold leading-none">
            <span className="h-2 w-2 rounded-r-pastilla bg-exito" /> Caja abierta · {sesion.sedeCod}
          </div>
          <div className="mt-1 tabular-nums text-micro text-paper/60">
            Apertura {soles(sesion.montoApertura)} · {sesion.aperturaAt.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
        {puedeCobrar ? (
          <div className="flex flex-wrap items-center gap-2">
            <button data-testid="abrir-cobro" onClick={() => setModal('cobro')} className="inline-flex items-center gap-1.5 rounded-r-pastilla bg-gold px-3 py-2 text-cuerpo font-semibold text-navy transition hover:brightness-95">
              <ArrowDownCircle className="h-4 w-4" strokeWidth={2} /> Cobro
            </button>
            <button onClick={() => setModal('egreso')} className="inline-flex items-center gap-1.5 rounded-r-pastilla bg-white/10 px-3 py-2 text-cuerpo font-medium text-paper transition hover:bg-white/20">
              <ArrowUpCircle className="h-4 w-4" strokeWidth={2} /> Egreso
            </button>
            <button onClick={() => setModal('garantia')} className="inline-flex items-center gap-1.5 rounded-r-pastilla bg-white/10 px-3 py-2 text-cuerpo font-medium text-paper transition hover:bg-white/20">
              <Shield className="h-4 w-4" strokeWidth={2} /> Garantía
            </button>
            <button data-testid="abrir-cerrar" onClick={() => { setMontoCierre(resumen?.efectivoEsperado ?? 0); setModal('cerrar'); }} className="inline-flex items-center gap-1.5 rounded-r-pastilla border border-white/25 px-3 py-2 text-cuerpo font-medium text-paper transition hover:bg-white/10">
              <Lock className="h-4 w-4" strokeWidth={2} /> Cerrar caja
            </button>
          </div>
        ) : (
          <span className="rounded-r-pastilla bg-white/10 px-3 py-2 text-apoyo text-paper/70">Solo lectura — sin permiso de cajero</span>
        )}
      </div>

      {/* Resumen del día */}
      {resumen && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox size="md" index={0} label="Ingresos" valor={soles(resumen.ingresos)} tone="exito" />
          <StatBox size="md" index={1} label="Egresos" valor={soles(resumen.egresos)} tone="error" />
          <StatBox size="md" index={2} label="Neto" valor={soles(resumen.neto)} tone="navy" />
          <StatBox size="md" index={3} label="Efectivo esperado" valor={soles(resumen.efectivoEsperado)} tone="gold" />
        </div>
      )}

      {/* Cobros pendientes */}
      <Card>
        <CardHeader>
          <CardTitle>Cobros pendientes</CardTitle>
          <span className="tabular-nums text-dato text-muted">{pendientes.length}</span>
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
                  <TD className="tabular-nums text-dato text-muted">{p.fecha}</TD>
                  <TD className="text-right tabular-nums">{soles(p.total)}</TD>
                  <TD className="text-right tabular-nums text-muted">{soles(p.cobrado)}</TD>
                  <TD className="text-right tabular-nums font-semibold text-navy">{soles(p.saldo)}</TD>
                  <TD className="pr-5 text-right">
                    {puedeCobrar && (
                      <button
                        type="button"
                        onClick={() => { setCPedido(p.pedidoId); setCMonto(p.saldo); setCMetodo('efectivo'); setModal('cobro'); }}
                        className="rounded-r-pastilla border border-line px-2.5 py-1 text-apoyo text-navy transition hover:border-gold"
                      >
                        Cobrar
                      </button>
                    )}
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
                  <TD className="pl-5 tabular-nums text-dato text-muted">{m.createdAt.slice(11, 16)}</TD>
                  <TD>
                    <Badge tone={m.tipo === 'ingreso' ? 'green' : 'amber'}>{m.tipo}</Badge>
                  </TD>
                  <TD className="capitalize">{m.categoria.replace(/_/g, ' ')}{m.cobroTipo ? ` · ${m.cobroTipo}` : ''}</TD>
                  <TD className="capitalize">{m.metodo ?? '—'}</TD>
                  <TD className="text-cuerpo text-muted">{m.registradoPorNombre ?? '—'}</TD>
                  <TD className={cn('pr-5 text-right tabular-nums font-semibold', m.tipo === 'ingreso' ? 'text-exito-deep' : 'text-error-deep')}>
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
              <Button
                type="button"
                data-testid="confirmar-cobro"
                disabled={!cPedido || cMonto <= 0}
                pending={pending}
                onClick={() => run(() => accionRegistrarCobro({ pedidoId: cPedido, monto: cMonto, metodo: cMetodo }))}
              >
                {pending ? 'Registrando…' : `Cobrar ${soles(cMonto)}`}
              </Button>
            </>
          }
        >
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Pedido</label>
            <select data-testid="cobro-pedido" value={cPedido} onChange={(e) => { setCPedido(e.target.value); const p = pendientes.find((x) => x.pedidoId === e.target.value); if (p) setCMonto(p.saldo); }} className={fieldCls}>
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
              <label className="mb-1 block text-rotulo uppercase text-muted">Monto</label>
              <input type="number" step="0.5" value={cMonto} onChange={(e) => setCMonto(Number(e.target.value))} className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">Método</label>
              <MetodoPagoBotones value={cMetodo} onChange={setCMetodo} opciones={metodosPago} ariaLabel="Método de pago" />
            </div>
          </div>
          {/* Sin selector de "tipo de cobro": lo deriva pedido_cobrar solo (adelanto/saldo/completo
              según cuánto queda por cobrar) — mismo criterio que el ticket de /pedidos, así los dos
              puntos de entrada producen exactamente el mismo asiento (Fase 10, punto 2). */}
          {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
        </Modal>
      )}

      {modal === 'egreso' && (
        <Modal
          title="Registrar egreso"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className={buttonVariants({ variant: 'outline' })}>Cancelar</button>
              <Button
                type="button"
                disabled={eMonto <= 0}
                pending={pending}
                onClick={() => run(() => accionRegistrarEgreso({ sede: sesion.sedeCod, monto: eMonto, metodo: eMetodo, categoria: eCat, descripcion: eDesc }))}
              >
                {pending ? 'Registrando…' : `Egresar ${soles(eMonto)}`}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">Monto</label>
              <input type="number" step="0.5" value={eMonto} onChange={(e) => setEMonto(Number(e.target.value))} className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">Método</label>
              <MetodoPagoBotones value={eMetodo} onChange={setEMetodo} opciones={metodosPago} ariaLabel="Método de pago" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Categoría</label>
            <OpcionBotones opciones={OPC_CATEGORIA_EGRESO} value={eCat} onChange={setECat} ariaLabel="Categoría de egreso" />
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Descripción</label>
            <input value={eDesc} onChange={(e) => setEDesc(e.target.value)} placeholder="En qué se usó…" className={fieldCls} />
          </div>
          {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
        </Modal>
      )}

      {modal === 'garantia' && (
        <Modal
          title="Registrar garantía"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className={buttonVariants({ variant: 'outline' })}>Cancelar</button>
              <Button
                type="button"
                disabled={gMonto <= 0}
                pending={pending}
                onClick={() => run(() => accionRegistrarGarantia({ sede: sesion.sedeCod, monto: gMonto, metodo: gMetodo, descripcion: gDesc }))}
              >
                {pending ? 'Registrando…' : `Garantía ${soles(gMonto)}`}
              </Button>
            </>
          }
        >
          <p className="text-apoyo text-muted">Depósito reembolsable del alquiler. Su devolución se registra luego como egreso.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">Monto</label>
              <input type="number" step="0.5" value={gMonto} onChange={(e) => setGMonto(Number(e.target.value))} className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">Método</label>
              <MetodoPagoBotones value={gMetodo} onChange={setGMetodo} opciones={metodosPago} ariaLabel="Método de pago" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Descripción (cliente / prenda)</label>
            <input value={gDesc} onChange={(e) => setGDesc(e.target.value)} placeholder="Ej. Juan Pérez · terno negro" className={fieldCls} />
          </div>
          {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
        </Modal>
      )}

      {modal === 'cerrar' && resumen && (
        <Modal
          title="Cerrar caja (arqueo)"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className={buttonVariants({ variant: 'outline' })}>Cancelar</button>
              <Button
                type="button"
                data-testid="confirmar-cerrar"
                pending={pending}
                onClick={() => run(() => accionCerrarCaja(sesion.id, montoCierre))}
              >
                {pending ? 'Cerrando…' : 'Cerrar caja'}
              </Button>
            </>
          }
        >
          <div className="flex justify-between rounded-r-chico bg-navy/5 px-3 py-2 text-cuerpo">
            <span className="text-muted">Efectivo esperado</span>
            <span className="tabular-nums font-semibold text-navy">{soles(resumen.efectivoEsperado)}</span>
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Efectivo contado (arqueo)</label>
            <input type="number" step="0.5" data-testid="monto-cierre" value={montoCierre} onChange={(e) => setMontoCierre(Number(e.target.value))} className={fieldCls} />
          </div>
          <div className={cn('flex justify-between rounded-r-chico px-3 py-2 text-cuerpo', Math.abs(montoCierre - resumen.efectivoEsperado) < 0.01 ? 'bg-exito-soft text-exito-deep' : 'bg-aviso-soft text-aviso-deep')}>
            <span>Diferencia</span>
            <span className="tabular-nums font-semibold">{soles(montoCierre - resumen.efectivoEsperado)}</span>
          </div>
          {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
        </Modal>
      )}
    </div>
  );
}
