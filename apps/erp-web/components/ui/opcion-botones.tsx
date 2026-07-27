'use client';

import { cn } from '../../lib/cn';

export type Opcion<T extends string = string> = { value: T; label: string };

// Extraído del patrón de pills que ya usaba el selector de Tipo en pedidos/cliente.tsx (Fase 3):
// botones > selects para cualquier grupo de ≤5 opciones — más rápido de tocar en mostrador que
// abrir un <select>, y el valor elegido queda siempre a la vista sin abrir nada.
export function OpcionBotones<T extends string = string>({
  opciones,
  value,
  onChange,
  ariaLabel,
  className,
  disabled,
}: {
  opciones: Opcion<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-1.5', className)}>
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === o.value ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
