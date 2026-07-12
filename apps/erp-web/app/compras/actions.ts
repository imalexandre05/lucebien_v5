'use server';

import { revalidatePath } from 'next/cache';
import { validarCompra } from '@scilb/core';
import { crearCompra, recibirCompra, anularCompra } from '../../lib/compras-repo';

export async function crearCompraAction(p: {
  proveedorId: string | null;
  sedeCod: string;
  obs: string;
  items: { materialId: string; cantidad: number; costoUnitario: number }[];
}): Promise<string | null> {
  if (!p.sedeCod) return 'Selecciona la sede.';
  const items = p.items.filter((i) => i.materialId && i.cantidad > 0);
  const errores = validarCompra(items.map((i) => ({ cantidad: i.cantidad, costoUnitario: i.costoUnitario })));
  if (errores.length) return errores[0];
  try {
    await crearCompra({ proveedorId: p.proveedorId, sedeCod: p.sedeCod, obs: p.obs.trim() || null, items });
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo registrar la compra.';
  }
  revalidatePath('/compras');
  revalidatePath('/materiales');
  return null;
}

export async function recibirCompraAction(id: string): Promise<string | null> {
  if (!id) return 'Compra inválida.';
  try {
    await recibirCompra(id);
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo recibir la compra.';
  }
  revalidatePath('/compras');
  revalidatePath('/materiales');
  return null;
}

export async function anularCompraAction(id: string): Promise<string | null> {
  if (!id) return 'Compra inválida.';
  try {
    await anularCompra(id);
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo anular la compra.';
  }
  revalidatePath('/compras');
  revalidatePath('/materiales');
  return null;
}
