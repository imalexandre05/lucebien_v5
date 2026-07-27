import { Skeleton, SkeletonCard } from '../../components/ui/skeleton';

// /reportes hoy es la lista (filtros + tabla, ver lista.tsx) — sin tiles de resumen, así que el
// esqueleto genérico de tiles de la raíz no aplicaría acá.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="mt-3 h-3 w-44" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-4">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <SkeletonCard filas={8} />
    </div>
  );
}
