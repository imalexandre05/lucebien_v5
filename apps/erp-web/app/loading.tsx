import { Skeleton, SkeletonStat, SkeletonCard } from '../components/ui/skeleton';

// Skeleton de carga entre módulos: aparece al instante al navegar mientras el server
// obtiene datos. Silueta universal de página (encabezado + fila de tiles + tarjetas),
// que calza con el dashboard y con los módulos de lista — sin saltos de layout (§4D).
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="mt-3 h-3 w-44" />
        <div className="gold-rule mt-4" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>

      <div className="mt-6 space-y-5">
        <SkeletonCard filas={5} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SkeletonCard filas={4} />
          </div>
          <SkeletonCard filas={4} />
        </div>
      </div>
    </div>
  );
}
