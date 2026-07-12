'use server';

import { revalidatePath } from 'next/cache';
import { crearProveedor, editarProveedor, type ProveedorInput } from '../../lib/proveedores-repo';

export async function guardarProveedor(id: string | null, p: ProveedorInput): Promise<string | null> {
  if (!p.nombre.trim()) return 'El nombre del proveedor es obligatorio.';
  try {
    if (id) await editarProveedor(id, p);
    else await crearProveedor(p);
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo guardar el proveedor.';
  }
  revalidatePath('/proveedores');
  return null;
}
