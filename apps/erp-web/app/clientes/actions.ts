'use server';

import { revalidatePath } from 'next/cache';
import { clienteSchema } from '@scilb/core';
import { clientesRepo } from '../../lib/clientes-repo';

export async function crearCliente(formData: FormData) {
  const parsed = clienteSchema.safeParse({
    nombre: formData.get('nombre'),
    dni: formData.get('dni') ?? '',
    telefono: formData.get('telefono') ?? '',
    sedeCod: formData.get('sedeCod'),
    medidas: { talla: formData.get('talla') ?? '' },
  });
  if (!parsed.success) {
    return; // Demo: la versión real devuelve los errores de Zod a la UI.
  }
  await clientesRepo.crear(parsed.data);
  revalidatePath('/clientes');
}

export async function eliminarCliente(formData: FormData) {
  await clientesRepo.eliminar(String(formData.get('id')));
  revalidatePath('/clientes');
}
