import type { InputHTMLAttributes, SelectHTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const fieldBase =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-gold/30';

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(fieldBase, className)} {...p} />
);

export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(fieldBase, className)} {...p} />
);

export const Label = ({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('mb-1 block text-xs font-medium text-muted', className)} {...p} />
);
