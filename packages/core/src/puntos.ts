// Puntos de productividad. Los PESOS NO se hardcodean aquí: vienen de config (claves pts_*).
// Regla confirmada (E1): pieza que no es terno completo = ½ del peso de la etapa.
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
