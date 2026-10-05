import { ShieldCheck } from 'lucide-react';
import { VALORES } from '@scilb/core';
import type { MiResumenValores } from '../../lib/valores-repo';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';

// Resultado de Valores 360° de un mes: nota /20 y una barra por valor. Lo usan «Valores 360°» (lo
// propio) y la ficha de Personal (el administrador mirando a otra persona).
//
// Tres estados, y los tres dicen la verdad sin revelar de más:
//  · no alcanza el mínimo → un mensaje claro, SIN la cantidad (decir «hay 2» ya es información);
//  · nadie evaluó todavía (sólo lo ve el administrador mirando a otra persona);
//  · resultado → nota, promedios por valor y la cantidad (que ya cumple el mínimo).
export function ResultadoValores({
  resumen,
  mes,
  titulo = 'Mi resultado',
}: {
  resumen: MiResumenValores;
  mes: string;
  titulo?: string;
}) {
  const { suficientes, recibidas, promedios, nota20, minimoEvaluaciones } = resumen;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {titulo} · {mes}
        </CardTitle>
        {suficientes && recibidas != null && recibidas > 0 && (
          <Badge tone="navy">
            {recibidas} {recibidas === 1 ? 'evaluación' : 'evaluaciones'}
          </Badge>
        )}
      </CardHeader>

      {!suficientes ? (
        <EmptyState icon={ShieldCheck} titulo="Tu resultado aparece cuando hay suficientes evaluaciones" compacto>
          Aún no hay suficientes evaluaciones para mostrar tu resultado (mínimo {minimoEvaluaciones}). Se
          pide un mínimo para que nadie pueda deducir quién puntuó qué: las evaluaciones son anónimas
          y sólo el administrador ve a su autor.
        </EmptyState>
      ) : !promedios || !recibidas ? (
        <EmptyState icon={ShieldCheck} titulo="Todavía nadie la puntuó este mes" compacto>
          El equipo se evalúa entre sí desde Valores 360°. Hasta que haya al menos una evaluación,
          este componente de la nota queda sin dato.
        </EmptyState>
      ) : (
        <CardContent>
          <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-3">
            <span className="text-apoyo text-muted">Nota de Valores 360°, la que entra a la evaluación mensual</span>
            <span className="tabular-nums text-3xl font-bold text-navy">
              {nota20 == null ? '—' : nota20.toFixed(1)}
              <span className="ml-1 text-cuerpo font-normal text-muted">/20</span>
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {VALORES.map(({ key, label }) => {
              const v = promedios[key];
              const pct = v == null ? 0 : Math.max(0, Math.min(100, (v / 5) * 100));
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-apoyo text-ink">{label}</span>
                    <span className="tabular-nums text-dato font-semibold text-navy">
                      {v == null ? '—' : `${v.toFixed(2)} / 5`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-r-pastilla bg-line/60">
                    <div
                      className="h-full origin-left animate-draw-x rounded-r-pastilla bg-gold motion-reduce:animate-none"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-apoyo text-muted">
            Promedios del equipo. Quién puntuó qué no se muestra a nadie, salvo al administrador.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
