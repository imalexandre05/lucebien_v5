'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Check, Eye, X, Square, CheckSquare } from 'lucide-react';
import type { TurnoReporte } from '@scilb/core';
import type { LayoutZona } from '../../lib/reportes-repo';
import { cn } from '../../lib/cn';

// Mapa de limpieza (Reporte de Actividades): lienzo 800×580 del sistema viejo, elevado. Las zonas conservan
// su lenguaje: color por turno (ámbar AM / azul PM, viene de la BD), domo para maniquíes,
// rayas para plancha/riel, chip ✓ al marcar, y CALLE/PISO como tarjetas de actividad arriba
// y abajo del lienzo. En evaluación cada zona cicla ✓→👁→✗ y hay panel de calificación.

export const LIENZO_W = 800;
export const LIENZO_H = 580;

// Instrucción de limpieza por tipo/prefijo (defaults portados de public/js/layout-map.js).
const INSTR_TIPO: Record<string, string> = {
  maniqui: 'Desempolvar con escobilla para ternos',
  vitrina: 'Limpiar con limpiavidrios y trapo especial para vidrios',
  espejo: 'Limpiar con limpiavidrios y paño seco',
  mueble: 'Limpiar superficie con trapo húmedo y limpiatodo',
  riel: 'Desempolvar ternos colgados y limpiar el tubo/varilla',
  silla: 'Limpiar cojín con trapo si hay suciedad',
  equipo: 'Limpiar mesa de plancha y tanque de agua',
  area: 'Limpiar y ordenar el área',
};
const INSTR_PREFIJO: Record<string, string> = {
  MC: 'Limpiar mesa de máquina de costura con trapo',
  CB: 'Limpiar mueble colgante y todos los objetos que contiene',
  CT: 'Desempolvar rieles colgantes del techo (cada 2 semanas)',
  PC: 'Limpiar computadora y mueble donde está ubicada',
  CO: 'Limpiar corbatero con trapo',
  ME: 'Limpiar estante y reorganizar contenido',
};

export function instruccionDe(z: Pick<LayoutZona, 'cod' | 'tipo'>): string {
  const pref = z.cod.toUpperCase().slice(0, 2);
  return INSTR_PREFIJO[pref] ?? INSTR_TIPO[z.tipo] ?? 'Limpiar y ordenar';
}

// ¿la zona aplica para el turno? mañana/tarde/ambos; C (completo) = ambos. (routes/layout.js + app.js)
function aplicaTurno(zTurno: string, turno: TurnoReporte): boolean {
  const z = (zTurno || 'ambos').toLowerCase();
  if (turno === 'C') return true;
  if (turno === 'M') return z === 'ambos' || z === 'mañana';
  if (turno === 'T') return z === 'ambos' || z === 'tarde';
  return true;
}

const puntuable = (z: LayoutZona) => z.tipo !== 'area';

// Forma CSS de una zona (compartida con el editor de layout). El "tri" del viejo es el
// domo de maniquí (arco arriba); plancha redondeada; riel/vitrina rectas.
export function formaZona(z: Pick<LayoutZona, 'forma' | 'cod'>): CSSProperties {
  if (z.forma === 'tri') return { borderRadius: '50% 50% 6px 6px' };
  if (z.cod.toUpperCase().includes('PLANCHA')) return { borderRadius: 12 };
  if (z.forma === 'circle') return { borderRadius: '9999px' };
  return { borderRadius: 5 };
}

// Overlay de textura (rayas) para plancha y rieles, como el viejo.
export function texturaZona(z: Pick<LayoutZona, 'tipo' | 'cod'>): ReactNode {
  const esPlancha = z.cod.toUpperCase().includes('PLANCHA');
  const esRiel = z.tipo === 'riel';
  if (!esPlancha && !esRiel) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        borderRadius: 'inherit',
        background: esPlancha
          ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,.18) 3px, rgba(255,255,255,.18) 6px)'
          : 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,.22) 3px, rgba(255,255,255,.22) 5px)',
      }}
    />
  );
}

