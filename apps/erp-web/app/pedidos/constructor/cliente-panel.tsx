'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { campoCls } from '../../../components/ui/form';
import { Search, UserPlus, X, ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/cn';

export type ClienteSel = { id?: string; nombre: string; dni: string; telefono: string };
export type ClienteOpcion = { id: string; nombre: string; dni: string; telefono: string };

const fieldCls = cn(campoCls, 'w-full py-2');

// ① CLIENTE — buscar por nombre/DNI/teléfono → chip + "Editar todo" inline, o "+ Cliente nuevo"
// en el mismo panel (sin modal). El picker en sí no escribe nada: solo arma `value`, que viaja
// completo dentro del payload único de pedido_crear (crea o actualiza el cliente en la misma
// transacción — Fase 8). Atajo `/` (manejado por el padre) enfoca `inputRef`.
export function ClientePanel({
  clientes,
  value,
  onChange,
  inputRef: inputRefProp,
}: {
  clientes: ClienteOpcion[];
  value: ClienteSel | null;
  onChange: (v: ClienteSel | null) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? localRef;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [editar, setEditar] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return clientes.slice(0, 30);
    return clientes.filter((c) => `${c.nombre} ${c.dni} ${c.telefono}`.toLowerCase().includes(n)).slice(0, 30);
  }, [clientes, q]);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${hi}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  function elegir(c: ClienteOpcion) {
    onChange({ id: c.id, nombre: c.nombre, dni: c.dni, telefono: c.telefono });
    setQ('');
    setOpen(false);
    setEditar(false);
  }
  function nuevo() {
    onChange({ nombre: q.trim(), dni: '', telefono: '' });
    setQ('');
    setOpen(false);
    setEditar(true);
  }
  function quitar() {
    onChange(null);
    setEditar(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((i) => Math.min(i + 1, filtrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtrados[hi];
      if (c) elegir(c);
      else if (q.trim()) nuevo();
    } else if (e.key === 'Escape') {
      if (q) {
        e.preventDefault();
        setQ('');
      }
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  if (value) {
    return (
      <div className="rounded-r-chico border border-line bg-navy/5 px-3 py-2.5" data-testid="cliente-elegido">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy">{value.nombre || '(sin nombre)'}</p>
            <p className="truncate tabular-nums text-xs text-muted">
              {value.dni ? `DNI ${value.dni}` : 'sin DNI'} {value.telefono && `· ${value.telefono}`}
              {!value.id && ' · cliente nuevo'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditar((v) => !v)}
              className="inline-flex items-center gap-1 rounded-r-pastilla px-2 py-1 text-xs font-medium text-navy transition-colors hover:bg-navy/10"
            >
              Editar todo <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', editar && 'rotate-180')} strokeWidth={2} />
            </button>
            <button type="button" onClick={quitar} className="text-muted transition-colors hover:text-error" aria-label="Quitar cliente">
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        {editar && (
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-line/60 pt-3 sm:grid-cols-3">
            <input
              value={value.nombre}
              onChange={(e) => onChange({ ...value, nombre: e.target.value })}
              placeholder="Nombre completo"
              className={cn(fieldCls, 'sm:col-span-1')}
            />
            <input
              value={value.dni}
              onChange={(e) => onChange({ ...value, dni: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              placeholder="DNI (8 dígitos)"
              className={fieldCls}
            />
            <input
              value={value.telefono}
              onChange={(e) => onChange({ ...value, telefono: e.target.value })}
              placeholder="Teléfono"
              className={fieldCls}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative rounded-r-chico border border-line focus-within:border-gold">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          ref={inputRef}
          data-testid="cliente-buscar"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Nombre · DNI · teléfono… (/)"
          className="w-full bg-white py-2.5 pl-9 pr-3 text-sm text-navy outline-none placeholder:text-muted"
          autoComplete="off"
        />
      </div>
      {open && (
        <div ref={listRef} className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-r-medio border border-line bg-white p-1 shadow-lift">
          {filtrados.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              data-idx={idx}
              data-testid="cliente-fila"
              onMouseEnter={() => setHi(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(c)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-r-chico px-2.5 py-1.5 text-left text-sm transition-colors',
                idx === hi ? 'bg-navy/10' : 'hover:bg-paper',
              )}
            >
              <span className="truncate font-medium text-navy">{c.nombre}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted">{c.dni || '—'} {c.telefono && `· ${c.telefono}`}</span>
            </button>
          ))}
          {filtrados.length === 0 && <p className="px-3 py-3 text-center text-xs text-muted">Sin coincidencias.</p>}
          <button
            type="button"
            data-testid="cliente-nuevo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={nuevo}
            className="mt-1 flex w-full items-center gap-2 rounded-r-chico border-t border-line px-2.5 py-2 text-left text-sm font-medium text-navy transition-colors hover:bg-gold/10"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2} />
            {q.trim() ? `+ Cliente nuevo "${q.trim()}"` : '+ Cliente nuevo'}
          </button>
        </div>
      )}
    </div>
  );
}
