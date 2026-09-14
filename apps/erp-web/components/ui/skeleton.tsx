import { cn } from '../../lib/cn';

// Bloque esqueleto con barrido shimmer (§4D). El barrido es un overlay que solo anima
// transform; con prefers-reduced-motion queda el bloque estático (globals.css).
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('relative overflow-hidden rounded-r-chico bg-line/60', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

// Esqueleto de un tile de resumen (misma silueta que StatBox para no saltar el layout).
export function SkeletonStat() {
  return (
    <div className="rounded-r-medio border border-line bg-white p-4 shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-2 h-2.5 w-20" />
    </div>
  );
}

// Esqueleto de tarjeta con filas (tablas/listas).
export function SkeletonCard({ filas = 4 }: { filas?: number }) {
  return (
    <div className="rounded-r-medio border border-line bg-white p-5 shadow-card">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: filas }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', i % 3 === 0 ? 'w-full' : i % 3 === 1 ? 'w-5/6' : 'w-2/3')} />
        ))}
      </div>
    </div>
  );
}

/**
 * La silueta de una pantalla estándar del ERP: cabecera, fila de tiles y tarjeta con filas.
 *
 * POR QUÉ EXISTE. De 65 rutas, 12 tenían `loading.tsx`. En las otras 53 el navegador se queda con
 * la pantalla anterior en blanco hasta que el servidor contesta, y eso se lee como lentitud aunque
 * la consulta tarde lo mismo. La mayoría de esas pantallas tienen la misma silueta, así que su
 * `loading.tsx` es una línea.
 *
 * Cuando una pantalla no se parece a esto —la lista de colaboradores, el pipeline— se escribe su
 * esqueleto a mano: uno que no coincide hace saltar el layout al llegar el contenido, y ese salto
 * se siente peor que no haber mostrado nada.
 */
export function SkeletonPagina({
  stats = 4,
  filas = 6,
  cards = 1,
}: {
  stats?: number;
  filas?: number;
  cards?: number;
}) {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="mt-3 h-3 w-72 max-w-full" />
        <div className="gold-rule mt-4" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <SkeletonStat key={i} />
          ))}
        </div>
      )}
      <div className={cn('space-y-3', stats > 0 && 'mt-6')}>
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} filas={filas} />
        ))}
      </div>
    </div>
  );
}
