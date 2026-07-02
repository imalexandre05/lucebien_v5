import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Tile de resumen ("StatBox"): estaba duplicado idéntico en 9 páginas. Centralizado aquí para
// consistencia total y una sola entrada con vida (rise). `tone` trae el color de borde/fondo;
// `size` ajusta la escala del número (lg=2xl por defecto, md=xl para montos largos en S/).
export function StatBox({
  label,
  valor,
  tone,
  size = 'lg',
  index = 0,
  className,
}: {
  label: ReactNode;
  valor: ReactNode;
  tone?: string;
  size?: 'md' | 'lg';
  index?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('animate-rise rounded-xl border p-4 text-center', tone, className)}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cn('font-mono font-bold tabular-nums', size === 'lg' ? 'text-2xl' : 'text-xl')}>
        {valor}
      </div>
    </div>
  );
}
