import { Skeleton, SkeletonStat, SkeletonCard } from '../../../components/ui/skeleton';

// Silueta de la persona: cabecera con avatar, barra de período, pestañas, el hilo y el resumen.
export default function Loading() {
  return (
    <div className="animate-fade space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-r-pastilla" />
        <div>
          <Skeleton className="h-7 w-52 max-w-full" />
          <Skeleton className="mt-2 h-2.5 w-64 max-w-full" />
        </div>
        <Skeleton className="ml-auto h-9 w-52 rounded-md" />
      </div>

      <Skeleton className="h-[4.5rem] w-full rounded-lg" />

      <div className="flex gap-1 border-b border-line pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24" />
        ))}
      </div>

      {/* El hilo: cinco nodos con su etiqueta. */}
      <div className="rounded-lg border border-line bg-white p-5 shadow-card">
        <Skeleton className="h-4 w-64 max-w-full" />
        <div className="mt-6 flex items-start justify-between gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-r-pastilla" />
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-2 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SkeletonCard filas={5} />
        <SkeletonCard filas={5} />
      </div>
    </div>
  );
}
