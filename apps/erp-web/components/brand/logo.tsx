import Image from 'next/image';
import { cn } from '../../lib/cn';

// Marca LuceBien real (Fase 3): reemplaza el crest de CSS (cuadro navy + texto "LB") por los PNG
// oficiales del manual de marca (docs/manual-de-marca.md, líneas 66-83). `logo_lion_white.png` y
// `logo_full_white.png` son variantes BLANCAS pensadas para fondos oscuros — por eso siguen
// viviendo dentro de una chapa navy propia (igual que el placeholder anterior): así el ícono se ve
// igual de bien en el topbar (fondo claro) que en la sidebar (fondo navy), sin depender del fondo
// que lo rodea. El favicon usa el sello a color (`logo_lion_color.png`, ver app/icon.png).
//
// width/height explícitos (no `fill`): el tamaño del ícono ya se conoce por `size`, así que no
// hace falta que next/image mida el padre — y evita su warning de "height value of 0" en los
// call sites que a veces están ocultos vía CSS (ej. el crest del topbar es `lg:hidden`; next/image
// mide 0 en el primer render si el contenedor está en display:none, aunque sea a propósito).

type Size = 'sm' | 'md' | 'lg' | 'xl';
type Tone = 'onLight' | 'onDark';

// Caja cuadrada del ícono — mismo box-model que el placeholder anterior, para no romper el layout
// de los call sites (topbar, login, /dispositivo, dashboard, reportes).
const BOX: Record<Size, { box: string; inset: string; rOuter: string; rInner: string }> = {
  sm: { box: 'h-8 w-8', inset: 'inset-[3px]', rOuter: 'rounded-md', rInner: 'rounded-[4px]' },
  md: { box: 'h-10 w-10', inset: 'inset-[3.5px]', rOuter: 'rounded-lg', rInner: 'rounded-[5px]' },
  lg: { box: 'h-14 w-14', inset: 'inset-[4px]', rOuter: 'rounded-xl', rInner: 'rounded-[7px]' },
  xl: { box: 'h-20 w-20', inset: 'inset-[5px]', rOuter: 'rounded-2xl', rInner: 'rounded-[9px]' },
};

// Tamaño del ícono DENTRO de la chapa (deja el aire que antes daba el padding p-1.5/2/2.5/3.5).
const ICON_PX: Record<Size, number> = { sm: 20, md: 24, lg: 36, xl: 52 };

export function LogoMark({ size = 'md', className }: { size?: Size; className?: string }) {
  const m = BOX[size];
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden bg-navy shadow-card', m.box, m.rOuter, className)}
      aria-hidden="true"
    >
      <div className={cn('pointer-events-none absolute z-10 border border-gold/55', m.inset, m.rInner)} />
      <Image
        src="/assets/logo_lion_white.png"
        alt=""
        width={ICON_PX[size]}
        height={ICON_PX[size]}
        className="object-contain"
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
      <Image src={LOCKUP_SRC[tone]} alt="LuceBien" width={w} height={h} className="shrink-0 object-contain" priority />
      {tagline && (
        <div className={cn(vertical && 'text-center')}>
          <div className="tabular-nums text-[10px] tracking-brand text-gold">SCI · LB</div>
        </div>
      )}
    </div>
  );
}
