'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, MapPin, Check } from 'lucide-react';
import { cambiarSedeAction } from './sede-actions';
import { cn } from '../../lib/cn';

// Cambio de sede en el topbar (Fase 2, tarea 3): reemplaza el badge estático "Sede · LB" por un
// popover con las tiendas del empleado (admin/dueño ven todas — sesion ya trae solo las
// permitidas, resueltas en topbar.tsx con sedesPermitidas()). Es la ÚNICA otra pantalla del
// sistema (aparte del login) donde se elige sede; ver CLAUDE.md / plan Fase 2.
//
// Popover ANCLADO (absolute, no portal): a diferencia de NotificacionesBell — que necesita
// reposicionarse en scroll/resize y hacer flip porque su panel puede crecer con la lista y el
// topbar es sticky — acá la lista es corta (≤4 sedes) y el trigger vive siempre arriba del
// viewport, así que nunca hay riesgo real de recorte. Un simple `absolute right-0 top-full`
// alcanza sin repetir esa maquinaria.
export function SedePopover({ sedeActual, sedes }: { sedeActual: string; sedes: { cod: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [abierto]);

  // Nada entre lo que elegir: badge de solo lectura (una sola tienda, o ninguna sede activa).
  if (sedes.length <= 1) {
    const label = sedes[0]?.cod ?? sedeActual;
    if (!label) return null;
    return (
      <span className="hidden rounded-r-pastilla border border-line bg-white px-3 py-1 text-apoyo font-medium text-navy sm:inline">
        Sede · {label}
      </span>
    );
  }

  function elegir(cod: string) {
    setAbierto(false);
    if (cod === sedeActual || pending) return;
    startTransition(async () => {
      const r = await cambiarSedeAction(cod);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={abierto}
        disabled={pending}
        title="Cambiar de sede"
        className="anillo inline-flex items-center gap-1 rounded-r-pastilla border border-line bg-white px-3 py-1 text-apoyo font-medium text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MapPin className="h-3 w-3 text-gold" strokeWidth={2} aria-hidden />
        Sede · {sedeActual || '—'}
        <ChevronDown className={cn('h-3 w-3 text-muted transition-transform duration-150', abierto && 'rotate-180')} strokeWidth={2} aria-hidden />
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label="Cambiar de sede"
          className="absolute right-0 top-full z-30 mt-1.5 w-52 animate-fade overflow-hidden rounded-r-medio border border-line bg-white py-1 shadow-lift"
        >
          {sedes.map((s) => (
            <button
              key={s.cod}
              type="button"
              role="menuitemradio"
              aria-checked={s.cod === sedeActual}
              onClick={() => elegir(s.cod)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-left text-cuerpo transition-colors hover:bg-navy/5',
                s.cod === sedeActual ? 'font-medium text-navy' : 'text-ink',
              )}
            >
              <span className="truncate">
                <span className="tabular-nums">{s.cod}</span> · {s.nombre}
              </span>
              {s.cod === sedeActual && <Check className="h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={2} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
