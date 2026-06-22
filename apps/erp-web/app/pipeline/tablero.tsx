'use client';

import { useEffect, useState, useOptimistic, useTransition } from 'react';
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
  Search,
  Split,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { PrendaPasada } from '@scilb/core';
import { TRANSICIONES } from '@scilb/core';
import {
  avanzarPrenda,
  enviarPrenda,
  rechazarPrenda,
  deshacerPrenda,
  avanzarTandaPrendas,
  dividirPrenda,
} from './actions';

// Color real de la prenda → punto de color en la tarjeta (del sistema viejo).
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

// Destino primario al avanzar en tanda (toda la columna), portado del mapa NEXT del viejo.
const NEXT_TANDA: Record<string, string> = {
  recepcion: 'lavado',
  lavado: 'empatado',
  empatado: 'refaccion',
  refaccion: 'planchado',
  compostura: 'planchado',
  planchado: 'control_calidad',
  control_calidad: 'listo',
};

type Handlers = {
  avanzar: (id: string, destino: string, etapaActual: string) => void;
  avanzarTanda: (ids: string[], destino: string) => void;
  enviar: (id: string, sede: string) => void;
  rechazar: (id: string, destino: string) => void;
  dividir: (id: string) => void;
};
type Toast = { msg: string; tono: 'ok' | 'gold' | 'warn'; undo?: () => void };

