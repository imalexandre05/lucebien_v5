import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Número grande tabular, en Outfit (spec §3.4/§7). Reemplaza al `tabular-nums font-bold` que
// `StatBox` escribía a mano.
//
// NO FORMATEA SOLA — recibe ya armado lo que va a mostrar (texto plano, o `<CountUp>` para la
// cuenta animada, que YA vive en `count-up.tsx` y ya resuelve moneda/porcentaje con
// `prefix`/`suffix`/`decimals`). Duplicar el formateo acá es cómo se cuela una diferencia entre
// lo que se muestra y lo que se paga.
//
// Tres tamaños, iguales en píxel a los `text-xl/2xl/3xl` que `StatBox` ya usaba — cambia la
// familia (Outfit) y el tracking, no el tamaño: subir directo al `text-cifra` de 48px en las
// cuarenta tarjetas existentes habría sido un rediseño de densidad, no un afinado. `text-cifra`
// (el tamaño grande de verdad) queda reservado para el panel hero que construya la fase 6.
const TAMANOS = {
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
  cifra: 'text-cifra',
} as const;

export const Cifra = ({
  className,
  size = 'lg',
  children,
  ...p
}: HTMLAttributes<HTMLDivElement> & { size?: keyof typeof TAMANOS; children?: ReactNode }) => (
  <div className={cn('font-display font-bold tabular-nums text-navy', TAMANOS[size], className)} {...p}>
    {children}
  </div>
);
