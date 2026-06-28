// reportes.ts — dominio del módulo Reportes FR-01 (reporte diario por turno M/T/C).
// Tipos genéricos del oficio + helpers de presentación. Sin dependencias (no importa del adapter).

export type TurnoReporte = 'M' | 'T' | 'C';

// M = Mañana, T = Tarde, C = Día completo (cuenta como M y T en el sistema viejo).
export const TURNO_LABEL: Record<TurnoReporte, string> = {
  M: 'Mañana',
  T: 'Tarde',
  C: 'Día completo',
};

export type Reporte = {
  id: string; // 'DD-MM-YY_TURNO-SEDE' (preserva el id del sistema viejo)
  sedeCod: string;
  turno: TurnoReporte;
  fecha: string; // YYYY-MM-DD
  encargadoId: string | null;
  encargadoNombre: string | null;
  evaluadorId: string | null;
  evaluadorNombre: string | null;
  puntaje: number;
  puntajeEval: number | null;
  actTotal: number;
  actDone: number;
  evaluado: boolean;
  bloqueado: boolean;
  noEvaluable: boolean;
  autoEnviado: boolean;
  trabajadores: string[];
  createdAt: string;
};

export type ReporteActividad = {
  id: string;
  cod: string;
  nombre: string;
  cat: string | null;
  peso: number;
  realizada: boolean;
  calificacion: number | null;
  obs: string | null;
  obsEval: string | null;
};

export type ReporteExtra = {
  id: string;
  tipo: string;
  nombre: string;
  cantidad: number;
  montoTotal: number;
  precioUnitario: number;
  detalle: string | null;
  registradoPorId: string | null;
  registradoPorNombre: string | null;
};

export type ReporteDetalle = Reporte & {
  actividades: ReporteActividad[];
  extras: ReporteExtra[];
};

export type EstadoReporte = 'evaluado' | 'pendiente' | 'no_evaluable';

// Estado derivado para la UI (no se persiste). El viejo bloquea el reporte (bloqueado=1) al
// crearlo y lo desbloquea al evaluar (evaluado=1).
export function estadoReporte(r: Pick<Reporte, 'evaluado' | 'noEvaluable'>): EstadoReporte {
  if (r.evaluado) return 'evaluado';
  if (r.noEvaluable) return 'no_evaluable';
  return 'pendiente';
}

export const ESTADO_REPORTE_LABEL: Record<EstadoReporte, string> = {
  evaluado: 'Evaluado',
  pendiente: 'Pendiente de evaluación',
  no_evaluable: 'No evaluable',
};
