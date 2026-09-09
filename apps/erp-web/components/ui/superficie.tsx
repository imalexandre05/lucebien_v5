import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const RADIOS = { chico: 'rounded-r-chico', medio: 'rounded-r-medio', grande: 'rounded-r-grande' } as const;
const ELEVACIONES = { 0: 'shadow-elev-0', 1: 'shadow-elev-1', 2: 'shadow-elev-2', 3: 'shadow-elev-3' } as const;

// Fondo, elevación y radio en un solo lugar (spec §7 "Seis de estructura"). Reemplaza al
// `rounded-xl border border-line bg-white shadow-sm` que cada pantalla volvía a escribir —
// basta que una lo haga con `rounded-lg` para que la fila deje de alinear con las demás.
//
// La sombra de `elev-1..3` se tiñe con `--acento` del módulo (globals.css); acá no se elige el
// acento, sólo el nivel. `elev-0` es plano, con hairline y sin sombra.
export const Superficie = ({
  className,
  elev = 1,
  radio = 'medio',
  hundida = false,
  ...p
}: HTMLAttributes<HTMLDivElement> & {
  elev?: 0 | 1 | 2 | 3;
  radio?: keyof typeof RADIOS;
  /** Fondo `superficie-hundida` en vez de `superficie` — para lo que recibe algo dentro de una tarjeta. */
  hundida?: boolean;
}) => (
  <div
    className={cn(
      hundida ? 'bg-superficie-hundida' : 'bg-superficie',
      'border border-line',
      RADIOS[radio],
      ELEVACIONES[elev],
      className,
    )}
    {...p}
  />
);
