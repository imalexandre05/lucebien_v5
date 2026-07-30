'use client';

import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const r2 = (n: number) => Math.round(n * 100) / 100;

// Input de monto (S/) con atajos de llenado rápido — extraído del ticket del constructor de
// /pedidos (Fase 9) porque el mismo patrón ("RECIBE [100.00] [TOTAL][MITAD]") aplica a cualquier
// cobro/egreso/garantía del POS. `quickTotal`/`quickMitad` solo aparecen si se pasa `total` (>0).
export const MontoInput = forwardRef<
  HTMLInputElement,
  {
    value: number;
    onChange: (v: number) => void;
    total?: number;
    label?: string;
    placeholder?: string;
    autoFocus?: boolean;
    disabled?: boolean;
    className?: string;
    testId?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  }
>(function MontoInput(
  { value, onChange, total, label, placeholder, autoFocus, disabled, className, testId, onKeyDown },
  ref,
) {
  return (
    <div className={className}>
      {label && <label className="mb-1 block text-xs uppercase tracking-wide text-muted">{label}</label>}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">S/</span>
          <input
            ref={ref}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            autoFocus={autoFocus}
            disabled={disabled}
            data-testid={testId}
            placeholder={placeholder ?? '0.00'}
            value={Number.isFinite(value) && value !== 0 ? value : value === 0 ? '' : value}
            onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
            onKeyDown={onKeyDown}
            className="w-full rounded-md border border-line bg-white py-2 pl-8 pr-2.5 text-right font-mono text-sm tabular-nums text-navy outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {total != null && total > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(total)}
              className={cn(
                'rounded-md border border-line px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-navy transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              Total
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(r2(total / 2))}
              className={cn(
                'rounded-md border border-line px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-navy transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              Mitad
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
