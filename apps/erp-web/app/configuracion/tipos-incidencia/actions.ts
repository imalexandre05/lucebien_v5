'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import {
  crearTipoIncidencia,
  editarTipoIncidencia,
  activarTipoIncidencia,
  eliminarTipoIncidencia,
  type TipoIncidenciaInput,
} from '../../../lib/incidencias-repo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

async function exigirAdmin(): Promise<R | null> {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
  return null;
}

function validar(p: TipoIncidenciaInput): string | null {
  if (!p.tipo.trim()) return 'El nombre del tipo es requerido.';
  if (!['Alto', 'Medio', 'Bajo'].includes(p.nivelDefault)) return 'Gravedad inválida.';
  if (!Number.isFinite(p.puntosDefault) || p.puntosDefault < 0) return 'Los puntos de penalidad deben ser un número ≥ 0.';
  return null;
}

export async function accionCrearTipoIncidencia(p: TipoIncidenciaInput): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    const err = validar(p);
    if (err) return { ok: false, error: err };
    await crearTipoIncidencia({ ...p, tipo: p.tipo.trim(), categoria: p.categoria.trim() });
    revalidatePath('/configuracion/tipos-incidencia');
    revalidatePath('/incidencias');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEditarTipoIncidencia(id: string, p: TipoIncidenciaInput): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    const err = validar(p);
    if (err) return { ok: false, error: err };
    await editarTipoIncidencia(id, { ...p, tipo: p.tipo.trim(), categoria: p.categoria.trim() });
    revalidatePath('/configuracion/tipos-incidencia');
    revalidatePath('/incidencias');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionActivarTipoIncidencia(id: string, activo: boolean): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    await activarTipoIncidencia(id, activo);
    revalidatePath('/configuracion/tipos-incidencia');
    revalidatePath('/incidencias');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEliminarTipoIncidencia(id: string): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    await eliminarTipoIncidencia(id);
    revalidatePath('/configuracion/tipos-incidencia');
    revalidatePath('/incidencias');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
