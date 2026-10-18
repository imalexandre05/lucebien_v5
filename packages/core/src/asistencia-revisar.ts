// asistencia-revisar.ts — qué días de asistencia necesitan que el administrador los mire.
// Spec: docs/superpowers/specs/sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md §4
// (decisión del dueño n.º 4, 18-oct-2026).
//
// Puro: el «hoy» lo pasa quien llama, en hora Perú (no-negociable 4). No cambia ningún pago: sólo
// arma la lista «Por revisar». Los días completos y sin problema no aparecen: se dan por trabajados.

import { diasDelPeriodo, diaSemanaISO, resumirHorario, type TurnoContratado } from './sueldos';

export interface FilaAsistenciaRevisar {
  fecha: string;
  condicion: 'sin_dato' | 'trabajado' | 'falta';
  horaEntrada: string | null;
  horaSalida: string | null;
  tardanzaJustificada?: boolean;
  faltaJustificada?: boolean;
  entradaEstimada?: boolean;
  salidaEstimada?: boolean;
  /** El administrador ya lo miró (0165). Oculta tardanza, falta y hora estimada; nunca un dato que falta. */
  revisadaEn?: string | null;
}

export type TipoPorRevisar = 'sin_marca' | 'una_marca' | 'tardanza' | 'falta' | 'hora_estimada';

export interface DiaPorRevisar {
  fecha: string;
  tipo: TipoPorRevisar;
  /** Sólo en `tardanza`: minutos después del inicio de su horario. */
  minutosTarde?: number;
  /** Sólo en `una_marca`: qué hora falta. */
  falta?: 'entrada' | 'salida';
}

const minutos = (h: string): number => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};

/**
 * Los días del rango (hasta `hoy`) que tienen un problema, uno por día, del más viejo al más nuevo.
 * Orden de prioridad dentro del día: sin marca, una marca, falta, tardanza, hora estimada.
 */
export function diasPorRevisar(p: {
  desde: string;
  hasta: string;
  hoy: string;
  horario: TurnoContratado[];
  filas: readonly FilaAsistenciaRevisar[];
  toleranciaMinutos: number;
}): DiaPorRevisar[] {
  const porDia = resumirHorario(p.horario);
  const hasta = p.hasta < p.hoy ? p.hasta : p.hoy;
  if (hasta < p.desde) return [];
  const out: DiaPorRevisar[] = [];
  for (const fecha of diasDelPeriodo(p.desde, hasta)) {
    const filas = p.filas.filter((f) => f.fecha === fecha);
    const contratado = porDia.get(diaSemanaISO(fecha));
    const conHoras = filas.filter((f) => f.horaEntrada || f.horaSalida);
    const revisado = filas.some((f) => f.revisadaEn);

    // Un dato que falta nunca se da por revisado: sin él no se puede pagar ni cerrar.
    const unaMarca = filas.find((f) => f.condicion === 'sin_dato' && Boolean(f.horaEntrada) !== Boolean(f.horaSalida));
    if (unaMarca) {
      out.push({ fecha, tipo: 'una_marca', falta: unaMarca.horaEntrada ? 'salida' : 'entrada' });
      continue;
    }
    const hayFalta = filas.some((f) => f.condicion === 'falta');
    if (contratado && conHoras.length === 0 && !hayFalta) {
      out.push({ fecha, tipo: 'sin_marca' });
      continue;
    }
    if (revisado) continue;
    if (hayFalta) {
      if (!filas.some((f) => f.faltaJustificada)) out.push({ fecha, tipo: 'falta' });
      continue;
    }
    if (contratado && filas.some((f) => f.condicion === 'trabajado') && !filas.some((f) => f.tardanzaJustificada)) {
      const entradas = conHoras.map((f) => f.horaEntrada).filter((h): h is string => Boolean(h)).map(minutos);
      if (entradas.length > 0) {
        const tarde = Math.min(...entradas) - contratado.inicioMin;
        if (tarde > p.toleranciaMinutos) {
          out.push({ fecha, tipo: 'tardanza', minutosTarde: Math.round(tarde) });
          continue;
        }
      }
    }
    if (filas.some((f) => f.entradaEstimada || f.salidaEstimada)) out.push({ fecha, tipo: 'hora_estimada' });
  }
  return out;
}
