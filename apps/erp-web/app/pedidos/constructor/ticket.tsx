'use client';

import { useState } from 'react';
import { totalPedido, clasificarCobro } from '@scilb/core';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { MetodoPagoBotones } from '../../../components/ui/metodo-pago-botones';
import { MontoInput } from '../../../components/ui/monto-input';
import type { LineaLocal } from './constructor';

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

// TICKET (1/3, sticky) — vista previa en vivo del pedido que se está armando + el cobro. Único
// lugar de la pantalla con GOLD además del botón REGISTRAR: el TOTAL (regla del plan: "gold
// reservado a una sola cosa por pantalla" — aquí son las dos caras del mismo número: cuánto cuesta
// y el botón que lo cierra).
export function Ticket({
  items,
  metodo,
  onMetodoChange,
  metodosPago,
  recibido,
  onRecibidoChange,
  onRegistrar,
  registrando,
  disabledMotivo,
  error,
  sinCaja,
  onAbrirCaja,
  abriendoCaja,
  sede,
  montoInputRef,
}: {
  items: LineaLocal[];
  metodo: string;
  onMetodoChange: (m: string) => void;
  metodosPago?: { value: string; label: string }[];
  recibido: number;
  onRecibidoChange: (v: number) => void;
  onRegistrar: () => void;
  registrando: boolean;
  disabledMotivo: string | null;
  error: string | null;
  sinCaja: boolean;
  onAbrirCaja: (montoApertura: number) => void;
  abriendoCaja: boolean;
  sede: string;
  montoInputRef: React.RefObject<HTMLInputElement>;
}) {
  const [montoApertura, setMontoApertura] = useState(0);
  const total = totalPedido(items.map((i) => ({ cantidad: i.cantidad, precioUnitario: i.precioUnitario, esCortesia: i.esCortesia })));
  const recibidoClamp = Math.min(recibido, total);
  const saldo = Math.max(0, Math.round((total - recibidoClamp) * 100) / 100);
  const cobroTipo = recibido > 0 ? clasificarCobro(total, 0, recibidoClamp) : null;

  return (
    <div className="sticky top-4 flex flex-col gap-4 rounded-lg border border-line bg-white p-4 shadow-card">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Pedido nuevo</p>
        <p className="font-mono text-sm text-navy">se genera el código al registrar</p>
      </div>

      <div className="max-h-56 space-y-1.5 overflow-y-auto border-y border-line/60 py-2">
        {items.length === 0 && <p className="py-3 text-center text-xs text-muted">Agrega líneas para ver el ticket.</p>}
        {items.map((l) => (
          <div key={l.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-navy">
              {l.cantidad}× {l.activoCodigo ?? l.descripcion ?? '—'}
            </span>
            {l.esCortesia ? <Badge tone="green">CORTESÍA</Badge> : <span className="shrink-0 font-mono tabular-nums text-navy">{soles(l.cantidad * l.precioUnitario)}</span>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-navy">Total</span>
        <span className="font-mono text-2xl font-bold tabular-nums text-gold-deep" data-testid="ticket-total">
          {soles(total)}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Método</label>
        <MetodoPagoBotones value={metodo} onChange={onMetodoChange} opciones={metodosPago} />
      </div>

      <MontoInput ref={montoInputRef} value={recibido} onChange={onRecibidoChange} total={total} label="Recibe" testId="ticket-recibido" />

      {recibido > 0 && (
        <p className="text-xs text-muted" data-testid="ticket-saldo">
          {saldo > 0 ? (
            <>
              Saldo <span className="font-mono font-medium text-navy">{soles(saldo)}</span> · {cobroTipo === 'adelanto' ? 'ADELANTO' : cobroTipo?.toUpperCase()}
            </>
          ) : (
            <>Cobro completo</>
          )}
        </p>
      )}

      {sinCaja && (
        <div className="rounded-md border border-aviso-line bg-aviso-soft p-3 text-xs text-aviso-deep" data-testid="banner-sin-caja">
          <p className="font-medium">La caja de {sede} está cerrada.</p>
          <p className="mt-0.5 mb-2">Ábrela aquí mismo para poder cobrar o registrar la garantía.</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={montoApertura || ''}
              onChange={(e) => setMontoApertura(Number(e.target.value) || 0)}
              placeholder="Monto de apertura"
              className="w-32 rounded-md border border-aviso-line bg-white px-2 py-1 text-right font-mono text-xs outline-none"
            />
            <Button type="button" variant="outline" pending={abriendoCaja} onClick={() => onAbrirCaja(montoApertura)} data-testid="abrir-caja-inline">
              Abrir caja
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-deep" data-testid="ticket-error">
          {error}
        </p>
      )}

      <Button type="button" variant="gold" pending={registrando} disabled={Boolean(disabledMotivo)} onClick={onRegistrar} data-testid="registrar-pedido">
        {registrando ? 'Registrando…' : 'Registrar pedido'}
        <span className="ml-1 hidden font-mono text-[10px] opacity-70 sm:inline">Ctrl+Enter</span>
      </Button>
      {disabledMotivo && <p className="text-center text-[11px] text-muted">{disabledMotivo}</p>}
    </div>
  );
}
