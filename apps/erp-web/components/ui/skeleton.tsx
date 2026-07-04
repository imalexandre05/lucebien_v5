import { cn } from '../../lib/cn';

// Bloque esqueleto con barrido shimmer (§4D). El barrido es un overlay que solo anima
// transform; con prefers-reduced-motion queda el bloque estático (globals.css).
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('relative overflow-hidden rounded bg-line/60', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

// Esqueleto de un tile de resumen (misma silueta que StatBox para no saltar el layout).
export function SkeletonStat() {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-2 h-2.5 w-20" />
    </div>
  );
}

// Esqueleto de tarjeta con filas (tablas/listas).
export function SkeletonCard({ filas = 4 }: { filas?: number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-card">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: filas }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', i % 3 === 0 ? 'w-full' : i % 3 === 1 ? 'w-5/6' : 'w-2/3')} />
        ))}
      </div>
    </div>
  );
}
