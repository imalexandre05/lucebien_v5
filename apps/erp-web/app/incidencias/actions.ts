'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { actualizarResponsableIncidencia, crearIncidencia, eliminarIncidencia, listarTiposIncidencia } from '../../lib/incidencias-repo';

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
    // C-2 (spec 2026-08-25-incidencias-alcance-y-formulario-design.md §3): la descripción es
    // obligatoria sólo para el tipo de categoría 'Otros'. El formulario ya deshabilita el botón
    // en ese caso; esto es lo que de verdad lo exige — el cliente puede saltearse un `disabled`.
    const tipos = await listarTiposIncidencia();
    const tipoInfo = tipos.find((t) => t.tipo === input.tipo);
    if (tipoInfo?.categoria === 'Otros' && !input.descripcion.trim()) {
      return { ok: false, error: 'La descripción es obligatoria para este tipo de incidencia.' };
    }
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

// Asigna, cambia o quita el responsable de una incidencia ya registrada. Mismo control de rol que
// accionEliminarIncidencia: la policy inc_update ya es admin-only en la base, esto solo adelanta
// el rechazo para que el mensaje sea entendible en vez de un UPDATE de cero filas.
export async function accionAsignarResponsableIncidencia(
  id: string,
  responsableId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
    if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
    await actualizarResponsableIncidencia(id, responsableId);
    revalidatePath('/incidencias');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al asignar el responsable' };
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
