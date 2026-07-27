import { Skeleton, SkeletonStat, SkeletonCard } from '../../components/ui/skeleton';

// Calca la silueta real de /estadisticas (ver cliente.tsx): 5 KPI en grid-cols-2/lg:grid-cols-4
// (el 5º cae en fila propia, igual que en producción) + tarjetas de series/rankings debajo.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="mt-3 h-3 w-48" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonCard filas={5} />
        <SkeletonCard filas={5} />
      </div>
    </div>
  );
}
