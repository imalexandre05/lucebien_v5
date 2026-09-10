'use client';

import { cn } from '../../../lib/cn';

function sumarDias(base: string, dias: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Fechas rápidas del layout de la Fase 9 (offsets fijos, tal como los especifica el propio plan):
// Entrega hoy/mañana/+3/+7, Devolución +1/+2/+3, ambas relativas a hoy. Fase 10: configurable
// desde `config` (`pos_fechas_rapidas`, ver lib/pos-config.ts) — estos quedan como default/
// fallback si la página no manda `offsetsEntrega`/`offsetsDevolucion`.
const ENTREGA_OFFSETS = [
  { dias: 0, label: 'Hoy' },
  { dias: 1, label: 'Mañana' },
  { dias: 3, label: '+3' },
  { dias: 7, label: '+7' },
];
const DEVOLUCION_OFFSETS = [
  { dias: 1, label: '+1' },
  { dias: 2, label: '+2' },
  { dias: 3, label: '+3' },
];

function FechaRapida({
  hoy,
  value,
  onChange,
  offsets,
  testId,
}: {
  hoy: string;
  value: string;
  onChange: (v: string) => void;
  offsets: { dias: number; label: string }[];
  testId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {offsets.map((o) => {
        const fecha = sumarDias(hoy, o.dias);
        return (
          <button
            key={o.label}
            type="button"
            data-testid={`${testId}-${o.label}`}
            onClick={() => onChange(fecha)}
            className={cn(
              'rounded-r-pastilla border px-3 py-1.5 text-xs font-medium transition-colors',
              value === fecha ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
            )}
          >
            {o.label}
          </button>
        );
      })}
      <input
        type="date"
        data-testid={`${testId}-input`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none focus:border-gold"
      />
    </div>
  );
}

// ③ FECHAS — entrega (venta/confección) y devolución (alquiler), ambas con botones de fecha
// rápida + selector nativo. Se muestran siempre: un pedido mixto puede necesitar las dos a la vez.
export function FechasPanel({
  hoy,
  fechaEntrega,
  onFechaEntregaChange,
  fechaDevolucion,
  onFechaDevolucionChange,
  offsetsEntrega,
  offsetsDevolucion,
}: {
  hoy: string;
  fechaEntrega: string;
  onFechaEntregaChange: (v: string) => void;
  fechaDevolucion: string;
  onFechaDevolucionChange: (v: string) => void;
  offsetsEntrega?: { dias: number; label: string }[];
  offsetsDevolucion?: { dias: number; label: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Entrega (venta / confección)</label>
        <FechaRapida hoy={hoy} value={fechaEntrega} onChange={onFechaEntregaChange} offsets={offsetsEntrega ?? ENTREGA_OFFSETS} testId="fecha-entrega" />
      </div>
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Devolución (alquiler)</label>
        <FechaRapida hoy={hoy} value={fechaDevolucion} onChange={onFechaDevolucionChange} offsets={offsetsDevolucion ?? DEVOLUCION_OFFSETS} testId="fecha-devolucion" />
      </div>
    </div>
  );
}
