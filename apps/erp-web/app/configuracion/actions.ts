'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { guardarConfig, crearParametroConfig, eliminarParametroConfig } from '../../lib/config-repo';
import type { ConfigTipo } from '../../lib/config-catalogo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

async function exigirAdmin(): Promise<R | null> {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
  return null;
}

export async function accionGuardarConfig(items: { clave: string; valor: string }[]): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    await guardarConfig(items);
    revalidatePath('/configuracion');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

const CLAVE_RE = /^[a-z][a-z0-9_]{1,49}$/;
const TIPOS: ConfigTipo[] = ['numero', 'booleano', 'texto', 'lista', 'color', 'horario'];

export async function accionCrearParametroConfig(p: {
  clave: string;
  valor: string;
  tipo: ConfigTipo;
  seccion: string;
  descripcion: string;
  opciones?: string[];
}): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    const clave = p.clave.trim().toLowerCase();
    if (!CLAVE_RE.test(clave)) {
      return { ok: false, error: 'La clave debe empezar con una letra y usar solo minúsculas, números y guion bajo (ej. "mi_parametro").' };
    }
    if (!TIPOS.includes(p.tipo)) return { ok: false, error: 'Tipo inválido.' };
    if (p.tipo === 'lista' && (!p.opciones || p.opciones.length < 2)) {
      return { ok: false, error: 'Una lista necesita al menos 2 opciones.' };
    }
    await crearParametroConfig({ ...p, clave });
    revalidatePath('/configuracion');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEliminarParametroConfig(clave: string): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    await eliminarParametroConfig(clave);
    revalidatePath('/configuracion');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
