'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
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

export function LayoutMap({
  zonas,
  turno,
  selected,
  onChange,
  readOnly = false,
}: {
  zonas: LayoutZona[];
  turno: TurnoReporte;
  selected: string[];
  onChange?: (cods: string[]) => void;
  readOnly?: boolean;
}) {
  const sel = useMemo(() => new Set(selected), [selected]);

  const mostradas = useMemo(() => zonas.filter((z) => aplicaTurno(z.turno, turno)), [zonas, turno]);
  const especiales = useMemo(() => mostradas.filter((z) => z.forma === 'special'), [mostradas]);
  const enMapa = useMemo(() => mostradas.filter((z) => z.forma !== 'special'), [mostradas]);

  const totalPts = useMemo(() => mostradas.filter(puntuable).reduce((s, z) => s + z.peso, 0), [mostradas]);
  const ganados = useMemo(
    () => mostradas.filter((z) => puntuable(z) && sel.has(z.cod)).reduce((s, z) => s + z.peso, 0),
    [mostradas, sel],
  );

  const emit = (cods: string[]) => onChange?.(cods);
  const toggle = (cod: string) => {
    if (readOnly) return;
    emit(sel.has(cod) ? selected.filter((c) => c !== cod) : [...selected, cod]);
  };

  // En solo-lectura mostramos únicamente las zonas marcadas (las limpiadas).
  const especialesVisibles = readOnly ? especiales.filter((z) => sel.has(z.cod)) : especiales;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <>
            <button type="button" onClick={() => emit(mostradas.filter(puntuable).map((z) => z.cod))} className="rounded-md border border-line px-2 py-1 text-xs text-navy hover:border-gold">
              ✓ Turno
            </button>
            <button type="button" onClick={() => emit(zonas.filter(puntuable).map((z) => z.cod))} className="rounded-md border border-line px-2 py-1 text-xs text-navy hover:border-gold">
              ✓ Todas
            </button>
            <button type="button" onClick={() => emit([])} className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-gold">
              Limpiar
            </button>
          </>
        )}
        {especialesVisibles.map((z) => {
          const on = sel.has(z.cod);
          return (
            <button
              key={z.cod}
              type="button"
              disabled={readOnly}
              onClick={() => toggle(z.cod)}
              title={z.nombre}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                on ? 'border-emerald-600 bg-emerald-600/10 text-emerald-700' : 'border-line bg-white text-muted hover:border-gold',
                readOnly && 'cursor-default',
              )}
            >
              {on && <Check className="h-3 w-3" strokeWidth={2.5} />}
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
          // En solo-lectura las no marcadas se ven tenues (referencia); la marcada resalta en verde.
          const fondo = on ? '#16a34a' : readOnly ? `${z.color}55` : z.color;
          return (
            <button
              key={z.cod}
              type="button"
              disabled={readOnly}
              onClick={() => toggle(z.cod)}
              title={`${z.nombre} · ${z.peso} pts`}
              style={{ ...style, background: fondo, outline: on ? '2px solid #15803d' : 'none', outlineOffset: -1 }}
              className={cn(
                'flex items-center justify-center overflow-hidden text-white transition-[background-color] duration-100',
                readOnly ? 'cursor-default' : 'hover:brightness-110',
              )}
            >
              {on ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <span className="px-0.5 text-[7px] font-medium leading-none opacity-90">{z.cod}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
