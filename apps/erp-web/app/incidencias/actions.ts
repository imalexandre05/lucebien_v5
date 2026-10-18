'use server';

import { revalidatePath } from 'next/cache';
import { puede, type MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { resolverIncidencia } from '../../lib/incidencias-catalogo';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { actualizarResponsableIncidencia, crearIncidencia, eliminarIncidencia, listarTiposIncidencia, responsableIncidenciaValido } from '../../lib/incidencias-repo';

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
    // El permiso se comprueba acá, no solo en la pantalla: una Server Action es un endpoint público.
    let matriz: MatrizPermisos = {};
    try {
      matriz = await leerMatrizPermisos();
    } catch {
      matriz = {};
    }
    if (!puede(matriz, sesion.usuario.rol, 'incidencias', 'crear', sesion.usuario.rolCod)) {
      return { ok: false, error: 'No tienes permiso para registrar incidencias.' };
    }
    if (!input.tipo) return { ok: false, error: 'Elige un tipo' };
    // C-2 (spec 2026-08-25-incidencias-alcance-y-formulario-design.md §3): la descripción es
    // obligatoria sólo para el tipo de categoría 'Otros'. El formulario ya deshabilita el botón
    // en ese caso; esto es lo que de verdad lo exige — el cliente puede saltearse un `disabled`.
    const tipos = await listarTiposIncidencia();
    const tipoInfo = tipos.find((t) => t.tipo === input.tipo);
    if (tipoInfo?.categoria === 'Otros' && !input.descripcion.trim()) {
      return { ok: false, error: 'La descripción es obligatoria para este tipo de incidencia.' };
    }
    // Nivel y puntos salen del catálogo; lo que mande el navegador en `puntosPenalidad` se ignora.
    const res = resolverIncidencia(tipos, input.tipo, input.nivel);
    if (!res.ok) return { ok: false, error: res.error };
    if (input.responsableId) {
      if (!(await responsableIncidenciaValido(input.responsableId, sesion.usuario.sede))) {
        return { ok: false, error: 'El responsable debe ser una persona activa de esta sede.' };
      }
    }
    await crearIncidencia({
      sede: sesion.usuario.sede,
      fecha: fechaPeru(),
      tipo: input.tipo,
      descripcion: input.descripcion,
      nivel: res.nivel,
      responsableId: input.responsableId,
      reportadoPorId: sesion.usuario.id,
      puntosPenalidad: res.puntosPenalidad,
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
