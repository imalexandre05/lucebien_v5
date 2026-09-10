'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconoTinta } from './icono-tinta';

// Nombre e ícono a la izquierda, `−` `valor` `+` en discos de 46px a la derecha (spec §7 "Tres
// de operario"). Escribir «4» en un campo abre el teclado del sistema, que tapa media pantalla;
// dos toques no. Se enciende en oro cuando pasa de cero — seis contadores en cero se leen todos
// iguales, el que ya tiene algo tiene que verse sin repasar uno por uno.
//
// SÓLO en la superficie de operario (§3.11) — en administración, sentado con mouse, un campo con
// teclado es más rápido.
export function ContadorMas({
  nombre,
  icono: Icon,
  valor,
  onChange,
  min = 0,
  max = 99,
}: {
  nombre: string;
  icono?: LucideIcon;
  valor: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const hay = valor > min;
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-r-grande border-2 px-3.5 py-2 transition-colors duration-base',
        hay ? 'border-gold bg-gold/[.13]' : 'border-line bg-superficie',
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5 text-sub font-display font-semibold">
        {Icon && <IconoTinta icon={Icon} tamano={28} />}
        <span className="truncate">{nombre}</span>
      </span>
      <span className="flex flex-none items-center gap-1.5">
        <button
          type="button"
          aria-label={`Quitar uno de ${nombre}`}
          disabled={valor <= min}
          onClick={() => onChange(Math.max(min, valor - 1))}
          className="anillo grid h-[46px] w-[46px] place-items-center rounded-r-pastilla bg-acento-soft text-2xl font-bold leading-none text-acento-deep transition-transform duration-instante ease-rebote active:scale-[.88] disabled:opacity-40"
        >
          −
        </button>
        <span className="w-8 text-center text-seccion font-display font-bold tabular-nums text-acento-deep">
          {valor}
        </span>
        <button
          type="button"
          aria-label={`Sumar uno a ${nombre}`}
          disabled={valor >= max}
          onClick={() => onChange(Math.min(max, valor + 1))}
          className="anillo grid h-[46px] w-[46px] place-items-center rounded-r-pastilla bg-acento-soft text-2xl font-bold leading-none text-acento-deep transition-transform duration-instante ease-rebote active:scale-[.88] disabled:opacity-40"
        >
          +
        </button>
      </span>
    </div>
  );
}