export function TableroPipeline({ pasadas }: { pasadas: PrendaPasada[] }) {
  const [, startTransition] = useTransition();
  // Actualización optimista: la prenda se mueve al instante; el servidor confirma después.
  const [optimistas, aplicar] = useOptimistic(pasadas, (state: PrendaPasada[], m: { id: string; etapa: string }) =>
    state.map((p) => (p.id === m.id ? { ...p, etapa: m.etapa as PrendaPasada['etapa'] } : p)),
  );
  const [sesionPts, setSesionPts] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const deshacer = (id: string, etapaAnterior: string, pts: number) =>
    startTransition(async () => {
      aplicar({ id, etapa: etapaAnterior });
      if (pts) setSesionPts((s) => Math.round((s - pts) * 10) / 10);
      setToast(null);
      await deshacerPrenda(id, etapaAnterior);
    });

  const h: Handlers = {
    avanzar: (id, destino, etapaActual) =>
      startTransition(async () => {
        aplicar({ id, etapa: destino });
        const pts = await avanzarPrenda(id, destino);
        if (pts) setSesionPts((s) => Math.round((s + pts) * 10) / 10);
        setToast({
          msg: `${NOMBRE[destino] ?? destino} · +${pts ?? 0} pts`,
          tono: 'ok',
          undo: () => deshacer(id, etapaActual, pts ?? 0),
        });
      }),
    enviar: (id, sede) =>
      startTransition(async () => {
        aplicar({ id, etapa: 'enviado' });
        await enviarPrenda(id, sede);
        setToast({ msg: `Enviado a ${sede}`, tono: 'gold' });
      }),
    rechazar: (id, destino) =>
      startTransition(async () => {
        aplicar({ id, etapa: destino });
        await rechazarPrenda(id, destino);
        setToast({ msg: `Devuelto a ${NOMBRE[destino] ?? destino}`, tono: 'warn' });
      }),
    avanzarTanda: (ids, destino) =>
      startTransition(async () => {
        ids.forEach((id) => aplicar({ id, etapa: destino }));
        const pts = await avanzarTandaPrendas(ids, destino);
        if (pts) setSesionPts((s) => Math.round((s + pts) * 10) / 10);
        setToast({ msg: `${ids.length} prendas → ${NOMBRE[destino] ?? destino} · +${pts ?? 0} pts`, tono: 'ok' });
      }),
    dividir: (id) =>
      startTransition(async () => {
        await dividirPrenda(id);
        setToast({ msg: 'Terno dividido en saco + pantalón', tono: 'gold' });
      }),
  };

  const ql = q.trim().toLowerCase();
  const visibles = ql
    ? optimistas.filter((p) => `${p.codigo} ${p.tipo ?? ''} ${p.color ?? ''}`.toLowerCase().includes(ql))
    : optimistas;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> En vivo
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-[#7a6e0e]">
          <Zap className="h-3.5 w-3.5" strokeWidth={2.5} /> Tu sesión:{' '}
          <span className="font-mono font-bold tabular-nums">{sesionPts}</span> pts
        </span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar prenda…"
            className="w-52 rounded-md border border-line bg-white py-1.5 pl-8 pr-3 text-sm text-navy placeholder:text-slate-400 focus:border-navy focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNAS.map((col) => {
          const items = visibles.filter((p) => p.etapa === col.k);
          const Icon = col.icon;
          return (
            <div key={col.k} className="w-56 shrink-0">
              <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: `${col.tint}14` }}>
                <Icon className="h-4 w-4 shrink-0" style={{ color: col.tint }} strokeWidth={2} />
                <span className="text-sm font-medium" style={{ color: col.tint }}>
                  {col.n}
                </span>
                <span
                  className="ml-auto rounded-full bg-white px-2 py-0.5 font-mono text-xs font-semibold tabular-nums"
                  style={{ color: col.tint }}
                >
                  {items.length}
                </span>
              </div>
              {items.length >= 2 && NEXT_TANDA[col.k] && (
                <button
                  onClick={() => h.avanzarTanda(items.map((i) => i.id), NEXT_TANDA[col.k])}
                  className="mb-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-navy/15 bg-navy/5 px-2 py-1 text-[11px] font-medium text-navy transition hover:bg-navy/10"
                >
                  Avanzar todas → {NOMBRE[NEXT_TANDA[col.k]] ?? NEXT_TANDA[col.k]}
                </button>
              )}
              <div className="space-y-2">
                {items.map((p) => (
                  <Tarjeta key={p.id} p={p} h={h} />
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line py-5 text-center text-xs text-slate-400">
                    {ql ? 'sin coincidencias' : '— vacío —'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg ${
            toast.tono === 'gold'
              ? 'bg-gold text-navy'
              : toast.tono === 'warn'
                ? 'bg-amber-600 text-white'
                : 'bg-navy text-white'
          }`}
          role="status"
        >
          <span>
            {toast.tono === 'warn' ? '↩ ' : '✓ '}
            {toast.msg}
          </span>
          {toast.undo && (
            <button
              onClick={toast.undo}
              className="inline-flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-xs font-medium transition hover:bg-white/30"
            >
              <Undo2 className="h-3 w-3" strokeWidth={2.5} /> Deshacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ p, h }: { p: PrendaPasada; h: Handlers }) {
  const dests = (TRANSICIONES as Record<string, readonly string[]>)[p.etapa] ?? [];
  const meta = [p.tipo, p.color, p.talla ? `T.${p.talla}` : ''].filter(Boolean).join(' · ');
  const esTerno = (p.tipo ?? '').toLowerCase().includes('terno');
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
              onClick={() => h.avanzar(p.id, d, p.etapa)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-navy px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#26345c] active:scale-[.98]"
            >
              {NOMBRE[d] ?? d} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          ))}
        </div>
      )}

      {p.etapa === 'listo' && <Enviar p={p} h={h} />}
      {p.etapa === 'control_calidad' && <Rechazar p={p} h={h} />}
      {esTerno && (
        <button
          onClick={() => h.dividir(p.id)}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1 text-[10px] font-medium text-slate-400 transition hover:text-navy"
        >
          <Split className="h-3 w-3" strokeWidth={2.5} /> Dividir en saco + pantalón
        </button>
      )}
    </div>
  );
}

function Enviar({ p, h }: { p: PrendaPasada; h: Handlers }) {
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
        onClick={() => h.enviar(p.id, sede)}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gold px-2.5 py-1.5 text-xs font-semibold text-navy transition hover:brightness-95 active:scale-[.98]"
      >
        <Send className="h-3.5 w-3.5" strokeWidth={2.5} /> Enviar
      </button>
    </div>
  );
}

function Rechazar({ p, h }: { p: PrendaPasada; h: Handlers }) {
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
        onClick={() => h.rechazar(p.id, destino)}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 active:scale-[.98]"
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={2.5} /> Rechazar
      </button>
    </div>
  );
}
