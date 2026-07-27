import Image from 'next/image';
import { cn } from '../../lib/cn';

// Marca LuceBien real (Fase 3): reemplaza el crest de CSS (cuadro navy + texto "LB") por los PNG
// oficiales del manual de marca (docs/manual-de-marca.md, líneas 66-83). `logo_lion_white.png` y
// `logo_full_white.png` son variantes BLANCAS pensadas para fondos oscuros — por eso siguen
// viviendo dentro de una chapa navy propia (igual que el placeholder anterior): así el ícono se ve
// igual de bien en el topbar (fondo claro) que en la sidebar (fondo navy), sin depender del fondo
// que lo rodea. El favicon usa el sello a color (`logo_lion_color.png`, ver app/icon.png).

type Size = 'sm' | 'md' | 'lg' | 'xl';
type Tone = 'onLight' | 'onDark';

// Caja cuadrada del ícono — mismo box-model que el placeholder anterior, para no romper el layout
// de los call sites (topbar, login, /dispositivo, dashboard, reportes).
const BOX: Record<Size, { box: string; inset: string; rOuter: string; rInner: string; pad: string }> = {
  sm: { box: 'h-8 w-8', inset: 'inset-[3px]', rOuter: 'rounded-md', rInner: 'rounded-[4px]', pad: 'p-1.5' },
  md: { box: 'h-10 w-10', inset: 'inset-[3.5px]', rOuter: 'rounded-lg', rInner: 'rounded-[5px]', pad: 'p-2' },
  lg: { box: 'h-14 w-14', inset: 'inset-[4px]', rOuter: 'rounded-xl', rInner: 'rounded-[7px]', pad: 'p-2.5' },
  xl: { box: 'h-20 w-20', inset: 'inset-[5px]', rOuter: 'rounded-2xl', rInner: 'rounded-[9px]', pad: 'p-3.5' },
};

const BOX_PX: Record<Size, number> = { sm: 32, md: 40, lg: 56, xl: 80 };

export function LogoMark({ size = 'md', className }: { size?: Size; className?: string }) {
  const m = BOX[size];
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden bg-navy shadow-card', m.box, m.rOuter, className)}
      aria-hidden="true"
    >
      <div className={cn('pointer-events-none absolute z-10 border border-gold/55', m.inset, m.rInner)} />
      <Image
        src="/assets/logo_lion_white.png"
        alt=""
        fill
        sizes={`${BOX_PX[size]}px`}
        className={cn('object-contain', m.pad)}
        priority
      />
    </div>
  );
}

// Lockup horizontal (ícono + wordmark, ya combinados en el PNG oficial). Proporción real del
// archivo: 677×203 (~3.34:1) — se respeta siempre para no estirarlo (manual de marca §5).
const LOCKUP_SRC: Record<Tone, string> = {
  onDark: '/assets/logo_full_white.png',
  onLight: '/assets/logo_full_color.png',
};
const LOCKUP_RATIO = 677 / 203;
const LOCKUP_H_PX: Record<Size, number> = { sm: 24, md: 32, lg: 44, xl: 64 };

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
  const h = LOCKUP_H_PX[size];
  const w = Math.round(h * LOCKUP_RATIO);
  return (
    <div
      className={cn('flex items-center gap-3', vertical && 'flex-col gap-2', className)}
      aria-label="LuceBien"
    >
      <div style={{ height: h, width: w }} className="relative shrink-0">
        <Image src={LOCKUP_SRC[tone]} alt="LuceBien" fill sizes={`${w}px`} className="object-contain" priority />
      </div>
      {tagline && (
        <div className={cn(vertical && 'text-center')}>
          <div className="font-mono text-[10px] tracking-brand text-gold">SCI · LB</div>
        </div>
      )}
    </div>
  );
}
