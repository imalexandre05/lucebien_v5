import { Skeleton } from '../../components/ui/skeleton';

// El tablero es un Kanban de 9 columnas con scroll horizontal (ver tablero.tsx) — el esqueleto
// genérico de la raíz (tiles + tarjetas) no calza con esa silueta, así que se recrean las
// columnas reales (mismo `w-56 shrink-0` + gap-3 + overflow-x-auto y el alto exacto del tablero)
// para que no haya salto de layout cuando lleguen las prendas.
const COLUMNAS = 9;

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden animate-fade sm:h-[calc(100vh-7.5rem)]">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-deep px-5 py-4 text-paper shadow-card">
        <div>
          <div className="text-xl font-semibold leading-none">Prendas recibidas</div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-gold">Almacén Central</div>
        </div>
        <Skeleton className="h-6 w-24 bg-white/10" />
      </div>
      <div className="mb-3 h-9 shrink-0 border-b border-line" />
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3">
        {Array.from({ length: COLUMNAS }).map((_, i) => (
          <div key={i} className="flex h-full w-56 shrink-0 flex-col">
            <Skeleton className="mb-2 h-9 w-full rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
