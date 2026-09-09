import { cn } from '../../lib/cn';

// Serie corta de barras que crecen desde la base, escalonadas (spec §7 "Cuatro de
// visualización") — reportes por sede, prendas por etapa, incidencias por semana. La barra
// marcada con `hoy` se destaca en el acento pleno; las demás, atenuadas — es la que responde la
// pregunta "¿y hoy, cómo vamos?" de un vistazo, sin leer las siete etiquetas.
export function Barras({
  datos,
  className,
}: {
  datos: { etiqueta: string; valor: number; hoy?: boolean }[];
  className?: string;
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className={cn('flex h-[88px] items-stretch gap-1.5', className)}>
      {datos.map((d, i) => (
        <div key={d.etiqueta} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className={cn(
                'w-full origin-bottom animate-grow-y rounded-r-chico',
                d.hoy ? 'bg-acento' : 'bg-acento/35',
              )}
              style={{
                height: `${Math.max(4, Math.round((d.valor / max) * 100))}%`,
                animationDelay: `${i * 60}ms`,
                animationDuration: 'var(--dur-momento)',
                animationTimingFunction: 'var(--curva-rebote)',
              }}
            />
          </div>
          <span className="text-micro font-display uppercase tracking-wide text-muted">{d.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}
