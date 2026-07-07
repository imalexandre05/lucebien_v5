'use client';

import { useEffect, useMemo, useState, useOptimistic, useTransition } from 'react';
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
  Check,
  Zap,
  Trophy,
  X,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { PrendaPasada } from '@scilb/core';
import { TRANSICIONES } from '@scilb/core';
import type { RankingItem } from '../../lib/pipeline-repo';
import { cn } from '../../lib/cn';
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

// Pestañas del módulo (como el viejo). Accesorios y Métricas van por etapas.
const TABS: { k: string; label: string; href?: string; pronto?: boolean }[] = [
  { k: 'kanban', label: 'Kanban', href: '/pipeline' },
  { k: 'registrar', label: 'Registrar', href: '/pipeline/registrar' },
  { k: 'envios', label: 'Envíos a tienda', href: '/pipeline/envios' },
  { k: 'accesorios', label: 'Accesorios', pronto: true },
  { k: 'metricas', label: 'Métricas', pronto: true },
];

// Tono del pill de tipo de lavado.
const tipoLavadoCls = (t: string): string => {
  const v = t.toLowerCase();
  if (v.includes('seco')) return 'bg-amber-50 text-amber-700';
  if (v.includes('espec')) return 'bg-violet-50 text-violet-700';
  return 'bg-slate-100 text-slate-600';
};

type Handlers = {
  avanzar: (id: string, destino: string, etapaActual: string) => void;
  avanzarTanda: (ids: string[], destino: string) => void;
  enviar: (id: string, sede: string) => void;
  rechazar: (id: string, destino: string) => void;
  dividir: (id: string) => void;
};
type Toast = { msg: string; tono: 'ok' | 'gold' | 'warn'; undo?: () => void };

