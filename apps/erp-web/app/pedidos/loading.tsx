import { Skeleton, SkeletonCard } from '../../components/ui/skeleton';

// /pedidos es formulario (cliente + líneas) + tabla de pedidos recientes (ver cliente.tsx) — sin
// tiles de resumen, así que se salta esa fila y se va directo a un bloque de formulario + tabla.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="mt-3 h-3 w-52" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="mb-5 rounded-lg border border-line bg-white p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <SkeletonCard filas={6} />
    </div>
  );
}
