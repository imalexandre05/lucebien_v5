import { cn } from '../../lib/cn';

// Spinner mínimo (Fase 3 — antes no había NINGUNO en el proyecto: una acción lenta no daba
// ningún indicio visual). Un arco que gira; usa `currentColor` para heredar el color del texto
// que lo rodea (paper en botón primary, navy en outline/ghost) sin prop de color aparte.
// `prefers-reduced-motion` lo congela vía la regla global de animation-duration en globals.css,
// igual que el shimmer de Skeleton — se mantiene visible como indicador, solo deja de girar.
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 shrink-0 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
      <path
        className="opacity-90"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
