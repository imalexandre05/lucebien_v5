import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

// Tile de resumen ("StatBox"): estaba duplicado idéntico en 9 páginas. Centralizado aquí para
// consistencia total y una sola entrada con vida (rise). `tone` trae el color de borde/fondo;
// `size` ajusta la escala del número (lg=2xl por defecto, md=xl para montos largos en S/,
// xl=3xl para la fila ejecutiva del dashboard). `icon`+`href`+`align` cubren el modo "KPI
// clickeable" del dashboard sin duplicar el componente en otra pieza.
export function StatBox({
  label,
  valor,
  sub,
  tone,
  size = 'lg',
  index = 0,
  icon: Icon,
  href,
  align = 'center',
  className,
}: {
  label: ReactNode;
  valor: ReactNode;
  sub?: ReactNode;
  tone?: string;
  size?: 'md' | 'lg' | 'xl';
  index?: number;
  icon?: LucideIcon;
  href?: string;
  align?: 'center' | 'left';
  className?: string;
}) {
  const numero = { md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl' }[size];
  const tile = (
    <div
      className={cn(
        'animate-rise rounded-xl border p-4',
        align === 'center' ? 'text-center' : 'text-left',
        href &&
          'h-full transition-[transform,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-lift',
        tone,
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div
        className={cn(
          'text-[10px] font-semibold uppercase tracking-wide text-muted',
          Icon && 'flex items-center gap-2',
          Icon && align === 'center' && 'justify-center',
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />}
        <span>{label}</span>
      </div>
      <div className={cn('font-mono font-bold tabular-nums', numero, size === 'xl' && 'mt-1.5')}>
        {valor}
      </div>
      {sub != null && <div className={cn('text-[10px] text-muted', size === 'xl' && 'mt-1')}>{sub}</div>}
    </div>
  );

  if (!href) return tile;
  return (
    <Link
      href={href}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      {tile}
    </Link>
  );
}
