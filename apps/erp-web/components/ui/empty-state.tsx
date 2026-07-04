import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

// Estado vacío estándar (§4D): ícono sereno + título + copy útil + acción opcional.
// Un solo lenguaje para todos los módulos; nada de huecos ni "no hay datos" a secas.
export function EmptyState({
  icon: Icon,
  titulo,
  children,
  accion,
  compacto = false,
  className,
}: {
  icon: LucideIcon;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-5 text-center',
        compacto ? 'py-8' : 'py-12',
        className,
      )}
    >
      <Icon className="h-9 w-9 text-line" strokeWidth={1.25} aria-hidden />
      <p className="text-sm font-medium text-ink">{titulo}</p>
      {children && <p className="max-w-sm text-xs leading-relaxed text-muted">{children}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
