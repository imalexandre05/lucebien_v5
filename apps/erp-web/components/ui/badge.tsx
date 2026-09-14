import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'navy' | 'gold' | 'green' | 'amber' | 'red' | 'info' | 'gray';

// Los nombres se conservan —'green', 'amber', 'red' están escritos en 67 archivos— pero ya no
// apuntan a la paleta por defecto de Tailwind sino a los semánticos del manual (§6). Los verdes y
// ámbares de Tailwind son fríos al lado del navy y del oro; éstos comparten su temperatura.
//
// El anillo interior es lo que los hace legibles como estado y no como mancha: sobre una tarjeta
// blanca un fondo al 10% casi no se ve, y el color terminaba dependiendo sólo del texto.
const tones: Record<Tone, string> = {
  navy: 'bg-navy/10 text-navy ring-1 ring-inset ring-navy/15',
  gold: 'bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30',
  green: 'bg-exito-soft text-exito-deep ring-1 ring-inset ring-exito-line',
  amber: 'bg-aviso-soft text-aviso-deep ring-1 ring-inset ring-aviso-line',
  // 'red' (Fase 6): alerta dura, distinta de amber — el aviso de calidad del pipeline y Rechazar.
  red: 'bg-error-soft text-error-deep ring-1 ring-inset ring-error-line',
  info: 'bg-info-soft text-info-deep ring-1 ring-inset ring-info-line',
  gray: 'bg-ink/10 text-muted ring-1 ring-inset ring-ink/10',
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
        // `chip-entra` es la pieza del catálogo para esto (spec §6): el badge entra con un rebote
        // corto en vez de aparecer de golpe. Estaba registrada en tailwind.config.ts y sin ningún
        // consumidor; el badge es el mejor porque sale en casi todas las pantallas.
        'inline-flex animate-chip-entra items-center rounded-r-pastilla px-2.5 py-0.5 text-micro font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
