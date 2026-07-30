'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { activoBloqueadoPor, type ActivoInventario, type TipoLinea } from '@scilb/core';
import { cn } from '../../lib/cn';

// Extraído de app/pedidos/cliente.tsx (Fase 8, componente embebido ahí como "ActivoPicker" de
// un solo ítem) — Fase 9 lo comparte con el constructor multi-línea. A diferencia del original:
// - Combobox teclado-first: ↑/↓ mueve el resaltado, Enter elige, Esc limpia — mismo contrato que
//   pide el plan para "los pickers" (extiende el patrón visual de PersonaPicker).
// - Muestra en gris + motivo las piezas bloqueadas por su familia (padre/hijo, NUNCA el hermano —
//   ver familiaDeActivo en @scilb/core) en vez de escondarlas, como pide el layout de la Fase 9.
// - `onSeleccionar` entrega también el precio sugerido según el tipo de línea activo, así
//   "escribir el código + Enter" arma la línea completa de un solo golpe (atajo F2/Ctrl+K).
export function precioSugeridoActivo(tipo: TipoLinea, a: ActivoInventario): number {
  if (tipo === 'alquiler') return a.precioAlquiler;
  if (tipo === 'venta') return a.precioVenta;
  return a.precioBase;
}

const ESTADO_LABEL: Record<string, string> = {
  disponible: 'Disponible',
  alquilado: 'Alquilado',
  vendido: 'Vendido',
  en_pipeline: 'En lavandería',
  codificando: 'Codificando',
  en_compostura: 'En compostura',
  en_almacen: 'En almacén',
  baja: 'De baja',
};

export function ActivoPicker({
  activos,
  tipo,
  onSeleccionar,
  placeholder = 'Código, tipo, talla, color… (F2 / Ctrl+K)',
  excluidos,
  inputRef: inputRefProp,
  testId,
}: {
  activos: ActivoInventario[];
  tipo: TipoLinea;
  onSeleccionar: (activo: ActivoInventario, precioSugerido: number) => void;
  placeholder?: string;
  excluidos?: Set<string>;
  inputRef?: React.RefObject<HTMLInputElement>;
  testId?: string;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? localRef;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtrados = useMemo(() => {
    const disponibles = activos.filter((a) => !excluidos?.has(a.id));
    const n = q.trim().toLowerCase();
    const base = n
      ? disponibles.filter((a) => `${a.codigo} ${a.tipo} ${a.talla} ${a.color}`.toLowerCase().includes(n))
      : disponibles;
    return base.slice(0, 30);
  }, [activos, excluidos, q]);

  useEffect(() => {
    setHi(0);
  }, [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${hi}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  function elegir(a: ActivoInventario) {
    const bloqueo = activoBloqueadoPor(activos, a.id);
    if (bloqueo) return; // no se puede elegir un activo bloqueado por su familia
    onSeleccionar(a, precioSugeridoActivo(tipo, a));
    setQ('');
    setOpen(false);
    setHi(0);
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
      const a = filtrados[hi];
      if (a) elegir(a);
    } else if (e.key === 'Escape') {
      if (q) {
        e.preventDefault();
        setQ('');
      }
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <div className="relative">
      <div className="relative rounded-md border border-line focus-within:border-gold">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          ref={inputRef}
          data-testid={testId}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-white py-2.5 pl-9 pr-3 text-sm text-navy outline-none placeholder:text-muted"
          autoComplete="off"
        />
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white p-1 shadow-lift"
        >
          {filtrados.map((a, idx) => {
            const bloqueo = activoBloqueadoPor(activos, a.id);
            const noDisponible = !bloqueo && a.estado !== 'disponible';
            const deshabilitado = Boolean(bloqueo) || noDisponible;
            return (
              <button
                key={a.id}
                type="button"
                data-idx={idx}
                data-testid="activo-picker-row"
                disabled={deshabilitado}
                onMouseEnter={() => setHi(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(a)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                  deshabilitado ? 'cursor-not-allowed text-muted/60' : idx === hi ? 'bg-navy/10' : 'hover:bg-paper',
                )}
              >
                <span className={cn('font-mono', !deshabilitado && 'text-navy')}>{a.codigo}</span>
                <span className="truncate text-xs text-muted">
                  {a.tipo} {a.talla} · {a.color}
                  {bloqueo && <> · ocupado por {bloqueo.codigo}</>}
                  {noDisponible && <> · {ESTADO_LABEL[a.estado] ?? a.estado}</>}
                </span>
              </button>
            );
          })}
          {filtrados.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted">Sin coincidencias — puede ser un servicio sin activo.</p>
          )}
        </div>
      )}
    </div>
  );
}
