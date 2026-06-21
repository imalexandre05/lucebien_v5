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

// 'enviado' no es etapa del pipeline: es el estado terminal de una prenda ya despachada
// a tienda (sale del tablero hacia el flujo de envíos). Se modela aparte de EtapaPipeline.
export type EstadoPasada = EtapaPipeline | 'enviado';

// Una PASADA = una vuelta de una prenda por el pipeline (E5). Liga al activo de inventario;
// si activoId es null, es prenda de un cliente que entró por un servicio suelto.
// Campos ricos (lavador/planchador, obs por etapa, división de ternos) portados del sistema
// viejo en la migración 0005; opcionales para no romper construcciones existentes.
export interface PrendaPasada {
  id: string;
  activoId?: string | null;
  pedidoId?: string | null;
  codigo: string;
  tipo: string;
  color?: string | null;
  talla?: string | null;
  etapa: EstadoPasada;
  tipoLavado?: string | null;
  sedeOrigenCod: string;
  lavadorId?: string | null;
  planchadorId?: string | null;
  necesitaCompostura?: boolean;
  obsRefaccion?: string | null;
  obsCompostura?: string | null;
  obsCalidad?: string | null;
  obsGeneral?: string | null;
  aprobada?: boolean;
  envioId?: string | null;
  listaLavanderiaId?: string | null;
  dividida?: boolean;
  divididaEn?: string | null;
  fechaIngreso: string;
  fechaActualizado?: string | null;
}
