'use server';

import { revalidatePath } from 'next/cache';
import type { Accion, Rol } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import { guardarMatrizPermisos } from '../../../lib/permisos-repo';
import { crearRol, actualizarRol } from '../../../lib/roles-repo';

type R = { ok: boolean; error?: string };

async function exigirAdmin(): Promise<void> {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) throw new Error('Solo admin/dueño');
}

// Filas keadas por rol base (7 literales) o por `roles.cod` de un rol derivado — misma columna
// en `permisos_modulos` (ver migración 0050).
export async function accionGuardarPermisos(
  filas: { rol: string; modulo: string; acciones: Accion[] }[],
): Promise<R> {
  try {
    await exigirAdmin();
    await guardarMatrizPermisos(filas);
    revalidatePath('/configuracion/permisos');
    // Todo el shell (sidebar/topbar/landing) lee la matriz — refrescar en cada navegación siguiente.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al guardar' };
  }
}

export async function accionCrearRol(nombre: string, rolBase: Rol): Promise<R & { cod?: string }> {
  try {
    await exigirAdmin();
    const rol = await crearRol(nombre, rolBase);
    revalidatePath('/configuracion/permisos');
    return { ok: true, cod: rol.cod };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al crear el rol' };
  }
}

export async function accionActualizarRol(cod: string, p: { nombre: string; activo: boolean }): Promise<R> {
  try {
    await exigirAdmin();
    await actualizarRol(cod, p);
    revalidatePath('/configuracion/permisos');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al actualizar el rol' };
  }
}
