import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-navy text-paper hover:bg-navy-dark',
  gold: 'bg-gold text-navy-deep hover:bg-gold-soft',
  outline: 'border border-navy/25 text-navy hover:bg-navy/5',
  ghost: 'text-navy hover:bg-navy/5',
};

export function buttonVariants({ variant = 'primary' }: { variant?: Variant } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-50',
    variants[variant],
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