// Estado visual de evaluación: ✓=1 · 👁=0.5 · ✗=0 (pastel + borde, espeja el viejo).
const EVAL_VISUAL: Record<string, { bg: string; borde: string; chip: string }> = {
  '1': { bg: '#86efac', borde: '#16a34a', chip: '#16a34a' },
  '0.5': { bg: '#fde68a', borde: '#ca8a04', chip: '#ca8a04' },
  '0': { bg: '#fca5a5', borde: '#dc2626', chip: '#dc2626' },
};
const evalVisual = (v: number) => EVAL_VISUAL[String(v)] ?? EVAL_VISUAL['1'];

function IconoEstado({ v, className }: { v: number; className?: string }) {
  if (v >= 1) return <Check className={className} strokeWidth={3} />;
  if (v >= 0.5) return <Eye className={className} strokeWidth={3} />;
  return <X className={className} strokeWidth={3} />;
}

// Tarjeta de actividad CALLE/PISO (arriba/abajo del lienzo, como el viejo).
function TarjetaEspecial({
  z,
  sub,
  marcada,
  estadoEval,
  esEval,
  readOnly,
  onClick,
}: {
  z: LayoutZona;
  sub: string;
  marcada: boolean;
  estadoEval: number;
  esEval: boolean;
  readOnly: boolean;
  onClick: () => void;
}) {
  const ev = evalVisual(estadoEval);
  const activa = esEval || marcada;
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors duration-150',
        !readOnly && 'active:scale-[0.99]',
        readOnly && 'cursor-default',
        !esEval && (marcada ? 'border-emerald-600/60 bg-emerald-50' : 'border-dashed border-line bg-white hover:border-gold/60'),
      )}
      style={esEval ? { borderColor: ev.borde, background: `${ev.bg}55` } : undefined}
    >
      {esEval ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white"
          style={{ background: ev.chip }}
        >
          <IconoEstado v={estadoEval} className="h-3 w-3" />
        </span>
      ) : marcada ? (
        <CheckSquare className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
      ) : (
        <Square className="h-5 w-5 shrink-0 text-muted/50" strokeWidth={1.75} />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-semibold', activa && !esEval ? 'text-emerald-800' : 'text-ink')}>
          {z.nombre || z.cod}
        </span>
        <span className="block text-[11px] text-muted">{sub}</span>
      </span>
      <span
        className={cn(
          'shrink-0 font-mono text-xs font-bold tabular-nums',
          !esEval && (marcada ? 'text-emerald-700' : 'text-muted'),
        )}
        style={esEval ? { color: ev.borde } : undefined}
      >
        {z.peso}pts
      </span>
    </button>
  );
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
  panelEval = false,
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
  // Panel lateral "Calificación limpieza" (por zona + total), como el viejo.
  panelEval?: boolean;
}) {
  const sel = useMemo(() => new Set(selected), [selected]);
  const esEval = modo === 'eval';
  const estadoDe = (cod: string) => estados?.[cod] ?? 1;

  // Puntúa solo lo que aplica al turno, pero el lienzo muestra la tienda completa
  // (las zonas del otro turno van atenuadas, como el viejo).
  const mostradas = useMemo(() => zonas.filter((z) => aplicaTurno(z.turno, turno)), [zonas, turno]);
  const especiales = useMemo(() => mostradas.filter((z) => z.forma === 'special'), [mostradas]);
  const enMapa = useMemo(() => zonas.filter((z) => z.forma !== 'special'), [zonas]);

  const calle = especiales.find((z) => z.cod.toUpperCase() === 'CALLE');
  const piso = especiales.find((z) => z.cod.toUpperCase() === 'PISO');
  const otrasEspeciales = especiales.filter((z) => z !== calle && z !== piso);

  const totalPts = useMemo(() => mostradas.filter(puntuable).reduce((s, z) => s + z.peso, 0), [mostradas]);
  const ganados = useMemo(() => {
    if (esEval) return mostradas.filter(puntuable).reduce((s, z) => s + z.peso * estadoDe(z.cod), 0);
    return mostradas.filter((z) => puntuable(z) && sel.has(z.cod)).reduce((s, z) => s + z.peso, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostradas, sel, esEval, estados]);

  const r1 = (n: number) => Math.round(n * 10) / 10;

  const emit = (cods: string[]) => onChange?.(cods);
  const toggle = (cod: string) => {
    if (readOnly) return;
    if (esEval) {
      onCycle?.(cod);
      return;
    }
    emit(sel.has(cod) ? selected.filter((c) => c !== cod) : [...selected, cod]);
  };

  // En solo-lectura (vista) mostramos solo lo marcado; en eval, todo.
  const visible = (z: LayoutZona) => !(readOnly && !esEval) || sel.has(z.cod);

  const pisoMarcado = piso ? sel.has(piso.cod) : false;

  const mapa = (
    <div className="min-w-0 flex-1 space-y-2">
      {/* Acciones rápidas + total */}
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && !esEval && (
          <>
            <button type="button" onClick={() => emit(mostradas.filter(puntuable).map((z) => z.cod))} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]">
              <Check className="h-3 w-3" strokeWidth={2.5} /> Turno
            </button>
            <button type="button" onClick={() => emit(zonas.filter(puntuable).map((z) => z.cod))} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]">
              <Check className="h-3 w-3" strokeWidth={2.5} /> Todas
            </button>
            <button type="button" onClick={() => emit([])} className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-gold active:scale-[0.97]">
              Limpiar
            </button>
          </>
        )}
        {!readOnly && esEval && onMass && (
          <>
            <button type="button" onClick={() => onMass(1)} aria-label="Aprobar todas las zonas" className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors duration-150 hover:bg-emerald-100 active:scale-[0.97]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Aprobar
            </button>
            <button type="button" onClick={() => onMass(0.5)} aria-label="Observar todas las zonas" className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-100 active:scale-[0.97]">
              <Eye className="h-3.5 w-3.5" strokeWidth={2.5} /> Observar
            </button>
            <button type="button" onClick={() => onMass(0)} aria-label="Rechazar todas las zonas" className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors duration-150 hover:bg-red-100 active:scale-[0.97]">
              <X className="h-3.5 w-3.5" strokeWidth={2.5} /> Rechazar
            </button>
          </>
        )}
        {otrasEspeciales.filter(visible).map((z) => {
          const on = sel.has(z.cod);
          const ev = evalVisual(estadoDe(z.cod));
          return (
            <button
              key={z.cod}
              type="button"
              disabled={readOnly}
              onClick={() => toggle(z.cod)}
              title={`${z.nombre} · ${z.peso} pts`}
              style={esEval ? { borderColor: ev.borde, color: ev.borde, background: `${ev.bg}44` } : undefined}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150',
                !esEval && (on ? 'border-emerald-600 bg-emerald-600/10 text-emerald-700' : 'border-line bg-white text-muted hover:border-gold'),
                readOnly && 'cursor-default',
              )}
            >
              {esEval ? <IconoEstado v={estadoDe(z.cod)} className="h-3 w-3" /> : on && <Check className="h-3 w-3" strokeWidth={2.5} />}
              {z.nombre}
            </button>
          );
        })}
        <span className="ml-auto rounded-full bg-emerald-600/10 px-3 py-1 font-mono text-xs font-bold tabular-nums text-emerald-700">
          {r1(ganados)} / {r1(totalPts)} pts
        </span>
      </div>

      {/* Tarjeta CALLE */}
      {calle && visible(calle) && (
        <TarjetaEspecial
          z={calle}
          sub="Barrer y baldear con agua y detergente"
          marcada={sel.has(calle.cod)}
          estadoEval={estadoDe(calle.cod)}
          esEval={esEval}
          readOnly={readOnly}
          onClick={() => toggle(calle.cod)}
        />
      )}

      {/* Lienzo */}
      <div
        role={!readOnly && piso ? 'button' : undefined}
        aria-label={piso ? `Piso: clic en el espacio vacío para marcar "${piso.nombre}"` : undefined}
        onClick={(e) => {
          if (readOnly || !piso) return;
          if (e.target === e.currentTarget) toggle(piso.cod);
        }}
        className={cn(
          'relative w-full overflow-hidden rounded-xl border transition-colors duration-200',
          pisoMarcado && !esEval ? 'border-emerald-500/70 bg-emerald-50/70' : 'border-line bg-[#f8fafc]',
          esEval && piso && 'cursor-pointer',
          !readOnly && piso && !esEval && 'cursor-pointer',
        )}
        style={{ aspectRatio: `${LIENZO_W} / ${LIENZO_H}` }}
      >
        {/* Hint del piso, al fondo del lienzo */}
        {piso && !readOnly && (
          <span
            className={cn(
              'pointer-events-none absolute bottom-1 left-1/2 z-0 -translate-x-1/2 select-none text-[9px] font-semibold',
              pisoMarcado ? 'text-emerald-600' : 'text-muted/50',
            )}
          >
            {pisoMarcado ? '✓ Piso limpio' : 'Clic en el espacio vacío → Piso'}
          </span>
        )}

        {enMapa.map((z) => {
          const esArea = z.tipo === 'area';
          const style: CSSProperties = {
            position: 'absolute',
            left: `${(z.posX / LIENZO_W) * 100}%`,
            top: `${(z.posY / LIENZO_H) * 100}%`,
            width: `${(z.ancho / LIENZO_W) * 100}%`,
            height: `${(z.alto / LIENZO_H) * 100}%`,
            ...formaZona(z),
          };
          if (esArea) {
            return (
              <div
                key={z.cod}
                style={{ ...style, background: '#f1f5f9', border: '1px dashed #cbd5e1' }}
                className="pointer-events-none z-[1] flex items-center justify-center overflow-hidden"
                title={z.nombre}
              >
                <span className="px-1 text-center text-[8px] leading-tight text-slate-400">{z.nombre || z.cod}</span>
              </div>
            );
          }

          const on = sel.has(z.cod);
          const estado = estadoDe(z.cod);
          const miTurno = aplicaTurno(z.turno, turno);
          if (!miTurno && (readOnly || esEval)) return null;

          let bg = z.color;
          let opacity = miTurno ? 1 : 0.25;
          let ring = '1px solid rgba(0,0,0,.08)';
          let glow = '';
          let chip: ReactNode = null;

          if (!esEval && on) {
            bg = '#16a34a';
            opacity = 1;
            ring = '2px solid #15803d';
            glow = '0 0 6px rgba(22,163,74,.35)';
            chip = (
              <span className="absolute -right-1 -top-1 z-[6] flex h-3.5 w-3.5 animate-scale-in items-center justify-center rounded-full border border-white bg-emerald-700 text-white">
                <Check className="h-2 w-2" strokeWidth={4} />
              </span>
            );
          }
          if (esEval) {
            const ev = evalVisual(estado);
            bg = ev.bg;
            opacity = 1;
            ring = `2px solid ${ev.borde}`;
            glow = `0 0 5px ${ev.borde}44`;
            chip = (
              <span
                className="absolute -right-1 -top-1 z-[6] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white text-white"
                style={{ background: ev.chip }}
              >
                <IconoEstado v={estado} className="h-2 w-2" />
              </span>
            );
          }

          const oscuro = !esEval && !on && ['#eab308', '#facc15', '#c59100', '#fde68a'].includes(z.color);
          if (readOnly && !esEval && !on) return null;

          return (
            <button
              key={z.cod}
              type="button"
              disabled={readOnly || !miTurno}
              onClick={() => toggle(z.cod)}
              title={
                miTurno
                  ? `${z.nombre || z.cod} · ${z.peso} pts — ${instruccionDe(z)}`
                  : `${z.nombre || z.cod} · turno ${z.turno}`
              }
              aria-label={`${z.nombre || z.cod} (${z.peso} pts)`}
              aria-pressed={esEval ? undefined : on}
              style={{ ...style, background: bg, border: ring, opacity, boxShadow: glow || undefined, zIndex: on || esEval ? 5 : 3 }}
              className={cn(
                'flex items-center justify-center overflow-visible outline-none transition-[background-color,box-shadow,opacity] duration-150',
                readOnly || !miTurno ? 'cursor-default' : 'hover:brightness-105 focus-visible:ring-2 focus-visible:ring-gold',
              )}
            >
              {texturaZona(z)}
              {chip}
              <span
                className={cn(
                  'pointer-events-none px-0.5 font-mono text-[7px] font-semibold leading-none',
                  esEval ? 'text-ink/70' : oscuro ? 'text-[#5c3d00]' : 'text-white',
                )}
                style={{ textShadow: oscuro || esEval ? undefined : '0 0 2px rgba(0,0,0,.25)' }}
              >
                {z.cod}
              </span>
              {z.sobreCod && (
                <span className="pointer-events-none absolute -bottom-2 left-1/2 z-[6] -translate-x-1/2 whitespace-nowrap rounded-full bg-navy-deep px-1 py-px font-mono text-[6px] leading-tight text-paper/90">
                  s/{z.sobreCod}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tarjeta PISO */}
      {piso && visible(piso) && (
        <TarjetaEspecial
          z={piso}
          sub="Barrer y trapear todo el interior de la tienda"
          marcada={pisoMarcado}
          estadoEval={estadoDe(piso.cod)}
          esEval={esEval}
          readOnly={readOnly}
          onClick={() => toggle(piso.cod)}
        />
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px] bg-[#eab308]" /> AM</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px] bg-[#2563eb]" /> PM</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2 bg-[#facc15]" style={{ borderRadius: '50% 50% 2px 2px' }} /> Maniquí</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Hecho</span>
        {esEval && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            Clic:
            <Check className="h-3 w-3 text-emerald-600" strokeWidth={3} />→
            <Eye className="h-3 w-3 text-amber-600" strokeWidth={3} />→
            <X className="h-3 w-3 text-red-600" strokeWidth={3} />
          </span>
        )}
      </div>
    </div>
  );

  if (!(esEval && panelEval)) return mapa;

  // ── Panel "Calificación limpieza" (evaluación): fila por zona + total ──
  const filas = [...mostradas.filter(puntuable)].sort((a, b) => a.cod.localeCompare(b.cod));
  const frac = totalPts > 0 ? ganados / totalPts : 1;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 lg:flex-row">
      {mapa}
      <aside className="w-full shrink-0 lg:w-64">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
          Calificación limpieza
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line/60">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300', frac >= 1 ? 'bg-emerald-600' : frac >= 0.5 ? 'bg-amber-500' : 'bg-red-500')}
            style={{ width: `${Math.round(frac * 100)}%` }}
          />
        </div>
        <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {filas.map((z) => {
            const v = estadoDe(z.cod);
            const ev = evalVisual(v);
            return (
              <li key={z.cod}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggle(z.cod)}
                  title={`${z.nombre || z.cod} — clic para ciclar`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors duration-150',
                    !readOnly && 'hover:border-line hover:bg-white',
                  )}
                  style={{ background: `${ev.bg}33` }}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-white" style={{ background: ev.chip }}>
                    <IconoEstado v={v} className="h-2.5 w-2.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">{z.cod}</span>
                  <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums" style={{ color: ev.borde }}>
                    {r1(z.peso * v)}/{r1(z.peso)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 px-3 py-2">
          <span className="text-sm font-semibold text-navy">Limpieza</span>
          <span className="font-mono text-sm font-bold tabular-nums text-[#7a6e0e]">
            {r1(ganados)}/{r1(totalPts)}
          </span>
        </div>
      </aside>
    </div>
  );
}
