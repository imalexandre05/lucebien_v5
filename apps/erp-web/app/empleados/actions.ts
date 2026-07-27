'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import {
  actualizarEstadoEmpleado,
  establecerContrasenaEmpleado,
  actualizarEmpleado,
  crearEmpleado,
  type EditarEmpleadoInput,
  type NuevoEmpleadoInput,
} from '../../lib/empleados-repo';

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

// Editar TODO el empleado (Fase 1): nombre, rol, sede primaria, tiendas, fecha de ingreso, notas
// + contacto. `cod` nunca se recibe (inmutable, es la credencial de Supabase Auth).
export async function accionEditarEmpleado(
  id: string,
  p: EditarEmpleadoInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    await actualizarEmpleado(id, p);
    revalidatePath('/empleados');
    // El nombre/rol pueden cambiar la sesión de OTRO usuario (o la propia, si el admin se edita
    // a sí mismo) — refrescar el shell entero para que sidebar/topbar reflejen el rol nuevo.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function accionCrearEmpleado(
  p: NuevoEmpleadoInput,
): Promise<{ ok: boolean; error?: string; cod?: string }> {
  try {
    await exigirAdmin();
    const { cod } = await crearEmpleado(p);
    revalidatePath('/empleados');
    return { ok: true, cod };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function accionEstablecerContrasena(id: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirAdmin();
    if (password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres');
    await establecerContrasenaEmpleado(id, password);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}
