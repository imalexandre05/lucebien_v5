import { cn } from '../../lib/cn';

// Marca LuceBien: un "crest" de etiqueta de sastre — cuadro navy con un filete dorado interior
// (el mismo gesto que la .gold-rule del sistema) y el monograma "LB" en serif. Lee igual de bien
// a 24px (topbar/favicon) que a 80px (login). Es el ancla visual memorable del atelier.

type Size = 'sm' | 'md' | 'lg' | 'xl';
type Tone = 'onLight' | 'onDark';

const MARK: Record<Size, { box: string; inset: string; rOuter: string; rInner: string; letters: string }> = {
  sm: { box: 'h-8 w-8', inset: 'inset-[3px]', rOuter: 'rounded-md', rInner: 'rounded-[4px]', letters: 'text-[13px]' },
  md: { box: 'h-10 w-10', inset: 'inset-[3.5px]', rOuter: 'rounded-lg', rInner: 'rounded-[5px]', letters: 'text-base' },
  lg: { box: 'h-14 w-14', inset: 'inset-[4px]', rOuter: 'rounded-xl', rInner: 'rounded-[7px]', letters: 'text-2xl' },
  xl: { box: 'h-20 w-20', inset: 'inset-[5px]', rOuter: 'rounded-2xl', rInner: 'rounded-[9px]', letters: 'text-4xl' },
};

const WORD: Record<Size, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-4xl',
};

export function LogoMark({ size = 'md', className }: { size?: Size; className?: string }) {
  const m = MARK[size];
  return (
    <div
      className={cn('relative shrink-0 bg-navy shadow-card', m.box, m.rOuter, className)}
      aria-hidden="true"
    >
      <div className={cn('pointer-events-none absolute border border-gold/55', m.inset, m.rInner)} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('font-display font-semibold leading-none tracking-tight text-paper', m.letters)}>
          LB
        </span>
      </div>
    </div>
  );
}

export function Logo({
  size = 'md',
  tone = 'onLight',
  orientation = 'horizontal',
  tagline = true,
  className,
}: {
  size?: Size;
  tone?: Tone;
  orientation?: 'horizontal' | 'vertical';
  tagline?: boolean;
  className?: string;
}) {
  const vertical = orientation === 'vertical';
  return (
    <div
      className={cn('flex items-center gap-3', vertical && 'flex-col gap-3', className)}
      aria-label="LuceBien"
    >
      <LogoMark size={size} />
      <div className={cn(vertical && 'text-center')}>
        <div
          className={cn(
            'font-display font-semibold leading-none',
            WORD[size],
            tone === 'onDark' ? 'text-paper' : 'text-navy',
          )}
        >
          LuceBien
        </div>
        {tagline && (
          <div className="mt-1.5 font-mono text-[10px] tracking-brand text-gold">SCI · LB</div>
        )}
      </div>
    </div>
  );
}
