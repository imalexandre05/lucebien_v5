// candidatos.ts — ingreso de personal: entrevista → prueba → alta (ticket 14).
// Spec: docs/superpowers/specs/empleados/2026-10-11-candidatos-entrevista-prueba-design.md
//
// Puro: no llama `new Date()` (no-negociable 4). La fecha de hoy (hora Perú) entra de afuera.
// La RPC de la base repite estas reglas; esto es lo que la pantalla usa para ofrecer sólo
// las acciones que valen.

import { sumarDias } from './rangos-fecha';

export const ESTADOS_CANDIDATO = [
  'por_entrevistar',
  'entrevistado',
  'en_prueba',
  'prueba_cerrada',
  'contratado',
  'descartado',
] as const;
export type EstadoCandidato = (typeof ESTADOS_CANDIDATO)[number];

export type ResultadoPrueba = 'bueno' | 'regular' | 'malo';

const SIGUIENTES: Record<EstadoCandidato, EstadoCandidato[]> = {
  por_entrevistar: ['entrevistado', 'descartado'],
  entrevistado: ['en_prueba', 'descartado'],
  en_prueba: ['prueba_cerrada', 'descartado'],
  prueba_cerrada: ['contratado', 'entrevistado', 'descartado'], // entrevistado = repetir la prueba
  contratado: [],
  descartado: ['por_entrevistar'], // reactivar
};

export function transicionValida(desde: EstadoCandidato, hacia: EstadoCandidato): boolean {
  return SIGUIENTES[desde].includes(hacia);
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Último día de la prueba: `dias` días contando el de inicio (3 días desde el 19 → el 21). */
export function finDePrueba(desde: string, dias: number): string {
  if (!RE_FECHA.test(desde)) throw new Error(`La fecha de inicio de la prueba no es válida: ${desde}.`);
  if (!Number.isInteger(dias) || dias < 1) throw new Error(`Los días de prueba deben ser un entero desde 1, llegó: ${dias}.`);
  return sumarDias(desde, dias - 1);
}

/** La prueba se cierra desde su día de fin en adelante. */
export function puedeCerrarPrueba(hoy: string, pruebaHasta: string): boolean {
  return hoy >= pruebaHasta;
}
