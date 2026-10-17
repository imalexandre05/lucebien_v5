// Capacitación de personal nuevo (spec docs/superpowers/specs/capacitacion/2026-10-17-...).
// Lógica pura: el estado del checklist, la nota del examen y cuándo se puede cerrar.
// Sin fechas "ahora" ni acceso a datos: todo llega por parámetro.

export type EstadoItem = 'bueno' | 'regular' | 'malo';
export const ESTADOS_ITEM: EstadoItem[] = ['bueno', 'regular', 'malo'];

export type ResumenChecklist = {
  total: number;
  bueno: number;
  regular: number;
  malo: number;
  pendientes: number;
};

/** `avances` es ítem → estado; los ítems que ya no están activos se ignoran. */
export function resumenChecklist(itemsActivos: string[], avances: Record<string, EstadoItem>): ResumenChecklist {
  const r: ResumenChecklist = { total: itemsActivos.length, bueno: 0, regular: 0, malo: 0, pendientes: 0 };
  for (const id of itemsActivos) {
    const e = avances[id];
    if (e === 'bueno' || e === 'regular' || e === 'malo') r[e] += 1;
    else r.pendientes += 1;
  }
  return r;
}

/** Nota vigente: la del último examen (por fecha; a igual fecha, el que viene después). */
export function notaExamen(examenes: { nota: number; fecha: string }[]): number | null {
  let mejor: { nota: number; fecha: string } | null = null;
  for (const e of examenes) {
    if (mejor === null || e.fecha >= mejor.fecha) mejor = e;
  }
  return mejor ? mejor.nota : null;
}

export function puedeCerrar(resumen: ResumenChecklist, cantidadExamenes: number): { ok: boolean; motivo?: string } {
  if (resumen.total === 0) return { ok: false, motivo: 'El checklist no tiene ítems activos.' };
  if (resumen.pendientes > 0) {
    return { ok: false, motivo: `Faltan marcar ${resumen.pendientes} de ${resumen.total} ítems.` };
  }
  if (cantidadExamenes < 1) return { ok: false, motivo: 'Falta registrar al menos un examen.' };
  return { ok: true };
}

export type ResultadoCapacitacion = 'aprobada' | 'por_reforzar';

export function resultadoCapacitacion(
  resumen: ResumenChecklist,
  nota: number | null,
  notaAprobatoria: number,
): ResultadoCapacitacion {
  if (nota === null || nota < notaAprobatoria || resumen.malo > 0) return 'por_reforzar';
  return 'aprobada';
}
