'use server';

import { revalidatePath } from 'next/cache';
import type { PesosEval } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { crearEvaluacion, componentesEvaluacion } from '../../lib/evaluaciones-repo';

async function esAdmin() {
  const s = await getSesion();
  return s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno';
}

// Calcula los componentes desde la data para el mes (YYYY-MM) → operaciones/software/limpieza/
// tardanza/descuento. Competencias/valores/exámenes/bonus siguen siendo manuales.
export async function accionComponentesEval(
  empleadoId: string,
  mes: string,
): Promise<{ ok: boolean; comp?: Record<string, number>; error?: string }> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    if (!empleadoId) return { ok: false, error: 'Elige un empleado' };
    const [y, m] = mes.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return { ok: false, error: 'Mes inválido (YYYY-MM)' };
    const ultimoDia = new Date(y, m, 0).getDate();
    const desde = `${mes}-01`;
    const hasta = `${mes}-${String(ultimoDia).padStart(2, '0')}`;
    const comp = await componentesEvaluacion(empleadoId, desde, hasta);
    return { ok: true, comp };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al calcular' };
  }
}

export async function accionCrearEvaluacion(input: {
  empleadoId: string;
  mes: string;
  notaFinal: number;
  componentes: Record<string, number>;
  pesos: PesosEval;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
    if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
    if (!input.empleadoId) return { ok: false, error: 'Elige un empleado' };
    await crearEvaluacion({
      empleadoId: input.empleadoId,
      mes: input.mes,
      notaFinal: input.notaFinal,
      componentes: input.componentes,
      pesos: input.pesos,
      cicloDesde: null,
      cicloHasta: null,
    });
    revalidatePath('/evaluaciones');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al guardar' };
  }
}
