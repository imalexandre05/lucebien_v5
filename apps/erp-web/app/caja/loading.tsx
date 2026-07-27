import { Skeleton, SkeletonStat, SkeletonCard } from '../../components/ui/skeleton';

// Calca la silueta real de /caja (ver cliente.tsx): resumen del día (4 tiles) + movimientos y
// pendientes de cobro debajo.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-48 max-w-full" />
        <Skeleton className="mt-3 h-3 w-40" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
      <div className="mt-6 space-y-5">
        <SkeletonCard filas={5} />
        <SkeletonCard filas={4} />
      </div>
    </div>
  );
}
