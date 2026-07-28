'use server';

import { revalidatePath } from 'next/cache';
import {
  crearTipoProducto,
  editarTipoProducto,
  activarTipoProducto,
  eliminarTipoProducto,
  type ProductoTipoInput,
} from '../../../lib/producto-tipos-repo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

function validar(p: ProductoTipoInput): string | null {
  if (!p.cod.trim()) return 'El código es requerido.';
  if (!/^[a-z0-9_]+$/.test(p.cod.trim())) return 'El código solo admite minúsculas, números y guion bajo (ej. "pantalon").';
  if (!p.nombre.trim()) return 'El nombre es requerido.';
  if (!/^[A-Za-z]{2,4}$/.test(p.prefijo.trim())) return 'El prefijo debe tener de 2 a 4 letras (ej. "TN").';
  return null;
}

export async function accionCrearTipoProducto(p: ProductoTipoInput): Promise<R> {
  try {
    const err = validar(p);
    if (err) return { ok: false, error: err };
    await crearTipoProducto({ ...p, cod: p.cod.trim().toLowerCase(), prefijo: p.prefijo.trim().toUpperCase() });
    revalidatePath('/configuracion/tipos-producto');
    revalidatePath('/inventario');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEditarTipoProducto(cod: string, p: ProductoTipoInput): Promise<R> {
  try {
    const err = validar(p);
    if (err) return { ok: false, error: err };
    await editarTipoProducto(cod, p);
    revalidatePath('/configuracion/tipos-producto');
    revalidatePath('/inventario');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionActivarTipoProducto(cod: string, activo: boolean): Promise<R> {
  try {
    await activarTipoProducto(cod, activo);
    revalidatePath('/configuracion/tipos-producto');
    revalidatePath('/inventario');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEliminarTipoProducto(cod: string): Promise<R> {
  try {
    await eliminarTipoProducto(cod);
    revalidatePath('/configuracion/tipos-producto');
    revalidatePath('/inventario');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
