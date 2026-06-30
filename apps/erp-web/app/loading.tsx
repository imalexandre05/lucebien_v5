// Skeleton de carga entre módulos: aparece al instante al navegar mientras el server obtiene los
// datos, así el cambio de módulo se siente inmediato (no congelado). Tokens navy/gold sobrios.
export default function Loading() {
  return (
    <div className="animate-fade">
      <div className="mb-7">
        <div className="h-8 w-72 max-w-full animate-pulse-soft rounded bg-line/70" />
        <div className="mt-3 h-3 w-44 animate-pulse-soft rounded bg-line/50" />
        <div className="gold-rule mt-4" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-white p-5 shadow-card">
            <div className="h-4 w-40 animate-pulse-soft rounded bg-line/70" />
            <div className="mt-4 space-y-2.5">
              <div className="h-3 w-full animate-pulse-soft rounded bg-line/40" />
              <div className="h-3 w-5/6 animate-pulse-soft rounded bg-line/40" />
              <div className="h-3 w-2/3 animate-pulse-soft rounded bg-line/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
