import { Skeleton, SkeletonCard } from '../../components/ui/skeleton';

// /inventario es filtros + tabla de activos (ver cliente.tsx) — sin tiles de resumen.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="mt-3 h-3 w-44" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-4">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <SkeletonCard filas={8} />
    </div>
  );
}
