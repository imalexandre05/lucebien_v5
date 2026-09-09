'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Barra de filtros pegajosa, con elevación SÓLO al despegarse y el recuento de resultados
// siempre a la vista (spec §7 "Seis de estructura"). Reemplaza los filtros a mano de cada
// tablero.
//
// "Despegada" no es un estado de CSS estándar todavía (`:stuck` no tiene soporte parejo) — un
// centinela de 1px arriba de la barra, observado con `IntersectionObserver`, dice cuándo dejó de
// verse: ahí es cuando la barra ya está pegada al borde y necesita la sombra para separarse del
// contenido que pasa debajo.
export function BarraFiltros({
  children,
  resultados,
  onLimpiar,
  className,
}: {
  children: ReactNode;
  /** Cuántos resultados hay, ya armado ("12 de 47") — la barra no sabe contar, sólo mostrar. */
  resultados?: string;
  onLimpiar?: () => void;
  className?: string;
}) {
  const centinela = useRef<HTMLDivElement>(null);
  const [despegada, setDespegada] = useState(false);

  useEffect(() => {
    const el = centinela.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entrada]) => setDespegada(!entrada.isIntersecting), { threshold: 1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <div ref={centinela} aria-hidden="true" />
      <div
        className={cn(
          'sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-r-pastilla border border-line bg-superficie px-3 py-2 transition-shadow duration-base',
          despegada ? 'shadow-elev-1' : 'shadow-elev-0',
          className,
        )}
      >
        {children}
        <div className="ml-auto flex items-center gap-3">
          {resultados && <span className="text-micro font-display tabular-nums text-acento-deep">{resultados}</span>}
          {onLimpiar && (
            <button
              type="button"
              onClick={onLimpiar}
              className="anillo rounded-r-chico text-micro font-medium text-muted underline-offset-2 hover:text-navy hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>
    </>
  );
}
