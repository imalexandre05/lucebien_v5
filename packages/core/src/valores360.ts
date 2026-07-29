// valores360.ts — Fase 12 tarea 1: peer review de 6 valores. El módulo que lo alimentaba
// (routes/valores.js, sistema viejo) nunca se migró — packages/core/src/evaluaciones.ts ya
// definía el componente `valores` con peso 0.25 (el más alto) pero no había forma de calcularlo.
// Puerto literal de routes/valores.js + las constantes de public/js/data.js:85-87
// (VALORES_NOMBRES/VALORES_KEYS/LIKERT_LABELS).

export type ValorKey = 'integridad' | 'respeto' | 'honestidad' | 'amabilidad' | 'relacion' | 'actitud';

// Orden y etiquetas: public/js/data.js:85 (VALORES_NOMBRES/VALORES_KEYS).
export const VALORES: { key: ValorKey; label: string }[] = [
  { key: 'integridad', label: 'Integridad' },
  { key: 'respeto', label: 'Respeto' },
  { key: 'honestidad', label: 'Honestidad' },
  { key: 'amabilidad', label: 'Amabilidad' },
  { key: 'relacion', label: 'Buena relación con compañeros' },
  { key: 'actitud', label: 'Actitud para el trabajo' },
];

// Escala Likert 1-5 por valor (public/js/data.js:87 y public/js/app.js:1587: botones 1..5,
// default 3 "A veces"). Cada evaluador califica a un compañero en estos 6 valores.
export const LIKERT_LABELS = ['Nunca', 'Raramente', 'A veces', 'Frecuentemente', 'Siempre'] as const;

export type PuntajeValores = Record<ValorKey, number>;

// Impide autoevaluarse (routes/valores.js:107: `if (evaluador_id === evaluado_id) return 400`).
export function puedeEvaluarValores(evaluadorId: string, evaluadoId: string): boolean {
  return Boolean(evaluadorId) && Boolean(evaluadoId) && evaluadorId !== evaluadoId;
}

function promedio(vals: (number | null | undefined)[]): number | null {
  const v = vals.filter((x): x is number => x != null && !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// Promedio por valor a partir de N evaluaciones recibidas por la misma persona en el periodo.
// Puerto de routes/valores.js:89-95 (endpoint /resumen) y :164-168 (endpoint /seguimiento) —
// ambos hacían el mismo cálculo dos veces; aquí queda una sola función.
export function promediosPorValor(evaluaciones: PuntajeValores[]): Partial<Record<ValorKey, number>> {
  const out: Partial<Record<ValorKey, number>> = {};
  for (const { key } of VALORES) {
    const p = promedio(evaluaciones.map((e) => e[key]));
    if (p != null) out[key] = Math.round(p * 100) / 100; // toFixed(2) del original
  }
  return out;
}

// nota20 = (promedio de los 6 valores / 5) × 20 — routes/valores.js:96-97 y :170-171.
// null si no hay ningún valor promediable todavía (nadie evaluó a esta persona aún).
export function notaValores360(promedios: Partial<Record<ValorKey, number>>): number | null {
  const vals = VALORES.map(({ key }) => promedios[key]).filter((v): v is number => v != null);
  const total = promedio(vals);
  if (total == null) return null;
  return Math.round((total / 5) * 20 * 10) / 10; // toFixed(1) del original
}
