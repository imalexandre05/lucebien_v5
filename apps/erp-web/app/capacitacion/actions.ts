'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import {
  cancelarCapacitacion, cerrarCapacitacion, guardarItem, iniciarCapacitacion, marcarItem, registrarExamen,
} from '../../lib/capacitacion-repo';
import type { EstadoItem } from '@scilb/core';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// La base (RPC security definer) es quien decide quién puede; acá sólo se exige sesión y se traduce
// el error a algo que diga qué hacer.
async function conSesion<T extends object>(f: () => Promise<T>): Promise<R<T>> {
  try {
    if (!(await getSesion())) return { ok: false, error: 'Tu sesión venció. Vuelve a ingresar.' };
    const r = await f();
    revalidatePath('/capacitacion');
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo completar la acción' };
  }
}

export async function accionIniciar(nuevo: string, capacitador: string) {
  return conSesion(async () => { await iniciarCapacitacion(nuevo, capacitador); return {}; });
}
export async function accionMarcar(cap: string, item: string, estado: EstadoItem, obs: string | null) {
  return conSesion(async () => { await marcarItem(cap, item, estado, obs); return {}; });
}
export async function accionExamen(cap: string, nombre: string, nota: number) {
  return conSesion(async () => { await registrarExamen(cap, nombre, nota); return {}; });
}
export async function accionCerrar(cap: string) {
  return conSesion(async () => ({ resultado: await cerrarCapacitacion(cap) }));
}
export async function accionCancelar(cap: string) {
  return conSesion(async () => { await cancelarCapacitacion(cap); return {}; });
}
export async function accionGuardarItem(id: string | null, nombre: string, orden: number, activo: boolean) {
  return conSesion(async () => { await guardarItem(id, nombre, orden, activo); return {}; });
}
