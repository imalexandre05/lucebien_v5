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

// ── Catálogo de actividades (config por sede) ────────────────────────────────

export type ActividadConfig = {
  id: string;
  cod: string;
  nombre: string;
  categoria: string | null;
  tipoAct: string; // 'obligatoria' | 'por_puntos' | 'remunerada'
  peso: number;
  activa: boolean;
  turno: string; // 'ambos' | 'M' | 'T' | 'C' (o 'm'/'t'/'mañana'/'tarde' del viejo)
  frecuenciaDias: number; // 0/1 diaria · 2 día par · 7 semanal · 15 quincenal · 30 mensual
  diaSemana: string | null; // lista por comas en minúsculas: 'lunes,martes'
  apareceDia: number; // base para frecuencia 7 (cada-N-semanas) / 15 / 30
  acumula: boolean;
  precioUnitario: number;
  unidad: string | null;
  orden: number;
};

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Deriva la fecha (YYYY-MM-DD) desde el id 'DD-MM-YY_TURNO-SEDE'. Única fuente de verdad de la
// fecha (no se confía en el reloj). Devuelve null si el id no matchea el formato.
export function fechaDesdeId(id: string): string | null {
  const m = String(id ?? '').match(/^(\d{2})-(\d{2})-(\d{2})_/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const fullYear = parseInt(yy, 10) < 70 ? `20${yy}` : `19${yy}`;
  return `${fullYear}-${mm}-${dd}`;
}

// Construye el id 'DD-MM-YY_TURNO-SEDE' desde una fecha YYYY-MM-DD.
export function idReporte(fecha: string, turno: TurnoReporte, sede: string): string {
  const [yyyy, mm, dd] = fecha.split('-');
  return `${dd}-${mm}-${yyyy.slice(2)}_${turno}-${sede}`;
}

// ¿La actividad del catálogo aplica en esta fecha/turno? Portado fiel de routes/actividades.js
// (actAplicaHoy). C (día completo) cuenta como M y T → nunca filtra por turno.
export function actAplicaHoy(
  a: Pick<ActividadConfig, 'turno' | 'frecuenciaDias' | 'diaSemana' | 'apareceDia'>,
  fecha: string,
  turno: TurnoReporte | '',
): boolean {
  const d = new Date(`${fecha}T12:00:00`);
  const diaDelMes = d.getDate();
  const diaSemana = DIAS_SEMANA[d.getDay()];

  const actTurno = (a.turno || 'ambos').toLowerCase();
  if (actTurno !== 'ambos') {
    const t = (turno || '').toUpperCase();
    if (t === 'M' && actTurno !== 'm' && actTurno !== 'mañana') return false;
    if (t === 'T' && actTurno !== 't' && actTurno !== 'tarde') return false;
  }

  const freq = Number(a.frecuenciaDias) || 0;
  if (freq <= 1) return true;
  if (freq === 2) return diaDelMes % 2 === 0;
  if (freq === 7) {
    if (!a.diaSemana) return true;
    const diaOk = a.diaSemana
      .toLowerCase()
      .split(',')
      .map((x) => x.trim())
      .includes(diaSemana);
    if (!diaOk) return false;
    const cadaSemanas = Number(a.apareceDia) || 1;
    if (cadaSemanas <= 1) return true;
    const weekNum = Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    return weekNum % cadaSemanas === 0;
  }
  if (freq === 15) {
    const diaBase = Number(a.apareceDia) || 1;
    return diaDelMes === diaBase || diaDelMes === diaBase + 15;
  }
  if (freq === 30) {
    const diaM = Number(a.apareceDia) || 1;
    return diaDelMes === diaM;
  }
  return true;
}

// Puntaje 0-100 de un reporte evaluado: Σ(peso×calificación)/Σ(peso) × 100, redondeado.
// calificación ∈ [0,1] (1 = perfecto). Portado de public/js/app.js (triggerEnviarEval).
export function calcularPuntajeEval(items: { peso: number; calificacion: number }[]): number {
  let total = 0;
  let max = 0;
  for (const it of items) {
    total += it.peso * it.calificacion;
    max += it.peso;
  }
  return max > 0 ? Math.round((total / max) * 100) : 0;
}
