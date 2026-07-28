'use server';

import { revalidatePath } from 'next/cache';
import { activoSchema, type ActivoInput } from '@scilb/core';
import { inventarioRepo, despiezarActivo, type PiezaDespiece } from '../../lib/inventario-repo';

type R = { ok: boolean; error?: string };

// El modal envía un objeto tipado (no FormData): los atributos son pares clave-valor dinámicos
// que no calzan bien en un <form> nativo. Mismo patrón que otras acciones del ERP (p.ej.
// accionCrearReporte) que ya reciben objetos en vez de FormData.
export async function accionCrearActivo(input: ActivoInput): Promise<R> {
  const parsed = activoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  try {
    await inventarioRepo.crear(parsed.data);
    revalidatePath('/inventario');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al crear el activo' };
  }
}

export async function accionEditarActivo(id: string, input: ActivoInput): Promise<R> {
  const parsed = activoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  try {
    await inventarioRepo.editar(id, parsed.data);
    revalidatePath('/inventario');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al editar el activo' };
  }
}

export async function accionEliminarActivo(id: string): Promise<R> {
  try {
    await inventarioRepo.eliminar(id);
    revalidatePath('/inventario');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al dar de baja' };
  }
}

// Despiece saco/pantalón (Fase 7). Idempotente en el RPC: si ya estaba despiezado, devuelve las
// mismas piezas en vez de duplicar — acá simplemente se propaga el resultado.
export async function accionDespiezarActivo(id: string): Promise<R & { piezas?: PiezaDespiece[] }> {
  try {
    const piezas = await despiezarActivo(id);
    revalidatePath('/inventario');
    return { ok: true, piezas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al despiezar' };
  }
}
