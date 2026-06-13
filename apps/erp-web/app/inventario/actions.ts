'use server';

import { revalidatePath } from 'next/cache';
import { activoSchema } from '@scilb/core';
import { inventarioRepo } from '../../lib/inventario-repo';

export async function crearActivo(formData: FormData) {
  const parsed = activoSchema.safeParse({
    codigo: formData.get('codigo'),
    tipo: formData.get('tipo'),
    talla: formData.get('talla') ?? '',
    color: formData.get('color') ?? '',
    sedeCod: formData.get('sedeCod'),
    estado: formData.get('estado') ?? 'disponible',
    precioBase: Number(formData.get('precioBase') ?? 0),
    precioAlquiler: Number(formData.get('precioAlquiler') ?? 0),
    precioVenta: Number(formData.get('precioVenta') ?? 0),
    usosAcumulados: Number(formData.get('usosAcumulados') ?? 0),
  });
  if (!parsed.success) {
    // Demo: en la versión real devolvemos los errores de Zod a la UI.
    return;
  }
  await inventarioRepo.crear(parsed.data);
  revalidatePath('/inventario');
}

export async function eliminarActivo(formData: FormData) {
  await inventarioRepo.eliminar(String(formData.get('id')));
  revalidatePath('/inventario');
}
