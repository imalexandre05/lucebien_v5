'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

type Persona = { id: string; nombre: string };

function iniciales(n: string): string {
  const p = n.trim().split(/\s+/).filter(Boolean);
  return (p.map((w) => w[0]).slice(0, 2).join('') || '·').toUpperCase();
}

// Selector de personas compacto e inline (buscar → lista con avatar+check), espejando el
// `persona-wrap` del SCI viejo. Multi-select por defecto; `single` para uno solo (encargado).
export function PersonaPicker({
  empleados,
  selected,
  onChange,
  placeholder = 'Buscar…',
  single = false,
}: {
  empleados: Persona[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  single?: boolean;
}) {
  const [q, setQ] = useState('');
  const sel = useMemo(() => new Set(selected), [selected]);
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
    <div className="overflow-hidden rounded-md border border-line bg-white">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full border-b border-line px-2.5 py-1.5 text-xs text-navy outline-none placeholder:text-muted"
      />
      <div className="max-h-44 overflow-y-auto p-1">
        {filtrados.map((e) => {
          const on = sel.has(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => toggle(e.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors',
                on ? 'bg-navy/5' : 'hover:bg-paper',
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-deep text-[9px] font-bold text-gold">
                {iniciales(e.nombre)}
              </span>
              <span className="flex-1 truncate text-navy">{e.nombre}</span>
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  on ? 'border-navy bg-navy text-paper' : 'border-line',
                )}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        {filtrados.length === 0 && <p className="px-2 py-2 text-xs text-muted">Sin coincidencias.</p>}
      </div>
      <div className="border-t border-line px-2.5 py-1 text-[10px] text-muted">
        {single ? (selected.length ? '1 seleccionado' : 'ninguno') : `${selected.length} seleccionado(s)`}
      </div>
    </div>
  );
}
