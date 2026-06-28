'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { crearAsistencia, eliminarAsistencia } from '../../lib/asistencias-repo';

async function soloAdmin() {
  const sesion = await getSesion();
  return sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
}

export async function accionCrearAsistencia(input: {
  empleadoId: string;
  fecha: string;
  turno: string;
  horaEntrada: string;
  horaSalida: string;
  minutosTardanza: number;
  obs: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    if (!input.empleadoId) return { ok: false, error: 'Elige un empleado' };
    await crearAsistencia({
      empleadoId: input.empleadoId,
      fecha: input.fecha,
      turno: input.turno,
      horaEntrada: input.horaEntrada,
      horaSalida: input.horaSalida,
      minutosTardanza: input.minutosTardanza,
      obs: input.obs,
    });
    revalidatePath('/asistencias');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar' };
  }
}

export async function accionEliminarAsistencia(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    await eliminarAsistencia(id);
    revalidatePath('/asistencias');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al eliminar' };
  }
}
