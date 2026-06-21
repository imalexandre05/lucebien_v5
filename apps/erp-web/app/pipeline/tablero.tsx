'use client';

import { useState, useOptimistic, useTransition } from 'react';
import {
  Inbox,
  Droplets,
  Link2,
  Wrench,
  Scissors,
  Shirt,
  BadgeCheck,
  PackageCheck,
  Truck,
  ArrowRight,
  Send,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { PrendaPasada } from '@scilb/core';
import { TRANSICIONES } from '@scilb/core';
import { avanzarPrenda, enviarPrenda, rechazarPrenda } from './actions';

// Color real de la prenda → punto de color en la tarjeta (tomado del sistema viejo).
const COL_MAP: Record<string, string> = {
  Negro: '#1a1a1a',
  'Azul noche': '#1e2a4a',
  'Azul Barcelona': '#004d98',
  'Azul eléctrico': '#0066ff',
  'Azul acero': '#4682b4',
  'Azul presidente': '#1e3a5f',
  'Verde petróleo': '#006666',
  Celeste: '#87ceeb',
  'Celeste bb': '#b0e0e6',
  Plomo: '#808080',
  'Plomo rata': '#6b6b6b',
  Beige: '#d4b896',
  Camello: '#c19a6b',
  Vino: '#722f37',
  Blanco: '#f5f5f5',
  Gris: '#999999',
  Otros: '#aaaaaa',
};

// Cada etapa con su ícono y color, para que el personal la reconozca de un vistazo.
type Col = { k: string; n: string; icon: LucideIcon; tint: string };
const COLUMNAS: Col[] = [
  { k: 'recepcion', n: 'Recepción', icon: Inbox, tint: '#64748b' },
  { k: 'lavado', n: 'Lavado', icon: Droplets, tint: '#2563eb' },
  { k: 'empatado', n: 'Empatado', icon: Link2, tint: '#7c3aed' },
  { k: 'refaccion', n: 'Refacción', icon: Wrench, tint: '#d97706' },
  { k: 'compostura', n: 'Compostura', icon: Scissors, tint: '#ea580c' },
  { k: 'planchado', n: 'Planchado', icon: Shirt, tint: '#0891b2' },
  { k: 'control_calidad', n: 'Control calidad', icon: BadgeCheck, tint: '#16a34a' },
  { k: 'listo', n: 'Listo p/ envío', icon: PackageCheck, tint: '#a98f12' },
  { k: 'enviado', n: 'Enviadas', icon: Truck, tint: '#2e3e6e' },
];
const NOMBRE: Record<string, string> = Object.fromEntries(COLUMNAS.map((c) => [c.k, c.n]));

type AccionFn = (id: string, etapa: string, run: () => Promise<void>) => void;

export function TableroPipeline({ pasadas }: { pasadas: PrendaPasada[] }) {
  const [, startTransition] = useTransition();
  // Actualización optimista: la prenda se mueve al instante; el servidor confirma después.
  const [optimistas, aplicar] = useOptimistic(pasadas, (state: PrendaPasada[], m: { id: string; etapa: string }) =>
    state.map((p) => (p.id === m.id ? { ...p, etapa: m.etapa as PrendaPasada['etapa'] } : p)),
  );

  const accion: AccionFn = (id, etapa, run) =>
    startTransition(async () => {
      aplicar({ id, etapa });
      await run();
    });

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {COLUMNAS.map((col) => {
        const items = optimistas.filter((p) => p.etapa === col.k);
        const Icon = col.icon;
        return (
          <div key={col.k} className="w-56 shrink-0">
            <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: `${col.tint}14` }}>
              <Icon className="h-4 w-4 shrink-0" style={{ color: col.tint }} strokeWidth={2} />
              <span className="text-sm font-medium" style={{ color: col.tint }}>
                {col.n}
              </span>
              <span
                className="ml-auto rounded-full bg-white px-2 py-0.5 font-mono text-xs font-semibold"
                style={{ color: col.tint }}
              >
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((p) => (
                <Tarjeta key={p.id} p={p} accion={accion} />
              ))}
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-line py-5 text-center text-xs text-slate-400">
                  — vacío —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tarjeta({ p, accion }: { p: PrendaPasada; accion: AccionFn }) {
  const dests = (TRANSICIONES as Record<string, readonly string[]>)[p.etapa] ?? [];
  const meta = [p.tipo, p.color, p.talla ? `T.${p.talla}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-line bg-white p-2.5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
          style={{ background: COL_MAP[p.color ?? ''] ?? '#cbd5e1' }}
        />
        <span className="font-mono text-sm font-semibold text-navy">{p.codigo}</span>
      </div>
      {Boolean(meta) && <div className="mt-1 text-xs text-slate-500">{meta}</div>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded bg-navy/5 px-1.5 py-0.5 font-mono text-[10px] text-navy">{p.sedeOrigenCod}</span>
        {Boolean(p.necesitaCompostura) && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">compostura</span>
        )}
        {Boolean(p.aprobada) && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">✓ aprobada</span>
        )}
      </div>
      {Boolean(p.obsCalidad) && (
        <div className="mt-1 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">⚠ {p.obsCalidad}</div>
      )}

      {dests.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {dests.map((d) => (
            <button
              key={d}
              onClick={() => accion(p.id, d, () => avanzarPrenda(p.id, d))}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-navy px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#26345c] active:scale-[.98]"
            >
              {NOMBRE[d] ?? d} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          ))}
        </div>
      )}

      {p.etapa === 'listo' && <Enviar p={p} accion={accion} />}
      {p.etapa === 'control_calidad' && <Rechazar p={p} accion={accion} />}
    </div>
  );
}

function Enviar({ p, accion }: { p: PrendaPasada; accion: AccionFn }) {
  const [sede, setSede] = useState(['LB', 'ST', 'TR'].includes(p.sedeOrigenCod) ? p.sedeOrigenCod : 'LB');
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <select
        value={sede}
        onChange={(e) => setSede(e.target.value)}
        className="rounded-md border border-line bg-white px-1.5 py-1 text-xs text-navy"
        aria-label="Sede destino"
      >
        <option value="LB">LB</option>
        <option value="ST">ST</option>
        <option value="TR">TR</option>
      </select>
      <button
        onClick={() => accion(p.id, 'enviado', () => enviarPrenda(p.id, sede))}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gold px-2.5 py-1.5 text-xs font-semibold text-navy transition hover:brightness-95 active:scale-[.98]"
      >
        <Send className="h-3.5 w-3.5" strokeWidth={2.5} /> Enviar
      </button>
    </div>
  );
}

function Rechazar({ p, accion }: { p: PrendaPasada; accion: AccionFn }) {
  const [destino, setDestino] = useState('planchado');
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <select
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
        className="rounded-md border border-line bg-white px-1.5 py-1 text-xs text-navy"
        aria-label="Devolver a la etapa"
      >
        <option value="recepcion">Recepción</option>
        <option value="lavado">Lavado</option>
        <option value="empatado">Empatado</option>
        <option value="refaccion">Refacción</option>
        <option value="compostura">Compostura</option>
        <option value="planchado">Planchado</option>
      </select>
      <button
        onClick={() => accion(p.id, destino, () => rechazarPrenda(p.id, destino))}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 active:scale-[.98]"
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={2.5} /> Rechazar
      </button>
    </div>
  );
}
