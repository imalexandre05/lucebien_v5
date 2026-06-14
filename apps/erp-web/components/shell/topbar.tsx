import { Building2 } from 'lucide-react';

// Topbar de demo: contexto de empresa + sede + usuario (mock; real con Supabase Auth en W7).
export function Topbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-paper/85 px-7 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Building2 className="h-4 w-4 text-gold" strokeWidth={1.75} />
        <span>Confecciones Aliaga · Huancayo</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-navy">
          Sede · LB
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-paper">
          AF
        </div>
      </div>
    </header>
  );
}
