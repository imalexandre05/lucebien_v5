import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

const TAMANOS = { 28: 'h-7 w-7', 36: 'h-9 w-9', 44: 'h-11 w-11' } as const;
const GLIFOS = { 28: 'h-3.5 w-3.5', 36: 'h-4 w-4', 44: 'h-5 w-5' } as const;

// El glifo dentro de un cuadrado redondeado de `acento-soft`, trazo en `acento-deep` (spec §7 "Dos
// de carácter"). Es lo que más amabiliza una interfaz densa: un ícono suelto sobre papel se lee
// como decoración de sistema (un panel de control de Windows); el mismo ícono con su fondo se lee
// como un objeto.
//
// `claro`: variante para sentarse sobre un fondo de color pleno (la banda de módulo, fase 5) —
// fondo blanco translúcido en vez de `acento-soft`, porque sobre el acento mismo el soft
// desaparece.
export const IconoTinta = ({
  icon: Icon,
  tamano = 36,
  claro = false,
  className,
  ...p
}: HTMLAttributes<HTMLSpanElement> & {
  icon: LucideIcon;
  tamano?: keyof typeof TAMANOS;
  claro?: boolean;
}) => (
  <span
    className={cn(
      'inline-grid shrink-0 place-items-center rounded-r-chico transition-transform duration-instante ease-rebote',
      TAMANOS[tamano],
      claro ? 'bg-paper/20 text-paper' : 'bg-acento-soft text-acento-deep',
      className,
    )}
    {...p}
  >
    <Icon className={GLIFOS[tamano]} strokeWidth={1.9} aria-hidden />
  </span>
);
