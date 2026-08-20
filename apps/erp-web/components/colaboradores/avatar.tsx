import { cn } from '../../lib/cn';

// Iniciales en un disco dorado. La columna `iniciales` de `empleados` manda cuando está cargada
// (alguien la eligió); si no, se derivan del nombre.
//
// Se derivan del PRIMER nombre y del PRIMER apellido, no de las dos primeras palabras: "María del
// Carmen Aliaga" tiene que dar MA, no MD.

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di']);

export function inicialesDe(nombre: string, guardadas?: string | null): string {
  const g = (guardadas ?? '').trim();
  if (g) return g.slice(0, 2).toUpperCase();
  const partes = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  if (!partes.length) return '—';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const tamanos = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-14 w-14 text-base',
} as const;

export function Avatar({
  nombre,
  iniciales,
  size = 'md',
  className,
}: {
  nombre: string;
  iniciales?: string | null;
  size?: keyof typeof tamanos;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full bg-gold font-semibold tracking-wide text-navy-deep',
        tamanos[size],
        className,
      )}
    >
      {inicialesDe(nombre, iniciales)}
    </span>
  );
}
