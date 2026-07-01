'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { guardarConfig } from '../../lib/config-repo';

export async function accionGuardarConfig(
  items: { clave: string; valor: string }[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
    if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
    await guardarConfig(items);
    revalidatePath('/configuracion');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al guardar' };
  }
}
