import { Skeleton, SkeletonStat, SkeletonCard } from '../../../components/ui/skeleton';

// Calca la silueta real de /administracion/auditoria: 4 tiles de resumen + filtros y tabla.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-40 max-w-full" />
        <Skeleton className="mt-3 h-3 w-64" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
      <div className="mt-6">
        <SkeletonCard filas={8} />
      </div>
    </div>
  );
}
