import type { DiaPorHoras } from '@scilb/core';

/**
 * Lo que las pantallas muestran de un pago por horas (spec sueldo-por-horas §6): tres filas —
 * «Horas trabajadas», «Horas extra» y «Horas que faltaron»— y el detalle día por día. Se arma del
 * resultado congelado de la liquidación; nada se recalcula acá. Sin dependencias de servidor para
 * poder importarlo desde pantallas de cliente.
 */
export type DetalleHoras = {
  horasDentro: number;
  montoDentro: number;
  horasExtra: number;
  montoExtra: number;
  horasFaltaron: number;
  /** Lo que cobraría si cumple su horario. Sólo referencia: nunca se paga. */
  referencia: number | null;
  dias: DiaPorHoras[];
};

type Entrada = {
  modo?: string | null;
  asistencia?: { horasDentro?: number; horasExtra?: number; horasFaltaron?: number } | null;
  referencia?: number | null;
  dias?: DiaPorHoras[] | null;
  lineas: { concepto: string; monto: number }[];
};

/** `null` si la liquidación no es por horas (sueldo fijo, o una de antes): ahí todo queda como estaba. */
export function detalleHoras(e: Entrada): DetalleHoras | null {
  if (e.modo !== 'horas') return null;
  const monto = (concepto: string) =>
    e.lineas.filter((l) => l.concepto === concepto).reduce((s, l) => s + Number(l.monto ?? 0), 0);
  return {
    horasDentro: Number(e.asistencia?.horasDentro ?? 0),
    montoDentro: monto('Horas trabajadas'),
    horasExtra: Number(e.asistencia?.horasExtra ?? 0),
    montoExtra: monto('Horas extra'),
    horasFaltaron: Number(e.asistencia?.horasFaltaron ?? 0),
    referencia: e.referencia == null ? null : Number(e.referencia),
    dias: e.dias ?? [],
  };
}
