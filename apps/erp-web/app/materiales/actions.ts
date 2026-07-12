'use server';

import { revalidatePath } from 'next/cache';
import { crearMaterial, editarMaterial, ajustarStock, type MaterialInput } from '../../lib/materiales-repo';

export async function guardarMaterial(id: string | null, p: MaterialInput): Promise<string | null> {
  if (!p.nombre.trim()) return 'El nombre del material es obligatorio.';
  if (!p.sedeCod) return 'Selecciona la sede.';
  if (p.stockMinimo < 0) return 'El stock mínimo no puede ser negativo.';
  try {
    if (id) await editarMaterial(id, p);
    else await crearMaterial(p);
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo guardar el material.';
  }
  revalidatePath('/materiales');
  return null;
}

export async function ajustarStockAction(p: {
  materialId: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  motivo: string;
}): Promise<string | null> {
  if (!p.materialId) return 'Material inválido.';
  if (!(p.cantidad >= 0)) return 'La cantidad no puede ser negativa.';
  try {
    await ajustarStock(p);
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo ajustar el stock.';
  }
  revalidatePath('/materiales');
  return null;
}
