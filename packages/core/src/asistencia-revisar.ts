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
  /** Hora de inicio acordada ese día (0168): la tardanza se mide contra ella. */
  inicioAcordado?: string | null;
  /** El administrador ya lo miró (0165). Oculta tardanza, falta y hora estimada; nunca un dato que falta. */
  revisadaEn?: string | null;
}

export type TipoPorRevisar =
  | 'sin_marca'
  | 'una_marca'
  | 'revisar'
  | 'tardanza'
  | 'falta'
  | 'turno_sin_marcas'
  | 'pausa_trabajada'
  | 'hora_estimada';

export interface DiaPorRevisar {
  fecha: string;
  tipo: TipoPorRevisar;
  /** Sólo en `tardanza`: minutos después del inicio de su horario. */
  minutosTarde?: number;
  /** Sólo en `una_marca`: qué hora falta. */
  falta?: 'entrada' | 'salida';
  /** Sólo en `turno_sin_marcas`: la hora de inicio del turno sin marcas. */
  turno?: string;
}

const minutos = (h: string): number => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};

/**
 * Los días del rango (hasta AYER: hoy todavía se está trabajando) que tienen un problema, uno por
 * día, del más viejo al más nuevo. Prioridad dentro del día (spec §9.6): una marca, revisar, sin
 * marca, falta, tardanza, turno sin marcas, pausa trabajada, hora estimada.
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
  if (p.hasta < p.desde) return [];
  const out: DiaPorRevisar[] = [];
  for (const fecha of diasDelPeriodo(p.desde, p.hasta)) {
    if (fecha >= p.hoy) break;
    const filas = p.filas.filter((f) => f.fecha === fecha);
    const contratado = porDia.get(diaSemanaISO(fecha));
    const conHoras = filas.filter((f) => f.horaEntrada || f.horaSalida);
    // Revisado sólo si TODAS las filas del día lo están (spec §9.2).
    const revisado = filas.length > 0 && filas.every((f) => f.revisadaEn);

    // Un dato que falta nunca se da por revisado: sin él no se puede pagar ni cerrar.
    const unaMarca = filas.find((f) => f.condicion === 'sin_dato' && Boolean(f.horaEntrada) !== Boolean(f.horaSalida));
    if (unaMarca) {
      out.push({ fecha, tipo: 'una_marca', falta: unaMarca.horaEntrada ? 'salida' : 'entrada' });
      continue;
    }
    if (filas.some((f) => f.condicion === 'sin_dato' && f.horaEntrada && f.horaSalida)) {
      out.push({ fecha, tipo: 'revisar' });
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
    const tramos = conHoras
      .filter((f) => f.horaEntrada && f.horaSalida)
      .map((f) => ({ ini: minutos(f.horaEntrada as string), fin: minutos(f.horaSalida as string) }));
    if (contratado && filas.some((f) => f.condicion === 'trabajado') && !filas.some((f) => f.tardanzaJustificada)) {
      const entradas = conHoras.map((f) => f.horaEntrada).filter((h): h is string => Boolean(h)).map(minutos);
      if (entradas.length > 0) {
        // Si algún tramo del día trae un inicio acordado (0168), manda sobre el horario contratado.
        const acordado = filas.map((f) => f.inicioAcordado).find((h): h is string => Boolean(h));
        const inicio = acordado ? minutos(acordado) : contratado.inicioMin;
        const tarde = Math.min(...entradas) - inicio;
        if (tarde > p.toleranciaMinutos) {
          out.push({ fecha, tipo: 'tardanza', minutosTarde: Math.round(tarde) });
          continue;
        }
      }
    }
    // Días con dos o más turnos (spec §9.3 y §9.4).
    const turnos = p.horario
      .filter((t) => t.diaSemana === diaSemanaISO(fecha))
      .map((t) => ({ ini: minutos(t.horaInicio), fin: minutos(t.horaFin), texto: t.horaInicio.slice(0, 5) }))
      .sort((a, b) => a.ini - b.ini);
    if (turnos.length >= 2 && tramos.length > 0) {
      const sinMarcas = turnos.find((t) => !tramos.some((x) => x.ini < t.fin && x.fin > t.ini));
      if (sinMarcas) {
        out.push({ fecha, tipo: 'turno_sin_marcas', turno: sinMarcas.texto });
        continue;
      }
      const deCorrido = turnos.slice(1).some((t, k) => tramos.some((x) => x.ini <= turnos[k].fin && x.fin >= t.ini));
      if (deCorrido) {
        out.push({ fecha, tipo: 'pausa_trabajada' });
        continue;
      }
    }
    if (filas.some((f) => f.entradaEstimada || f.salidaEstimada)) out.push({ fecha, tipo: 'hora_estimada' });
  }
  return out;
}
