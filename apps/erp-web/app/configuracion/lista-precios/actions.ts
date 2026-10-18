'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import { eliminarItemPrecio, guardarItemPrecio, type CategoriaPrecio } from '../../../lib/lista-precios-repo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

async function esAdmin(): Promise<boolean> {
  const s = await getSesion();
  return s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno';
}

export async function accionGuardarItemPrecio(i: {
  id?: string;
  nombre: string;
  categoria: CategoriaPrecio;
  precio: number;
  activo: boolean;
}): Promise<R> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Solo el administrador puede cambiar la lista.' };
    if (!i.nombre.trim()) return { ok: false, error: 'Ponle un nombre al artículo.' };
    if (!Number.isFinite(i.precio) || i.precio < 0) return { ok: false, error: 'El precio tiene que ser un número de cero o más.' };
    await guardarItemPrecio(i);
    revalidatePath('/configuracion/lista-precios');
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEliminarItemPrecio(id: string): Promise<R> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Solo el administrador puede cambiar la lista.' };
    await eliminarItemPrecio(id);
    revalidatePath('/configuracion/lista-precios');
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
