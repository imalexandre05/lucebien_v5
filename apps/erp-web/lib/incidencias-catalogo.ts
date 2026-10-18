import type { TipoIncidencia } from './incidencias-repo';

const NIVELES = ['Alto', 'Medio', 'Bajo'];

export type IncidenciaResuelta =
  | { ok: true; nivel: string; puntosPenalidad: number }
  | { ok: false; error: string };

/**
 * Los puntos de penalidad descuentan de la nota y, por ahí, del sueldo: no pueden venir del
 * navegador. Salen siempre del catálogo de tipos (spec 2026-10-18-incidencias-servidor-valida).
 * El nivel enviado se respeta solo si es uno de los tres válidos; si no, vale el del tipo.
 */
export function resolverIncidencia(tipos: TipoIncidencia[], tipo: string, nivel: string): IncidenciaResuelta {
  const t = tipos.find((x) => x.tipo === tipo);
  if (!t) return { ok: false, error: 'Ese tipo de incidencia no existe o está desactivado.' };
  return {
    ok: true,
    nivel: NIVELES.includes(nivel) ? nivel : t.nivelDefault,
    puntosPenalidad: t.puntosDefault,
  };
}

export type ResponsableIncidencia = { activo: boolean; sedeCod: string | null; sedes: string[] };

/**
 * El responsable de una incidencia descuenta puntos de SU nota: debe ser una persona activa de la
 * sede de la incidencia (su sede principal o una de `empleado_tiendas`). Sin responsable es válido.
 */
export function responsableValido(r: ResponsableIncidencia | null, sede: string): boolean {
  if (r === null) return true;
  return r.activo && (r.sedeCod === sede || r.sedes.includes(sede));
}
