import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// `--p` es una custom property CSS que `animate-anillo-llena` lee con `var(--p, 0)` (spec §6,
// keyframe `anillo-llena` en tailwind.config.ts). `CSSProperties` no la tipa — de ahí el cast.
type EstiloConFraccion = CSSProperties & { '--p': number };

// Arco de progreso en SVG con `stroke-dasharray`, la cifra en el centro (spec §7 "Cuatro de
// visualización") — nota sobre 20, avance de una tanda, porcentaje de asistencia. Se llama
// `AnilloProgreso` y no `Anillo` para no chocar con la palabra genérica en imports futuros.
//
// El centro NO lo arma este componente: recibe `centro` ya armado (spec: "una sola escala, y el
// color no es la única codificación" — la cifra siempre acompaña al arco, nunca al revés).
export function AnilloProgreso({
  valor,
  max,
  centro,
  tamano = 104,
  grosor = 9,
  etiqueta,
  className,
}: {
  /** 0..max. Se recorta al rango — un valor fuera de escala no dibuja un arco imposible. */
  valor: number;
  max: number;
  centro: ReactNode;
  tamano?: number;
  grosor?: number;
  etiqueta: string;
  className?: string;
}) {
  const p = Math.max(0, Math.min(1, valor / max));
  const r = (tamano - grosor) / 2;
  const c = tamano / 2;

  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: tamano, height: tamano }}>
      <svg viewBox={`0 0 ${tamano} ${tamano}`} width={tamano} height={tamano} role="img" aria-label={etiqueta}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(var(--acento) / .18)" strokeWidth={grosor} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="rgb(var(--acento))"
          strokeWidth={grosor}
          strokeLinecap="round"
          pathLength={1}
          className="animate-anillo-llena"
          style={
            {
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
              strokeDasharray: 1,
              strokeDashoffset: 1,
              '--p': p,
            } as EstiloConFraccion
          }
        />
      </svg>
      <div className="absolute text-center leading-tight">{centro}</div>
    </div>
  );
}
