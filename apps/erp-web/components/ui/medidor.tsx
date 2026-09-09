import { cn } from '../../lib/cn';

// Escala continua con bandas de color y una aguja: dice dónde cae un valor dentro de un rango
// (spec §7 "Cuatro de visualización") — nota mensual dentro de sus tramos, carga de una sede
// respecto de su capacidad. Las bandas son SIEMPRE semánticas (error/aviso/éxito) — nunca el
// acento del módulo: acá el color dice "mal / regular / bien", no "de qué módulo es esto".
export function Medidor({
  valor,
  min,
  max,
  bandas,
  etiquetaMin,
  etiquetaMedia,
  etiquetaMax,
  className,
}: {
  valor: number;
  min: number;
  max: number;
  /** Ancho de cada banda como fracción del total (suman 1). Orden: mal → bien. */
  bandas: { tono: 'error' | 'aviso' | 'exito'; fraccion: number }[];
  etiquetaMin: string;
  etiquetaMedia: string;
  etiquetaMax: string;
  className?: string;
}) {
  const p = Math.max(0, Math.min(1, (valor - min) / (max - min || 1)));
  return (
    <div className={className}>
      <div className="relative h-3.5 overflow-hidden rounded-r-pastilla bg-superficie-hundida">
        <div className="absolute inset-0 flex">
          {bandas.map((b, i) => (
            <span
              key={i}
              className={cn(
                'h-full',
                b.tono === 'error' && 'bg-error-soft',
                b.tono === 'aviso' && 'bg-aviso-soft',
                b.tono === 'exito' && 'bg-exito-soft',
              )}
              style={{ width: `${b.fraccion * 100}%` }}
            />
          ))}
        </div>
        <div
          className="absolute -top-1 -bottom-1 w-1 animate-fade rounded-r-chico bg-navy-deep ring-2 ring-superficie"
          style={{ left: `calc(${p * 100}% - 2px)`, animationDuration: 'var(--dur-momento)' }}
        />
      </div>
      <div className="mt-2 flex justify-between text-micro tabular-nums text-muted">
        <span>{etiquetaMin}</span>
        <span>{etiquetaMedia}</span>
        <span>{etiquetaMax}</span>
      </div>
    </div>
  );
}
