import { COMPONENTES } from '@scilb/core';

// Perfil por componente (spec docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-
// design.md §2 C-4): barras sobrias /20 con el peso usado al lado. Los siete componentes se siguen
// calculando exactamente igual que siempre — lo que cambió es que ya no deciden la nota (que ahora
// sale de los puntos, ver notaDesdePuntos en @scilb/core): pasan a ser sólo esto, un perfil de en
// qué es fuerte cada persona y en qué flaquea. El "peso" que se muestra al lado de cada barra es
// contexto histórico (cuánto pesaba ese componente en una evaluación vieja metodo='ponderado'), no
// algo que siga multiplicando nada. Los valores van siempre en texto — la barra es refuerzo, nunca
// el único canal.
//
// Vive acá (no en app/evaluaciones/cliente.tsx, donde nació) para que /mi-desempeno —que es un
// Server Component— pueda reusarlo sin importar de otra ruta: Next.js sí permite que un Server
// Component renderice un Client Component de otro módulo, pero una ruta importando los internos de
// otra es una dependencia cruzada rara que conviene evitar cuando el componente no tiene nada de
// específico a la pantalla donde nació.
const fmtPeso = (p: number | undefined | null) => (p == null ? '—' : p > 1 ? `${p}%` : `${Math.round(p * 100)}%`);

export function PerfilComponentes({
  componentes,
  pesos,
}: {
  componentes: Record<string, number>;
  pesos: Record<string, number>;
}) {
  const descuento = Number(componentes.descuentoIncidencias ?? 0);
  const bonus = Number(componentes.bonusVentas ?? 0);
  return (
    <div className="animate-fade">
      <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {COMPONENTES.map(({ key, label }) => {
          const v = Number(componentes[key] ?? 0);
          const pct = Math.max(0, Math.min(100, (v / 20) * 100));
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-ink">
                  {label}
                  <span className="ml-1.5 tabular-nums text-[10px] text-muted">{fmtPeso(pesos[key])}</span>
                </span>
                <span className="tabular-nums text-xs font-semibold text-navy">{v.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/60">
                <div className="h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {(descuento !== 0 || bonus !== 0) && (
        <p className="mt-3 border-t border-line/60 pt-2 text-[11px] text-muted">
          Ajustes: −{descuento.toFixed(1)} por incidencias · +{bonus.toFixed(1)} bonus por ventas
        </p>
      )}
    </div>
  );
}
