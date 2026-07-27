import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-navy text-paper hover:bg-navy-dark',
  gold: 'bg-gold text-navy-deep hover:bg-gold-soft',
  outline: 'border border-navy/25 text-navy hover:bg-navy/5',
  ghost: 'text-navy hover:bg-navy/5',
};

// transition acotada (no `all`) + curva propia + feedback al presionar (scale 0.97).
const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-[transform,background-color,color] duration-150 ease-out-expo active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-50';

export function buttonVariants({ variant = 'primary' }: { variant?: Variant } = {}) {
  return cn(base, variants[variant]);
}

// `pending` (Fase 3): antes NINGÚN botón del proyecto mostraba que una acción estaba en curso —
// el usuario solo veía "se bugea o demora". Con `pending` el botón se deshabilita solo, marca
// `aria-busy` y antepone un Spinner que hereda el color del texto vía currentColor. Los call
// sites que ya alternaban su propio texto ("Guardando…") lo pueden seguir haciendo tal cual: el
// spinner es un añadido, no un reemplazo del label.
export function Button({
  variant = 'primary',
  pending = false,
  disabled,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pending?: boolean }) {
  return (
    <button
      className={cn(buttonVariants({ variant }), className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
