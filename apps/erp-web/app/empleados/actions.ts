'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { actualizarEstadoEmpleado, actualizarContactoEmpleado } from '../../lib/empleados-repo';

async function exigirAdmin(): Promise<void> {
  const s = await getSesion();
  const ok = s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno';
  if (!ok) throw new Error('Solo administradores pueden gestionar colaboradores');
}

export async function accionEstadoEmpleado(id: string, activo: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await actualizarEstadoEmpleado(id, activo);
    revalidatePath('/empleados');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function accionEditarContacto(
  id: string,
  p: { telefono: string; dni: string; direccion: string; salarioBase: number },
): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await actualizarContactoEmpleado(id, p);
    revalidatePath('/empleados');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}
