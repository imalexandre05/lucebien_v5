'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { pedidoSchema } from '@scilb/core';
import { pedidosRepo } from '../../lib/pedidos-repo';

export async function crearPedido(formData: FormData) {
  const parsed = pedidoSchema.safeParse({
    clienteId: formData.get('clienteId'),
    tipo: formData.get('tipo'),
    sedeCod: formData.get('sedeCod'),
    activoId: formData.get('activoId') ?? '',
    descripcion: formData.get('descripcion') ?? '',
    fecha: formData.get('fecha'),
    fechaDevolucion: formData.get('fechaDevolucion') ?? '',
    total: formData.get('total') ?? 0,
  });
  if (!parsed.success) {
    redirect('/pedidos/nuevo?error=1');
  }
  await pedidosRepo.crear(parsed.data);
  revalidatePath('/pedidos');
  revalidatePath('/pipeline');
  redirect('/pedidos');
}
