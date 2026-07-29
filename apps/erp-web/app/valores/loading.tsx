import { Skeleton, SkeletonStat, SkeletonCard } from '../../components/ui/skeleton';

// Calca la silueta real de /valores: resumen + grilla de compañeros a evaluar.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="mt-3 h-3 w-44" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
      <div className="mt-6">
        <SkeletonCard filas={6} />
      </div>
    </div>
  );
}
