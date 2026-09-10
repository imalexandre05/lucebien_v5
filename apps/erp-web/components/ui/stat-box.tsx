import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Rotulo } from './rotulo';
import { Cifra } from './cifra';

// Tile de resumen ("StatBox"): estaba duplicado idéntico en 9 páginas. Centralizado aquí para
// consistencia total y una sola entrada con vida (rise). `size` ajusta la escala del número
// (lg=2xl por defecto, md=xl para montos largos en S/, xl=3xl para la fila ejecutiva del
// dashboard). `icon`+`href`+`align` cubren el modo "KPI clickeable" del dashboard sin duplicar el
// componente en otra pieza.

// `tone` acepta un NOMBRE —'navy', 'gold', 'exito'…— y cae a tratarlo como clases sueltas si no
// reconoce el nombre.
//
// POR QUÉ LAS DOS COSAS. Los cuarenta call sites que existen pasan la terna de clases escrita a
// mano, y la mitad no coincide con la otra mitad: hay tres verdes distintos para decir lo mismo.
// Romperlos todos de golpe sería un cambio enorme y sin manera de revisarlo. Con el nombre, migrar
// un call site es cambiar una cadena por una palabra, y el que todavía no se migró sigue andando.
const TONOS: Record<string, string> = {
  navy: 'border-navy/15 bg-navy/5 text-navy',
  gold: 'border-gold/30 bg-gold/10 text-gold-deep',
  exito: 'border-exito-line bg-exito-soft text-exito-deep',
  aviso: 'border-aviso-line bg-aviso-soft text-aviso-deep',
  error: 'border-error-line bg-error-soft text-error-deep',
  info: 'border-info-line bg-info-soft text-info-deep',
  neutro: 'border-line bg-white text-muted',
};

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
  /** Nombre de tono ('navy' | 'gold' | 'exito' | 'aviso' | 'error' | 'info' | 'neutro') o clases sueltas. */
  tone?: string;
  size?: 'md' | 'lg' | 'xl';
  index?: number;
  icon?: LucideIcon;
  href?: string;
  align?: 'center' | 'left';
  className?: string;
}) {
  const colores = (tone && TONOS[tone]) ?? tone;
  const tile = (
    <div
      className={cn(
        'animate-rise rounded-r-medio border p-4',
        align === 'center' ? 'text-center' : 'text-left',
        href &&
          'h-full transition-[transform,box-shadow] duration-200 ease-out-expo hover-fine:-translate-y-0.5 hover:shadow-lift active:translate-y-0 active:shadow-card active:duration-75',
        colores,
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <Rotulo
        as="div"
        className={cn(Icon && 'flex items-center gap-2', Icon && align === 'center' && 'justify-center')}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />}
        <span>{label}</span>
      </Rotulo>
      <Cifra size={size} className={cn('text-current', size === 'xl' && 'mt-1.5')}>
        {valor}
      </Cifra>
      {sub != null && <div className={cn('text-micro text-muted', size === 'xl' && 'mt-1')}>{sub}</div>}
    </div>
  );

  if (!href) return tile;
  return (
    <Link href={href} className="anillo block rounded-r-medio outline-none">
      {tile}
    </Link>
  );
}
