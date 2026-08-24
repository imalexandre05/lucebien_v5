// Puntos de productividad. Los PESOS NO se hardcodean aquí: vienen de config (claves pts_*).
//
// OJO — ESTE ARCHIVO NO CALCULA NADA EN PRODUCCIÓN. `puntosDeEtapa` no lo importa ningún módulo de
// `apps/`, y su regla del ½ está DESACTUALIZADA: divide por dos cualquier prenda que no sea terno
// completo, sin la lista blanca de tipos ni el redondeo a un decimal. La regla vigente es
// `puntosAvance` (pipeline.ts:51, apoyada en `esMediaPrenda` de pipeline.ts:44), replicada en
// plpgsql dentro de `pipeline_avanzar` — que es la única que escribe en `pipeline_puntos`.
//
// Se conserva porque `ClavePuntos` sigue siendo el catálogo de las 9 claves `pts_*` que documenta
// apps/erp-web/lib/config-catalogo.ts. Antes de creerle a `puntosDeEtapa`, ver
// docs/superpowers/specs/pipeline/2026-08-23-transiciones-y-division-design.md §7.
//
// Regla histórica (E1): pieza que no es terno completo = ½ del peso de la etapa.
export type ClavePuntos =
  | 'pts_lavado_normal'
  | 'pts_lavado_seco'
  | 'pts_lavado_especializado'
  | 'pts_empatado'
  | 'pts_refaccion'
  | 'pts_compostura'
  | 'pts_planchado'
  | 'pts_control_calidad'
  | 'pts_accesorio';

export type PesosPuntos = Record<ClavePuntos, number>;

export function puntosDeEtapa(peso: number, esTernoCompleto: boolean): number {
  return esTernoCompleto ? peso : peso / 2;
}
