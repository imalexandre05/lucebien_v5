import { Skeleton, SkeletonStat, SkeletonCard } from '../../components/ui/skeleton';

export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-48 max-w-full" />
        <Skeleton className="mt-3 h-3 w-40" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
      <SkeletonCard filas={6} />
    </div>
  );
}
