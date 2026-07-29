// competencias.ts — Fase 12 tarea 2: las 8 competencias con rúbrica Likert de 5 niveles, portadas
// desde la constante hardcodeada COMPETENCIAS de public/js/data.js:75-84 a una tabla de
// configuración editable (competencias_config, migración 0057) en vez de vivir en el frontend.
// Esta pieza es solo la aritmética; el catálogo (nombre + rúbrica de cada competencia) vive en la
// base y lo lee apps/erp-web/lib/evaluaciones-repo.ts (listarCompetenciasConfig).
//
// Puerto literal de public/js/admin.js:1554-1555 y :1599-1600: cada competencia se puntúa en un
// nivel 0..4 (índice de la rúbrica que el evaluador elige — 0 = peor, 4 = mejor) y la nota final
// escala el total sobre el máximo posible (cantidad de competencias × 4) a /20.
export function notaCompetencias(seleccion: number[], maxPorItem = 4): number {
  if (!seleccion.length || maxPorItem <= 0) return 0;
  const total = seleccion.reduce((a, b) => a + (b || 0), 0);
  const maxTotal = seleccion.length * maxPorItem;
  return Math.round((total / maxTotal) * 20 * 10) / 10; // toFixed(1) del original
}
