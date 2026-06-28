'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { crearPago, eliminarPago } from '../../lib/pagos-repo';

async function soloAdmin() {
  const sesion = await getSesion();
  return sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
}

export async function accionCrearPago(input: {
  empleadoId: string;
  monto: number;
  bonus: number;
  descuentos: number;
  metodo: string;
  estado: string;
  fechaPago: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    if (!input.empleadoId) return { ok: false, error: 'Elige un empleado' };
    await crearPago(input);
    revalidatePath('/pagos');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar' };
  }
}

export async function accionEliminarPago(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    await eliminarPago(id);
    revalidatePath('/pagos');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al eliminar' };
  }
}
