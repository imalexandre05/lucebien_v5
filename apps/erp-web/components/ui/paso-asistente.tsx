import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Una pregunta por pantalla, con barra de avance arriba y un solo botón grande abajo (spec §7
// "Tres de operario"). Un formulario de nueve grupos en una columna se lee como un trámite;
// partido en pasos, cada pantalla tiene una sola cosa que hacer.
//
// `pregunta` va en `text-titulo`-adyacente pero más chica (24px): es la única frase de la
// pantalla, tiene que leerse de un vistazo sin competir con el rótulo de arriba.
export function PasoAsistente({
  paso,
  totalPasos,
  pregunta,
  children,
  boton,
  className,
}: {
  /** 1-indexado. */
  paso: number;
  totalPasos: number;
  pregunta: string;
  children: ReactNode;
  /** El único botón grande del pie — normalmente "Siguiente" o "Enviar". */
  boton: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-full flex-col', className)}>
      <div className="mb-4 flex gap-1.5" role="progressbar" aria-valuenow={paso} aria-valuemin={1} aria-valuemax={totalPasos}>
        {Array.from({ length: totalPasos }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-r-pastilla transition-colors duration-contexto ease-estado',
              i + 1 < paso ? 'bg-acento' : i + 1 === paso ? 'bg-gold' : 'bg-acento/20',
            )}
          />
        ))}
      </div>
      <h2 className="mb-3.5 text-[22px] font-display font-bold leading-tight tracking-[-.02em] text-acento-deep">
        {pregunta}
      </h2>
      <div className="flex-1">{children}</div>
      <div className="mt-4">{boton}</div>
    </div>
  );
}

// El cierre del asistente (spec §3.11, "confirmación grande"): disco verde, check que se traza,
// y qué pasó en una línea. Hoy un envío exitoso apenas cambia la pantalla; quien lo mandó no
// sabe si salió, y lo vuelve a mandar.
export function ConfirmacionGrande({ mensaje, detalle, children }: { mensaje: string; detalle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
      <div className="mb-4 grid h-[92px] w-[92px] place-items-center rounded-r-pastilla border-[3px] border-exito bg-exito-soft">
        <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="rgb(var(--exito-deep))" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6.5 9.5 17.5 4 12" pathLength={1} className="animate-check-dibuja" style={{ strokeDasharray: 1, strokeDashoffset: 1 }} />
        </svg>
      </div>
      <p className="text-titulo font-display font-bold text-exito-deep">{mensaje}</p>
      {detalle && <p className="mt-1 max-w-[26ch] text-apoyo text-muted">{detalle}</p>}
      {children && <div className="mt-5 w-full">{children}</div>}
    </div>
  );
}
