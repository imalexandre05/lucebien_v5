'use server';

import { revalidatePath } from 'next/cache';
import {
  listarActividadesAdmin,
  generarCod,
  crearActividad,
  editarActividad,
  activarActividad,
  eliminarActividad,
  duplicarActividades,
  type ActividadInput,
} from '../../../lib/actividades-repo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

export async function accionCrearActividad(
  sedes: string[],
  relacion: 'S' | 'T',
  p: ActividadInput,
): Promise<R & { cod?: string }> {
  try {
    if (!sedes.length) return { ok: false, error: 'Selecciona al menos una sede.' };
    if (!p.nombre.trim()) return { ok: false, error: 'El nombre es requerido.' };
    const catalogo = await listarActividadesAdmin();
    const cod = generarCod(catalogo, p.categoria, relacion);
    await crearActividad(sedes, cod, p);
    revalidatePath('/configuracion/actividades');
    return { ok: true, cod };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEditarActividad(
  id: string,
  cod: string,
  sedes: string[],
  p: ActividadInput,
): Promise<R> {
  try {
    if (!p.nombre.trim()) return { ok: false, error: 'El nombre es requerido.' };
    await editarActividad(id, cod, sedes, p);
    revalidatePath('/configuracion/actividades');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionActivarActividad(id: string, activa: boolean): Promise<R> {
  try {
    await activarActividad(id, activa);
    revalidatePath('/configuracion/actividades');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEliminarActividad(id: string): Promise<R> {
  try {
    await eliminarActividad(id);
    revalidatePath('/configuracion/actividades');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionDuplicarActividades(desde: string, hacia: string): Promise<R & { n?: number }> {
  try {
    if (desde === hacia) return { ok: false, error: 'Elige una sede distinta.' };
    const n = await duplicarActividades(desde, hacia);
    revalidatePath('/configuracion/actividades');
    return { ok: true, n };
  } catch (e) {
    return fallo(e);
  }
}
