// Pipeline de lavandería: 9 etapas. Modelo genérico; los pesos de puntos viven en config (adapter).
export const ETAPAS_PIPELINE = [
  'recepcion',
  'lavado',
  'empatado',
  'vacio',
  'refaccion',
  'compostura', // compostura/codificación
  'planchado',
  'control_calidad',
  'listo', // listo p/ envío
] as const;

export type EtapaPipeline = (typeof ETAPAS_PIPELINE)[number];

export function siguienteEtapa(e: EtapaPipeline): EtapaPipeline | null {
  const i = ETAPAS_PIPELINE.indexOf(e);
  return i >= 0 && i < ETAPAS_PIPELINE.length - 1 ? ETAPAS_PIPELINE[i + 1] : null;
}
