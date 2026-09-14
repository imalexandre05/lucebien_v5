'use client';

import { cn } from '../../lib/cn';

// Doce teclas de 56px propias del sistema, para códigos y cantidades largas (spec §7 "Tres de
// operario"). El teclado del sistema operativo no se puede estilar, tapa el contexto, y en el
// celular obliga a cerrarlo para ver qué se escribió.
//
// SÓLO operario (§3.11) — en administración un `<input type="number">` con teclado físico es más
// rápido para quien está sentado.
export function TecladoNumerico({
  onDigito,
  onBorrar,
  className,
}: {
  onDigito: (d: string) => void;
  onBorrar: () => void;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)} role="group" aria-label="Teclado numérico">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onDigito(d)}
          className="anillo min-h-[56px] rounded-r-medio border border-line bg-superficie text-xl font-display font-semibold tabular-nums text-ink transition-[transform,background-color] duration-instante ease-rebote active:scale-[.93] active:bg-acento-soft"
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={onBorrar}
        aria-label="Borrar"
        className="anillo min-h-[56px] rounded-r-medio border border-line bg-superficie text-apoyo font-medium text-muted transition-[transform,background-color] duration-instante ease-rebote active:scale-[.93] active:bg-acento-soft"
      >
        Borrar
      </button>
      <button
        type="button"
        onClick={() => onDigito('0')}
        className="anillo min-h-[56px] rounded-r-medio border border-line bg-superficie text-xl font-display font-semibold tabular-nums text-ink transition-[transform,background-color] duration-instante ease-rebote active:scale-[.93] active:bg-acento-soft"
      >
        0
      </button>
      <span aria-hidden="true" />
    </div>
  );
}
