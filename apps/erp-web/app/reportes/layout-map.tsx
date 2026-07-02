'use client';

import { useMemo } from 'react';
import { Check, Eye, X } from 'lucide-react';
import type { TurnoReporte } from '@scilb/core';
import type { LayoutZona } from '../../lib/reportes-repo';
import { cn } from '../../lib/cn';

const W = 800;
const H = 580;

// ¿la zona aplica para el turno? mañana/tarde/ambos; C (completo) = ambos. (routes/layout.js + app.js)
function aplicaTurno(zTurno: string, turno: TurnoReporte): boolean {
  const z = (zTurno || 'ambos').toLowerCase();
  if (turno === 'C') return true;
  if (turno === 'M') return z === 'ambos' || z === 'mañana';
  if (turno === 'T') return z === 'ambos' || z === 'tarde';
  return true;
}

const puntuable = (z: LayoutZona) => z.tipo !== 'area';

// Color por estado de evaluación: ✓=1 verde · 👁=0.5 ámbar · ✗=0 rojo (espeja el viejo).
function colorEstado(v: number): string {
  if (v >= 1) return '#16a34a';
  if (v >= 0.5) return '#d97706';
  return '#dc2626';
}

export function LayoutMap({
  zonas,
  turno,
  selected,
  onChange,
  readOnly = false,
  modo = 'select',
  estados,
  onCycle,
  onMass,
}: {
  zonas: LayoutZona[];
  turno: TurnoReporte;
  selected: string[];
  onChange?: (cods: string[]) => void;
  readOnly?: boolean;
  // 'select' (crear): marca/desmarca zonas limpiadas. 'eval' (evaluar): cada zona cicla ✓→👁→✗.
  modo?: 'select' | 'eval';
  estados?: Record<string, number>;
  onCycle?: (cod: string) => void;
  onMass?: (v: number) => void;
}) {
  const sel = useMemo(() => new Set(selected), [selected]);
  const esEval = modo === 'eval';
  const estadoDe = (cod: string) => estados?.[cod] ?? 1;

  const mostradas = useMemo(() => zonas.filter((z) => aplicaTurno(z.turno, turno)), [zonas, turno]);
  const especiales = useMemo(() => mostradas.filter((z) => z.forma === 'special'), [mostradas]);
  const enMapa = useMemo(() => mostradas.filter((z) => z.forma !== 'special'), [mostradas]);

  const totalPts = useMemo(() => mostradas.filter(puntuable).reduce((s, z) => s + z.peso, 0), [mostradas]);
  const ganados = useMemo(() => {
    if (esEval) return mostradas.filter(puntuable).reduce((s, z) => s + z.peso * estadoDe(z.cod), 0);
    return mostradas.filter((z) => puntuable(z) && sel.has(z.cod)).reduce((s, z) => s + z.peso, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostradas, sel, esEval, estados]);

  const emit = (cods: string[]) => onChange?.(cods);
  const toggle = (cod: string) => {
    if (readOnly) return;
    if (esEval) {
      onCycle?.(cod);
      return;
    }
    emit(sel.has(cod) ? selected.filter((c) => c !== cod) : [...selected, cod]);
  };

  // En solo-lectura (vista) mostramos solo las zonas marcadas; en eval, todas.
  const especialesVisibles = readOnly && !esEval ? especiales.filter((z) => sel.has(z.cod)) : especiales;

  // Fondo de una zona del mapa según el modo.
  const fondoZona = (z: LayoutZona): string => {
    if (esEval) return colorEstado(estadoDe(z.cod));
    const on = sel.has(z.cod);
    return on ? '#16a34a' : readOnly ? `${z.color}55` : z.color;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && !esEval && (
          <>
            <button type="button" onClick={() => emit(mostradas.filter(puntuable).map((z) => z.cod))} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]">
              <Check className="h-3 w-3" strokeWidth={2.5} /> Turno
            </button>
            <button type="button" onClick={() => emit(zonas.filter(puntuable).map((z) => z.cod))} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]">
              <Check className="h-3 w-3" strokeWidth={2.5} /> Todas
            </button>
            <button type="button" onClick={() => emit([])} className="rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors duration-150 hover:border-gold active:scale-[0.97]">
              Limpiar
            </button>
          </>
        )}
        {!readOnly && esEval && onMass && (
          <>
            <button type="button" onClick={() => onMass(1)} className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors duration-150 hover:bg-emerald-100 active:scale-[0.97]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Aprobar
            </button>
            <button type="button" onClick={() => onMass(0.5)} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-100 active:scale-[0.97]">
              <Eye className="h-3.5 w-3.5" strokeWidth={2.5} /> Observar
            </button>
            <button type="button" onClick={() => onMass(0)} className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors duration-150 hover:bg-red-100 active:scale-[0.97]">
              <X className="h-3.5 w-3.5" strokeWidth={2.5} /> Rechazar
            </button>
          </>
        )}
        {especialesVisibles.map((z) => {
          const on = sel.has(z.cod);
          const fondo = esEval ? colorEstado(estadoDe(z.cod)) : on ? 'emerald' : '';
          return (
            <button
              key={z.cod}
              type="button"
              disabled={readOnly}
              onClick={() => toggle(z.cod)}
              title={z.nombre}
              style={esEval ? { borderColor: fondo, color: fondo, background: `${fondo}14` } : undefined}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                !esEval && (on ? 'border-emerald-600 bg-emerald-600/10 text-emerald-700' : 'border-line bg-white text-muted hover:border-gold'),
                readOnly && 'cursor-default',
              )}
            >
              {esEval ? (
                estadoDe(z.cod) >= 1 ? <Check className="h-3 w-3" strokeWidth={2.5} /> : estadoDe(z.cod) >= 0.5 ? <Eye className="h-3 w-3" strokeWidth={2.5} /> : <X className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                on && <Check className="h-3 w-3" strokeWidth={2.5} />
              )}
              {z.nombre}
            </button>
          );
        })}
        <span className="ml-auto rounded-full bg-emerald-600/10 px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-emerald-700">
          {Math.round(ganados * 10) / 10} / {Math.round(totalPts * 10) / 10} pts
        </span>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg border border-line bg-slate-50" style={{ aspectRatio: `${W} / ${H}` }}>
        {enMapa.map((z) => {
          const on = sel.has(z.cod);
          const esArea = z.tipo === 'area';
          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${(z.posX / W) * 100}%`,
            top: `${(z.posY / H) * 100}%`,
            width: `${(z.ancho / W) * 100}%`,
            height: `${(z.alto / H) * 100}%`,
            borderRadius: z.forma === 'circle' ? '9999px' : 4,
            clipPath: z.forma === 'tri' ? 'polygon(50% 0, 100% 100%, 0 100%)' : undefined,
          };
          if (esArea) {
            return (
              <div
                key={z.cod}
                style={{ ...style, background: `${z.color}22`, border: `1px dashed ${z.color}` }}
                className="flex items-center justify-center overflow-hidden"
                title={z.nombre}
              >
                <span className="px-1 text-center text-[8px] leading-tight text-slate-500">{z.nombre}</span>
              </div>
            );
          }
          const fondo = fondoZona(z);
          const marcado = esEval ? true : on;
          return (
            <button
              key={z.cod}
              type="button"
              disabled={readOnly}
              onClick={() => toggle(z.cod)}
              title={`${z.nombre} · ${z.peso} pts`}
              style={{ ...style, background: fondo, outline: marcado ? `2px solid ${fondo}` : 'none', outlineOffset: -1 }}
              className={cn(
                'flex items-center justify-center overflow-hidden text-white transition-[background-color] duration-100',
                readOnly ? 'cursor-default' : 'hover:brightness-110',
              )}
            >
              {esEval ? (
                estadoDe(z.cod) >= 1 ? <Check className="h-3 w-3" strokeWidth={3} /> : estadoDe(z.cod) >= 0.5 ? <Eye className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />
              ) : on ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <span className="px-0.5 text-[7px] font-medium leading-none opacity-90">{z.cod}</span>
              )}
            </button>
          );
        })}
      </div>

      {esEval && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" strokeWidth={3} /> Aprobado ×1</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3 text-amber-600" strokeWidth={3} /> Observado ×0.5</span>
          <span className="inline-flex items-center gap-1"><X className="h-3 w-3 text-red-600" strokeWidth={3} /> Rechazado ×0</span>
          <span className="ml-auto text-muted/80">Clic en cada zona para ciclar el estado</span>
        </div>
      )}
    </div>
  );
}
