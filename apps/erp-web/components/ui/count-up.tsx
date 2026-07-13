'use client';

import { useEffect, useRef, useState } from 'react';

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Contador que anima de 0 al valor al montar (misma curva out-expo de los tokens).
// SSR pinta el valor final (sin JS no se pierde el dato); al hidratar arranca la cuenta.
// Con prefers-reduced-motion muestra el valor final sin animar.
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  durationMs = 700,
  delayMs = 0,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  delayMs?: number;
}) {
  const [mostrado, setMostrado] = useState(value);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value === 0) {
      setMostrado(value);
      return;
    }
    let inicio = 0;
    const tick = (ts: number) => {
      if (!inicio) inicio = ts + delayMs;
      const t = (ts - inicio) / durationMs;
      if (t < 0) {
        setMostrado(0);
      } else {
        setMostrado(value * easeOutExpo(t));
      }
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setMostrado(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, durationMs, delayMs]);

  const fmt = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span className="tabular-nums">
      {prefix}
      {fmt.format(decimals ? mostrado : Math.round(mostrado))}
      {suffix}
    </span>
  );
}
