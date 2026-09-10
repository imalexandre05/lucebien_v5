'use client';

import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { tonoAvatar } from '../colaboradores/avatar';

type Persona = { id: string; nombre: string; rol?: string; sedeCod?: string | null };

function iniciales(n: string): string {
  const p = n.trim().split(/\s+/).filter(Boolean);
  return (p.map((w) => w[0]).slice(0, 2).join('') || '·').toUpperCase();
}

// Rol legible y corto para el tag de la fila (espeja las "tiendas/rol" del SCI viejo).
const ROL_LABEL: Record<string, string> = {
  admin: 'Admin',
  dueno: 'Dueño/a',
  encargado_tienda: 'Enc. Tienda',
  encargado_almacen: 'Enc. Almacén',
  confeccionista: 'Confección',
  ventas_junior: 'Ventas Jr.',
  ventas_junior_2: 'Ventas Jr. 2',
};

// Selector de personas GRANDE (buscar → filas con avatar + rol/sede + check), espejando el
// `persona-wrap` del SCI viejo: filas amplias, verde al marcar y chips abajo. Multi-select por
// defecto; `single` para uno solo (encargado del turno).
export function PersonaPicker({
  empleados,
  selected,
  onChange,
  placeholder = 'Buscar…',
  single = false,
  emptyHint,
  testId,
}: {
  empleados: Persona[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  single?: boolean;
  emptyHint?: string;
  testId?: string;
}) {
  const [q, setQ] = useState('');
  const sel = useMemo(() => new Set(selected), [selected]);
  const byId = useMemo(() => new Map(empleados.map((e) => [e.id, e])), [empleados]);
  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? empleados.filter((e) => e.nombre.toLowerCase().includes(n)) : empleados;
  }, [empleados, q]);

  function toggle(id: string) {
    if (single) {
      onChange(sel.has(id) ? [] : [id]);
      return;
    }
    onChange(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-col rounded-r-medio border border-line bg-white shadow-card" data-testid={testId}>
      <div className="relative border-b border-line">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          strokeWidth={1.75}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-t-xl bg-white py-2.5 pl-9 pr-3 text-sm text-navy outline-none placeholder:text-muted"
        />
      </div>

      <div className="max-h-72 overflow-y-auto p-1.5">
        {filtrados.map((e) => {
          const on = sel.has(e.id);
          const rolLbl = e.rol ? ROL_LABEL[e.rol] ?? e.rol : null;
          const tag = [rolLbl, e.sedeCod].filter(Boolean).join(' · ');
          return (
            <button
              key={e.id}
              type="button"
              data-testid="persona-row"
              onClick={() => toggle(e.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-r-chico px-2.5 py-2 text-left transition-colors duration-150',
                on ? 'bg-navy/5' : 'hover:bg-paper',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-r-pastilla text-xs font-bold',
                  tonoAvatar(e.nombre),
                )}
              >
                {iniciales(e.nombre)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy">{e.nombre}</span>
                {tag && <span className="block truncate tabular-nums text-[11px] text-muted">{tag}</span>}
              </span>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-r-chico border-2 transition-colors duration-150',
                  on ? 'border-navy bg-navy text-paper' : 'border-line',
                )}
              >
                {on && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        {filtrados.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">Sin coincidencias.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-2.5 py-2">
        {selected.length === 0 ? (
          <span className="text-xs text-muted">{emptyHint ?? (single ? 'Elige al encargado' : 'Ningún colaborador')}</span>
        ) : (
          selected.map((id) => {
            const e = byId.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-r-pastilla bg-navy px-2.5 py-1 text-xs font-medium text-paper"
              >
                {e?.nombre ?? '—'}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-paper/70 transition-colors hover:text-paper"
                  aria-label="Quitar"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </span>
            );
          })
        )}
        <span className="ml-auto tabular-nums text-[11px] text-muted">
          {single ? `${selected.length}/1` : `${selected.length} sel.`}
        </span>
      </div>
    </div>
  );
}
