'use client';

import { useMemo, useState } from 'react';
import { Search, Star, Wallet, Plus } from 'lucide-react';
import type { ExtraCatalogo } from '../../../lib/reportes-repo';
import { campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const GRUPOS = [
  { tipo: 'por_puntos', titulo: 'Por puntos', icono: Star },
  { tipo: 'remunerada', titulo: 'Remuneradas', icono: Wallet },
] as const;

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtPts = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

// Selector de extras del catálogo: buscador + tarjetas agrupadas por tipo, con los puntos de cada
// una a la vista. Reemplaza al <select> largo. Tocar una tarjeta AGREGA +1 (misma lógica de antes:
// `onAgregar` es agregarCatalogo del formulario), y la tarjeta muestra cuántas van.
export function SelectorExtras({
  catalogo,
  cantidades,
  onAgregar,
}: {
  catalogo: ExtraCatalogo[];
  cantidades: Record<string, number>;
  onAgregar: (c: ExtraCatalogo) => void;
}) {
  const [q, setQ] = useState('');
  const filtrado = useMemo(() => {
    const t = sinTildes(q.trim());
    return t ? catalogo.filter((c) => sinTildes(`${c.nombre} ${c.cod}`).includes(t)) : catalogo;
  }, [catalogo, q]);

  return (
    <div className="space-y-3">
      <span className="block text-rotulo font-display uppercase text-muted">Agregar del catálogo</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar una actividad extra…"
          aria-label="Buscar una actividad extra"
          className={cn(campoCls, 'w-full pl-9')}
        />
      </div>

      {filtrado.length === 0 ? (
        <p className="py-3 text-center text-apoyo text-muted">Ninguna actividad coincide con «{q}».</p>
      ) : (
        <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {GRUPOS.map(({ tipo, titulo, icono: Icono }) => {
            const grupo = filtrado.filter((c) => c.tipoAct === tipo);
            if (!grupo.length) return null;
            return (
              <section key={tipo}>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-apoyo font-semibold text-navy">
                  <Icono className={cn('h-3.5 w-3.5', tipo === 'remunerada' ? 'text-gold-deep' : 'text-navy/50')} strokeWidth={2} aria-hidden />
                  {titulo}
                  <span className="font-normal text-muted">· {grupo.length}</span>
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {grupo.map((c) => {
                    const n = cantidades[c.cod] ?? 0;
                    return (
                      <li key={c.cod}>
                        <button
                          type="button"
                          onClick={() => onAgregar(c)}
                          className={cn(
                            'anillo group flex w-full items-center gap-2 rounded-r-medio border px-3 py-2 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98]',
                            n > 0 ? 'border-gold bg-gold/5' : 'border-line bg-white hover:border-gold',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-cuerpo font-medium text-navy">{c.nombre}</span>
                            <span className="block text-micro text-muted">
                              {c.peso > 0 ? <span className="tabular-nums">{fmtPts(c.peso)} pts por {c.unidad || 'unidad'}</span> : 'Se paga aparte'}
                              {n > 0 && <span className="tabular-nums"> · ya van {n}</span>}
                            </span>
                          </span>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-r-pastilla bg-navy/5 text-navy transition-colors group-hover:bg-gold group-hover:text-white">
                            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
