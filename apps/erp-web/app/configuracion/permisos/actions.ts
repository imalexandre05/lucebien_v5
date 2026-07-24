'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import { guardarMatrizPermisos } from '../../../lib/permisos-repo';
import type { Accion, Rol } from '@scilb/core';

type R = { ok: boolean; error?: string };

export async function accionGuardarPermisos(
  filas: { rol: Rol; modulo: string; acciones: Accion[] }[],
): Promise<R> {
  try {
    const sesion = await getSesion();
    const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
    if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
    await guardarMatrizPermisos(filas);
    revalidatePath('/configuracion/permisos');
    // Todo el shell (sidebar/topbar/landing) lee la matriz — refrescar en cada navegación siguiente.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al guardar' };
  }
}
