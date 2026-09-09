import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// `migas` es la ranura de la fase 3: opcional, sin consumidor todavía (ninguna pantalla usa
// migas hoy) — se deja lista para cuando la primera la necesite, no antes.
export function PageHeader({
  title,
  subtitle,
  action,
  migas,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  migas?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-7 animate-page-enter', className)}>
      {migas && <div className="mb-1.5 text-apoyo">{migas}</div>}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-titulo font-display font-bold leading-none text-navy">{title}</h1>
          {subtitle && <p className="mt-2 text-apoyo text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {/* Dos tramos: 2.5rem de oro (la marca, fija) + 1.5rem del acento del módulo (el lugar,
          cambia; fase 5). Reemplaza a `.gold-rule` acá — sigue viva para quien la use suelta. */}
      <div className="hilo-titulo mt-4" />
    </div>
  );
}
