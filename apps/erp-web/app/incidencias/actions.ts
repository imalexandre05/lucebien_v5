'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { crearIncidencia, eliminarIncidencia } from '../../lib/incidencias-repo';

function fechaPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

export async function accionCrearIncidencia(input: {
  tipo: string;
  nivel: string;
  descripcion: string;
  responsableId: string | null;
  puntosPenalidad: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    if (!input.tipo) return { ok: false, error: 'Elige un tipo' };
    await crearIncidencia({
      sede: sesion.usuario.sede,
      fecha: fechaPeru(),
      tipo: input.tipo,
      descripcion: input.descripcion,
      nivel: input.nivel,
      responsableId: input.responsableId,
      reportadoPorId: sesion.usuario.id,
      puntosPenalidad: input.puntosPenalidad,
    });
    revalidatePath('/incidencias');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar' };
  }
}

export async function accionEliminarIncidencia(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
    if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
    await eliminarIncidencia(id);
    revalidatePath('/incidencias');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al eliminar' };
  }
}
