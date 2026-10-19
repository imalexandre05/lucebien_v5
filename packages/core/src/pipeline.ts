// Pipeline de lavandería: 10 etapas. Modelo genérico; los pesos de puntos viven en config (adapter).
export const ETAPAS_PIPELINE = [
  'recepcion',
  'lavado',
  'empatado',
  'vacio',
  'refaccion',
  'compostura',
  'codificacion', // etiqueta con el código puesta (la codificación real es del sistema externo)
  'planchado',
  'control_calidad',
  'listo', // listo p/ envío
] as const;

export type EtapaPipeline = (typeof ETAPAS_PIPELINE)[number];

export function siguienteEtapa(e: EtapaPipeline): EtapaPipeline | null {
  const i = ETAPAS_PIPELINE.indexOf(e);
  return i >= 0 && i < ETAPAS_PIPELINE.length - 1 ? ETAPAS_PIPELINE[i + 1] : null;
}

// Transiciones permitidas en el tablero (portadas del kanban viejo). 'listo' = aprobado en
// control de calidad; el envío a tienda y el rechazo son flujos aparte.
export const TRANSICIONES: Record<EtapaPipeline, EtapaPipeline[]> = {
  recepcion: ['lavado', 'refaccion'],
  lavado: ['empatado'],
  empatado: ['refaccion'],
  vacio: [],
  refaccion: ['compostura', 'codificacion', 'planchado'],
  compostura: ['codificacion', 'planchado'],
  codificacion: ['planchado'],
  planchado: ['control_calidad'],
  control_calidad: ['listo'],
  listo: [],
};

// Clave de config (peso de puntos) de la etapa que se COMPLETA al avanzar. El lavado
// distingue por tipo de lavado (normal/seco/especializado). Si no hay config → peso 1.
export function clavePuntos(etapa: EtapaPipeline, tipoLavado?: string | null): string {
  if (etapa === 'lavado') return `pts_lavado_${tipoLavado || 'normal'}`;
  return `pts_${etapa}`;
}

// Regla del ½ punto (E1): piezas sueltas (saco, pantalón, falda, chaleco, blazer) valen la
// mitad; un terno completo vale el peso entero. Portada de routes/pipeline.js.
export function esMediaPrenda(tipo?: string | null): boolean {
  const t = (tipo || '').toLowerCase();
  if (!t || t === 'terno completo' || t === 'terno') return false;
  return ['saco', 'pantal', 'falda', 'chaleco', 'blazer'].some((k) => t.includes(k));
}

// Puntos que gana el actor por completar `etapa`, dado el peso de config y el tipo de prenda.
export function puntosAvance(peso: number, tipo?: string | null): number {
  return esMediaPrenda(tipo) ? Math.round((peso / 2) * 10) / 10 : peso;
}

// Estados fuera del pipeline activo, todos salen del tablero de trabajo: 'enviado'
// (despachada a tienda), 'recibido' (aceptada en tienda, viaje terminado) y 'dividido'
// (terno partido en piezas hijas). Se modelan aparte de EtapaPipeline.
export type EstadoPasada = EtapaPipeline | 'enviado' | 'recibido' | 'dividido';

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
