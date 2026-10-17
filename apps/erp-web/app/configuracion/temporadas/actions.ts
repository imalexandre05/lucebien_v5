'use server';

import { revalidatePath } from 'next/cache';
import type { Temporada } from '@scilb/core';
import { eliminarTemporada, guardarTemporada } from '../../../lib/temporadas-repo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

export async function accionGuardarTemporada(t: Temporada): Promise<R> {
  try {
    if (!t.nombre.trim()) return { ok: false, error: 'Ponle un nombre a la temporada.' };
    if (!t.desde || !t.hasta) return { ok: false, error: 'Indica desde y hasta.' };
    await guardarTemporada(t);
    revalidatePath('/', 'layout'); // las metas se ven en ventas, contratos y desempeño
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEliminarTemporada(id: string): Promise<R> {
  try {
    await eliminarTemporada(id);
    revalidatePath('/', 'layout'); // las metas se ven en ventas, contratos y desempeño
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
