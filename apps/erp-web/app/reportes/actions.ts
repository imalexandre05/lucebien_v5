'use server';

import { revalidatePath } from 'next/cache';
import type { TurnoReporte } from '@scilb/core';
import {
  listarActividadesConfig,
  listarLayoutZonas,
  getDraft,
  saveDraft,
  crearReporte,
  evaluarReporte,
  anularReporte,
  anularEval,
  marcarAsistenciaReporte,
  buscarReporteId,
  buscarConflictoTurno,
  type ActividadDelTurno,
  type LayoutZona,
  type ConflictoTurno,
} from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { crearIncidenciasDeReporte } from '../../lib/incidencias-repo';

// Inicia el espacio de trabajo de un turno: catálogo de actividades + zonas de limpieza + draft.
// `yaEnviado` = id del reporte si el turno ya se envió (para pasar a Evaluación, como el viejo).
export async function iniciarTurno(
  sede: string,
  fecha: string,
  turno: TurnoReporte,
): Promise<{
  actividades: ActividadDelTurno[];
  zonas: LayoutZona[];
  draft: Record<string, unknown> | null;
  yaEnviado: string | null;
  conflicto: ConflictoTurno;
}> {
  const [actividades, zonas, draft, yaEnviado, conflicto] = await Promise.all([
    listarActividadesConfig(sede, fecha, turno),
    listarLayoutZonas(sede),
    getDraft(sede, fecha, turno),
    buscarReporteId(sede, fecha, turno),
    buscarConflictoTurno(sede, fecha, turno),
  ]);
  return { actividades, zonas, draft: draft?.payload ?? null, yaEnviado, conflicto };
}

// Tipos locales (no exportados): un archivo 'use server' solo puede EXPORTAR funciones async.
type IncidenciaReporte = {
  tipo: string;
  nivel: string;
  descripcion: string;
  responsableId: string | null;
  puntosPenalidad: number;
};

type CrearReporteInput = {
  id: string;
  sede: string;
  fecha: string;
  turno: string;
  encargado: string | null;
  actTotal: number;
  actDone: number;
  trabajadores: string[];
  actividades: { cod: string; nombre: string; cat: string | null; peso: number; obs: string }[];
  extras: { tipo: string; nombre: string; cantidad: number; precio_unitario: number; monto_total: number; detalle: string; registrado_por_id: string | null }[];
  incidencias: IncidenciaReporte[];
};

export async function accionCrearReporte(
  input: CrearReporteInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const id = await crearReporte(input);
    // Incidencias del turno → registradas ligadas al reporte (origen='reporte').
    if (input.incidencias.length) {
      const sesion = await getSesion();
      await crearIncidenciasDeReporte({
        sede: input.sede,
        fecha: input.fecha,
        reporteId: id,
        reportadoPorId: sesion?.usuario.id ?? null,
        items: input.incidencias,
      });
    }
    // Auto-asistencia (best-effort): no debe romper la creación del reporte si falla.
    try {
      await marcarAsistenciaReporte(id);
    } catch {
      /* ignore */
    }
    revalidatePath('/reportes');
    revalidatePath('/incidencias');
    revalidatePath('/asistencias');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al crear el reporte' };
  }
}

// Autosave del formulario (best-effort; no rompe la UI si falla).
export async function accionGuardarDraft(p: {
  sede: string;
  fecha: string;
  turno: string;
  encargadoId: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await saveDraft(p);
  } catch {
    // silencioso: el autosave no debe interrumpir al usuario
  }
}

export async function accionEvaluar(
  id: string,
  calificaciones: { cod: string; cal: number; obs: string }[],
): Promise<{ ok: boolean; puntaje?: number; error?: string }> {
  try {
    const puntaje = await evaluarReporte(id, calificaciones);
    revalidatePath(`/reportes/${id}`);
    revalidatePath('/reportes');
    return { ok: true, puntaje };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al evaluar' };
  }
}

export async function accionAnular(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await anularReporte(id);
    revalidatePath('/reportes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al anular' };
  }
}

export async function accionAnularEval(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await anularEval(id);
    revalidatePath(`/reportes/${id}`);
    revalidatePath('/reportes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al anular la evaluación' };
  }
}
