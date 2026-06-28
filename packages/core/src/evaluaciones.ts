// evaluaciones.ts — nota mensual del colaborador. La fórmula y los pesos son CONFIGURABLES
// (los pesos vienen de la tabla config; aquí solo la aritmética). Cada componente va en escala /20.
// nota = Σ(componente × peso) − descuento_incidencias + bonus_ventas   (CONTEXTO-PROYECTO.md §5)

export type ComponenteKey =
  | 'competencias'
  | 'valores'
  | 'operaciones'
  | 'software'
  | 'limpieza'
  | 'examenes'
  | 'tardanza';

export const COMPONENTES: { key: ComponenteKey; label: string }[] = [
  { key: 'competencias', label: 'Competencias' },
  { key: 'valores', label: 'Valores 360°' },
  { key: 'operaciones', label: 'Operaciones' },
  { key: 'software', label: 'Software' },
  { key: 'limpieza', label: 'Limpieza' },
  { key: 'examenes', label: 'Exámenes' },
  { key: 'tardanza', label: 'Puntualidad' },
];

export type PesosEval = Record<ComponenteKey, number>;
export type ComponentesEval = Record<ComponenteKey, number> & {
  descuentoIncidencias: number;
  bonusVentas: number;
};

// Pesos por defecto (se sobreescriben con los de config). Suman 1.0.
export const PESOS_DEFAULT: PesosEval = {
  competencias: 0.25,
  valores: 0.25,
  operaciones: 0.1,
  software: 0.1,
  limpieza: 0.1,
  examenes: 0.15,
  tardanza: 0.05,
};

export function calcularNotaMensual(c: ComponentesEval, p: PesosEval): number {
  let nota = 0;
  for (const { key } of COMPONENTES) nota += (c[key] || 0) * (p[key] || 0);
  nota = nota - (c.descuentoIncidencias || 0) + (c.bonusVentas || 0);
  return Math.round(nota * 100) / 100;
}

// Tardanza → nota /20 (CONTEXTO-PROYECTO.md §5): max(0, 20 − floor(min_total / minPorPunto)).
export function notaTardanza(minutosTotales: number, minPorPunto = 15): number {
  const div = minPorPunto > 0 ? minPorPunto : 15;
  return Math.max(0, 20 - Math.floor((minutosTotales || 0) / div));
}

export type TramoEval = 'excelente' | 'bueno' | 'mejorar' | 'bajo';

export function tramoEval(nota: number): TramoEval {
  if (nota >= 17) return 'excelente';
  if (nota >= 14) return 'bueno';
  if (nota >= 11) return 'mejorar';
  return 'bajo';
}

export const TRAMO_LABEL: Record<TramoEval, string> = {
  excelente: 'Excelente',
  bueno: 'Buen desempeño',
  mejorar: 'Requiere mejorar',
  bajo: 'Bajo rendimiento',
};
