'use server';

import { revalidatePath } from 'next/cache';
import type { PesosEval } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { crearEvaluacion } from '../../lib/evaluaciones-repo';

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