export function TableroPipeline({
  pasadas,
  ranking = [],
  operario = '',
  tiendas = ['LB', 'ST', 'TR'],
}: {
  pasadas: PrendaPasada[];
  ranking?: RankingItem[];
  operario?: string;
  tiendas?: string[];
}) {
  const [, startTransition] = useTransition();
  // Actualización optimista: la prenda se mueve al instante; el servidor confirma después.
  const [optimistas, aplicar] = useOptimistic(pasadas, (state: PrendaPasada[], m: { id: string; etapa: string }) =>
    state.map((p) => (p.id === m.id ? { ...p, etapa: m.etapa as PrendaPasada['etapa'] } : p)),
  );
  const [sesionPts, setSesionPts] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [q, setQ] = useState('');
  const [sedeF, setSedeF] = useState('');
  const [tipoF, setTipoF] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selEtapa, setSelEtapa] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const limpiarSel = () => {
    setSel(new Set());
    setSelEtapa(null);
  };

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

  // Selección por columna (como el viejo: la barra dice "N en {etapa}"). Cruzar de etapa reinicia.
  const toggleSel = (id: string, etapa: string) => {
    setSel((prev) => {
      const cruzaEtapa = selEtapa && selEtapa !== etapa;
      const base = cruzaEtapa ? new Set<string>() : new Set(prev);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      setSelEtapa(base.size ? etapa : null);
      return base;
    });
  };

  // Filtros: sede y tipo de lavado dinámicos (de la data, sin inventar valores).
  const sedes = useMemo(
    () => Array.from(new Set(optimistas.map((p) => p.sedeOrigenCod).filter(Boolean))).sort(),
    [optimistas],
  );
  const tipos = useMemo(
    () => Array.from(new Set(optimistas.map((p) => p.tipoLavado).filter((x): x is string => Boolean(x)))).sort(),
    [optimistas],
  );

  const ql = q.trim().toLowerCase();
  const visibles = optimistas.filter((p) => {
    if (sedeF && p.sedeOrigenCod !== sedeF) return false;
    if (tipoF && p.tipoLavado !== tipoF) return false;
    if (ql && !`${p.codigo} ${p.tipo ?? ''} ${p.color ?? ''}`.toLowerCase().includes(ql)) return false;
    return true;
  });

  const enProceso = optimistas.filter((p) => p.etapa !== 'enviado').length;
  const enviados = optimistas.filter((p) => p.etapa === 'enviado').length;

  const destsSel = selEtapa ? ((TRANSICIONES as Record<string, readonly string[]>)[selEtapa] ?? []) : [];

  return (
    <div>
      {/* ── Banda de cabecera (navy) ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-deep px-5 py-4 text-paper shadow-card">
        <div>
          <div className="font-display text-xl font-semibold leading-none">Prendas recibidas</div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-gold">Almacén Central</div>
        </div>
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> En vivo
          </span>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-paper/50">Sesión</div>
            <div className="inline-flex items-center gap-1 font-mono text-lg font-bold text-gold">
              <Zap className="h-4 w-4" strokeWidth={2.5} /> {sesionPts}
            </div>
          </div>
          {operario && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-paper/50">Operario</div>
              <div className="text-sm font-medium">{operario}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Pestañas ── */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-line">
        {TABS.map((t) =>
          t.href ? (
            <NavLink key={t.k} href={t.href} activo={t.k === 'kanban'}>
              {t.label}
            </NavLink>
          ) : (
            <button
              key={t.k}
              type="button"
              disabled
              className="relative -mb-px cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm text-muted/70"
              title="Próximamente"
            >
              {t.label}
              <span className="ml-1 rounded bg-line/70 px-1 text-[9px] uppercase text-muted">pronto</span>
            </button>
          ),
        )}
        <div className="ml-auto flex items-center gap-2 pb-1.5">
          <span className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-medium text-navy">{enProceso} en proceso</span>
          <span className="rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-700">{enviados} enviados</span>
        </div>
      </div>

      {/* ── Filtros + búsqueda ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Filtros</span>
        <Chip on={!sedeF} onClick={() => setSedeF('')}>Todas</Chip>
        {sedes.map((s) => (
          <Chip key={s} on={sedeF === s} onClick={() => setSedeF(s)}>{s}</Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <Chip on={!tipoF} onClick={() => setTipoF('')}>Todos</Chip>
        {tipos.map((t) => (
          <Chip key={t} on={tipoF === t} onClick={() => setTipoF(t)}>{t}</Chip>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, color o tipo…"
            className="w-64 rounded-md border border-line bg-white py-1.5 pl-8 pr-3 text-sm text-navy placeholder:text-slate-400 focus:border-navy focus:outline-none"
          />
        </div>
      </div>

      {/* ── Barra de acción por selección ── */}
      {sel.size > 0 && selEtapa && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-navy/15 bg-navy/5 px-3 py-2">
          <span className="text-sm font-medium text-navy">
            <span className="font-mono">{sel.size}</span> en {NOMBRE[selEtapa] ?? selEtapa}
          </span>
          {destsSel.map((d) => (
            <button
              key={d}
              onClick={() => {
                h.avanzarTanda([...sel], d);
                limpiarSel();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-navy px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#26345c]"
            >
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} /> {NOMBRE[d] ?? d}
            </button>
          ))}
          <button onClick={limpiarSel} className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-navy">
            <X className="h-3.5 w-3.5" strokeWidth={2.5} /> Limpiar
          </button>
        </div>
      )}

      {/* ── Ranking del día ── */}
      {ranking.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Trophy className="h-4 w-4 text-gold" strokeWidth={2} /> Puntos de hoy
          </span>
          {ranking.map((r, i) => (
            <span key={r.nombre} className="inline-flex items-center gap-1.5 rounded-full bg-navy/5 px-2.5 py-1 text-xs">
              <span className="font-mono text-[10px] text-slate-400">#{i + 1}</span>
              <span className="font-medium text-navy">{r.nombre}</span>
              <span className="font-mono font-bold tabular-nums text-[#7a6e0e]">{r.total}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Tablero: columnas a una pantalla, scroll interno (no una página kilométrica) ── */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNAS.map((col) => {
          const items = visibles.filter((p) => p.etapa === col.k);
          const Icon = col.icon;
          return (
            <div key={col.k} className="flex max-h-[calc(100vh-300px)] min-h-[300px] w-56 shrink-0 flex-col">
              <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2" style={{ background: `${col.tint}14` }}>
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
                  className="mb-2 inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-md border border-navy/15 bg-navy/5 px-2 py-1 text-[11px] font-medium text-navy transition hover:bg-navy/10"
                >
                  Avanzar todas → {NOMBRE[NEXT_TANDA[col.k]] ?? NEXT_TANDA[col.k]}
                </button>
              )}
              <div className="-mr-1 min-h-0 flex-1 space-y-2 overflow-y-auto pb-1 pr-1">
                {items.map((p) => (
                  <Tarjeta key={p.id} p={p} h={h} tiendas={tiendas} seleccionado={sel.has(p.id)} onSel={() => toggleSel(p.id, p.etapa)} />
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line py-5 text-center text-xs text-slate-400">
                    {ql || sedeF || tipoF ? 'sin coincidencias' : '— vacío —'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          key={toast.msg}
          className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 animate-fade items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lift ${
            toast.tono === 'gold'
              ? 'bg-gold text-navy'
              : toast.tono === 'warn'
                ? 'bg-amber-600 text-white'
                : 'bg-navy text-white'
          }`}
          role="status"
        >
          <span className="inline-flex items-center gap-1.5">
            {toast.tono === 'warn' ? (
              <Undo2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
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

function NavLink({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'relative -mb-px border-b-2 px-3 py-2 text-sm transition-colors',
        activo ? 'border-navy font-semibold text-navy' : 'border-transparent text-muted/70 hover:text-navy',
      )}
    >
      {children}
    </a>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        on ? 'bg-navy text-paper' : 'border border-line bg-white text-navy hover:border-gold',
      )}
    >
      {children}
    </button>
  );
}

function Tarjeta({
  p,
  h,
  tiendas,
  seleccionado,
  onSel,
}: {
  p: PrendaPasada;
  h: Handlers;
  tiendas: string[];
  seleccionado: boolean;
  onSel: () => void;
}) {
  const dests = (TRANSICIONES as Record<string, readonly string[]>)[p.etapa] ?? [];
  const meta = [p.tipo, p.color, p.talla ? `T.${p.talla}` : ''].filter(Boolean).join(' · ');
  const esTerno = (p.tipo ?? '').toLowerCase().includes('terno');
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-2 shadow-card transition hover:shadow-lift',
        seleccionado ? 'border-navy ring-2 ring-navy/30' : 'border-line',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
          style={{ background: COL_MAP[p.color ?? ''] ?? '#cbd5e1' }}
          title={p.color ?? ''}
        />
        <span className="truncate font-mono text-sm font-semibold text-navy">{p.codigo}</span>
        {esTerno && (
          <button
            type="button"
            onClick={() => h.dividir(p.id)}
            aria-label="Dividir en saco + pantalón"
            title="Dividir en saco + pantalón"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:bg-navy/5 hover:text-navy"
          >
            <Split className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
        <button
          type="button"
          onClick={onSel}
          aria-label="Seleccionar"
          className={cn(
            'ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
            seleccionado ? 'border-navy bg-navy text-white' : 'border-line text-transparent hover:border-navy',
          )}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="rounded bg-navy/5 px-1.5 py-0.5 font-mono text-[10px] text-navy">{p.sedeOrigenCod}</span>
        {Boolean(meta) && <span className="truncate text-[11px] leading-tight text-slate-500">{meta}</span>}
      </div>
      {(Boolean(p.tipoLavado) || Boolean(p.necesitaCompostura) || Boolean(p.aprobada)) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {Boolean(p.tipoLavado) && (
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', tipoLavadoCls(p.tipoLavado ?? ''))}>
              {p.tipoLavado}
            </span>
          )}
          {Boolean(p.necesitaCompostura) && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">compostura</span>
          )}
          {Boolean(p.aprobada) && (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              <Check className="h-2.5 w-2.5" strokeWidth={3} /> ok
            </span>
          )}
        </div>
      )}
      {Boolean(p.obsCalidad) && (
        <div className="mt-1 flex items-start gap-1 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" strokeWidth={2.5} /> {p.obsCalidad}
        </div>
      )}

      {dests.length > 0 && (
        <div className="mt-1.5 flex gap-1">
          {dests.map((d) => (
            <button
              key={d}
              onClick={() => h.avanzar(p.id, d, p.etapa)}
              title={`Avanzar a ${NOMBRE[d] ?? d}`}
              className="inline-flex flex-1 items-center justify-center gap-1 truncate rounded-md bg-navy px-1.5 py-1 text-[11px] font-medium text-white transition hover:bg-[#26345c] active:scale-[.98]"
            >
              <span className="truncate">{NOMBRE[d] ?? d}</span>
              <ArrowRight className="h-3 w-3 shrink-0" strokeWidth={2.5} />
            </button>
          ))}
        </div>
      )}

      {p.etapa === 'listo' && <Enviar p={p} h={h} tiendas={tiendas} />}
      {p.etapa === 'control_calidad' && <Rechazar p={p} h={h} />}
      {/* La confirmación es de la tienda receptora: vive en /pipeline/envios, no en el kanban del almacén. */}
      {p.etapa === 'enviado' && (
        <a
          href="/pipeline/envios"
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted transition hover:border-gold hover:text-navy"
        >
          Confirmar en Envíos <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </a>
      )}
    </div>
  );
}

function Enviar({ p, h, tiendas }: { p: PrendaPasada; h: Handlers; tiendas: string[] }) {
  const [sede, setSede] = useState(tiendas.includes(p.sedeOrigenCod) ? p.sedeOrigenCod : tiendas[0] ?? 'LB');
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <select
        value={sede}
        onChange={(e) => setSede(e.target.value)}
        className="rounded-md border border-line bg-white px-1.5 py-1 text-xs text-navy"
        aria-label="Sede destino"
      >
        {tiendas.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
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

