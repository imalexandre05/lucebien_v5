import { Skeleton } from '../../components/ui/skeleton';

// Calca la silueta real de la lista: cabecera, barra de período, filtros y las filas de personas.
// Un esqueleto que no coincide con lo que llega después hace saltar el layout, y ese salto se
// siente más lento que no haber mostrado nada.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="mt-3 h-3 w-72 max-w-full" />
        <div className="gold-rule mt-4" />
      </div>

      <Skeleton className="h-[4.5rem] w-full rounded-lg" />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>

      <div className="mt-4 divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-white shadow-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-r-pastilla" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="mt-1.5 h-2.5 w-24" />
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-1.5 w-6 rounded-r-pastilla" />
              ))}
            </div>
            <Skeleton className="hidden h-5 w-10 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
