// Frases de la lista «Por revisar» y resumen del horario de la semana.
// Spec: docs/superpowers/specs/sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md §4.
//
// Todo texto puro (sin fechas del sistema, sin base): se prueba aparte. Las cifras salen de los
// parámetros efectivos del contrato, no de números escritos aquí.

import { diaSemanaISO, type DiaPorRevisar } from '@scilb/core';

const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-10-07' → 'mié 07 oct'. Aritmética de texto: sin zona horaria. */
export function fechaAmable(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${DIAS_CORTOS[diaSemanaISO(iso) - 1]} ${d} ${MESES_CORTOS[Number(m) - 1] ?? m}`;
}

export type ParametrosFrase = {
  toleranciaMinutos: number;
  tardanzasLibres: number;
  penalidadTardanza: number;
  diasDescuentoPorFalta: number;
};

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que pasó ese día, en una línea. `previo` son las horas que el día ya tiene, si tiene. */
export function queOcurrio(d: DiaPorRevisar, previo: { entrada: string | null; salida: string | null }): string {
  switch (d.tipo) {
    case 'sin_marca':
      return 'No hay ninguna marca de este día.';
    case 'una_marca':
      return d.falta === 'salida'
        ? `Solo hay la entrada${previo.entrada ? ` (${previo.entrada})` : ''}; falta la salida.`
        : `Solo hay la salida${previo.salida ? ` (${previo.salida})` : ''}; falta la entrada.`;
    case 'tardanza':
      return `Llegó ${plural(d.minutosTarde ?? 0, 'minuto', 'minutos')} tarde.`;
    case 'falta':
      return 'Está marcado como falta.';
    case 'hora_estimada':
      return 'Una de las horas la puso el sistema.';
    case 'revisar':
      return 'El huellero dejó este día con varias horas y no pudo decidir solo.';
    case 'turno_sin_marcas':
      return `No hay marcas del turno de las ${d.turno ?? ''}.`.replace(' .', '.');
    case 'pausa_trabajada':
      return 'Marcó de corrido entre sus dos turnos.';
  }
}

/** Qué pasa con el pago en cada caso (spec §4). */
export function fraseDelPago(d: DiaPorRevisar, p: ParametrosFrase): string {
  switch (d.tipo) {
    case 'sin_marca':
      return 'Mientras no se resuelva, este pago no se puede cerrar.';
    case 'una_marca':
      return 'Hasta poner la hora que falta, este día no se paga y el pago no se puede cerrar.';
    case 'tardanza':
      return (
        `Tiene ${plural(p.tardanzasLibres, 'tardanza libre', 'tardanzas libres')}; desde la siguiente se ` +
        `descuentan ${soles(p.penalidadTardanza)} por cada una. Si la justificas, no cuenta.`
      );
    case 'falta': {
      // RN-09: `diasDescuentoPorFalta` es lo que la falta cuesta EN TOTAL; el día no trabajado ya es uno.
      const extra = Math.max(0, p.diasDescuentoPorFalta - 1);
      return (
        (extra > 0
          ? `Ese día no se paga y en total la falta cuesta ${plural(p.diasDescuentoPorFalta, 'día', 'días')} de sueldo. `
          : 'Ese día no se paga y no se descuenta nada más. ') + 'Si la justificas, solo no se paga ese día.'
      );
    }
    case 'hora_estimada':
      return 'Esa hora no fue una marca. Revísala antes de pagar; si está bien, se paga tal cual.';
    case 'revisar':
      return 'Hasta revisarlo, este pago no se puede cerrar.';
    case 'turno_sin_marcas':
      return 'Las horas de ese turno no se pagan. Si sí trabajó, pon sus horas.';
    case 'pausa_trabajada':
      return 'El tiempo entre sus dos turnos se paga como hora extra. Si no trabajó en ese rato, corrige las horas.';
  }
}

type TurnoLite = { diaSemana: number; horaInicio: string; horaFin: string };

/** 'lun a vie 09:00–13:00 y 14:00–20:00 · sáb 09:00–14:00'. Días seguidos con el mismo horario se juntan. */
export function resumenHorarioSemana(turnos: readonly TurnoLite[]): string {
  const porDia: string[] = [];
  for (let dia = 1; dia <= 7; dia++) {
    porDia.push(
      turnos
        .filter((t) => t.diaSemana === dia)
        .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
        .map((t) => `${t.horaInicio.slice(0, 5)}–${t.horaFin.slice(0, 5)}`)
        .join(' y '),
    );
  }
  const grupos: string[] = [];
  let i = 0;
  while (i < 7) {
    if (!porDia[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < 7 && porDia[j + 1] === porDia[i]) j++;
    const dias = j === i ? DIAS_CORTOS[i] : `${DIAS_CORTOS[i]} a ${DIAS_CORTOS[j]}`;
    grupos.push(`${dias} ${porDia[i]}`);
    i = j + 1;
  }
  return grupos.length > 0 ? grupos.join(' · ') : 'Sin horario pactado';
}
