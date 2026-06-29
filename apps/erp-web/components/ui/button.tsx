import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

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

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
