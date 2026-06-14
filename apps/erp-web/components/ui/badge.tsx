import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'navy' | 'gold' | 'green' | 'amber' | 'gray';

const tones: Record<Tone, string> = {
  navy: 'bg-navy/10 text-navy',
  gold: 'bg-gold/20 text-[#7a6e0e]',
  green: 'bg-emerald-600/10 text-emerald-700',
  amber: 'bg-amber-500/20 text-amber-700',
  gray: 'bg-ink/10 text-muted',
};

export function Badge({
  tone = 'gray',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
