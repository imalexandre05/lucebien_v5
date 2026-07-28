'use server';

import { revalidatePath } from 'next/cache';
import { crearSede, editarSede, type SedeInput } from '../../../lib/sedes-repo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

export async function accionCrearSede(p: SedeInput): Promise<R> {
  try {
    const cod = p.cod.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,3}$/.test(cod)) return { ok: false, error: 'Código de 2-3 letras/números (ej. HY).' };
    if (!p.nombre.trim()) return { ok: false, error: 'El nombre es requerido.' };
    await crearSede({ ...p, cod });
    revalidatePath('/configuracion/sedes');
    revalidatePath('/configuracion/actividades');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEditarSede(cod: string, p: Omit<SedeInput, 'cod'>): Promise<R> {
  try {
    if (!p.nombre.trim()) return { ok: false, error: 'El nombre es requerido.' };
    await editarSede(cod, p);
    revalidatePath('/configuracion/sedes');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
