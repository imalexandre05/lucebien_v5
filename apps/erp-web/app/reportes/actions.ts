'use server';

import { revalidatePath } from 'next/cache';
import type { TurnoReporte } from '@scilb/core';
import {
  listarActividadesConfig,
  getDraft,
  saveDraft,
  crearReporte,
  evaluarReporte,
  anularReporte,
  anularEval,
  type ActividadDelTurno,
} from '../../lib/reportes-repo';

// Inicia el espacio de trabajo de un turno: catálogo de actividades + draft existente (si hay).
export async function iniciarTurno(
  sede: string,
  fecha: string,
  turno: TurnoReporte,
): Promise<{ actividades: ActividadDelTurno[]; draft: Record<string, unknown> | null }> {
  const [actividades, draft] = await Promise.all([
    listarActividadesConfig(sede, fecha, turno),
    getDraft(sede, fecha, turno),
  ]);
  return { actividades, draft: draft?.payload ?? null };
}

export type CrearReporteInput = {
  id: string;
  sede: string;
  turno: string;
  actTotal: number;
  actDone: number;
  trabajadores: string[];
  actividades: { cod: string; nombre: string; cat: string | null; peso: number; obs: string }[];
  extras: { tipo: string; nombre: string; cantidad: number; precio_unitario: number; monto_total: number; detalle: string }[];
};

export async function accionCrearReporte(
  input: CrearReporteInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const id = await crearReporte(input);
    revalidatePath('/reportes');
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
