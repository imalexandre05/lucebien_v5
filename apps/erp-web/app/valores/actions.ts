'use server';

import { revalidatePath } from 'next/cache';
import type { PuntajeValores } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { enviarEvaluacionValores } from '../../lib/valores-repo';

// Guarda la evaluación de un compañero (o la corrige, si ya evaluaste este mes). Cualquier
// empleado autenticado puede evaluar — no es exclusivo de admin/encargado (Fase 12 tarea 1, a
// diferencia de /evaluaciones y /pagos). enviarEvaluacionValores() ya valida "no autoevaluarse"
// (puedeEvaluarValores del core) antes de tocar la base.
export async function accionEnviarValores(
  evaluadoId: string,
  mes: string,
  puntaje: PuntajeValores,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sesión requerida' };
    await enviarEvaluacionValores(sesion.usuario.id, evaluadoId, mes, puntaje);
    revalidatePath('/valores');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al guardar' };
  }
}
