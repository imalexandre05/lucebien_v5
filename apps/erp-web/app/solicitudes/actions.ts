'use server';

import { revalidatePath } from 'next/cache';
import { esGestorSolicitudes, puedeConfirmarSolicitud, motivoRechazoValido, type UrgenciaSolicitud } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import {
  crearSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
  entregarSolicitud,
  confirmarSolicitud,
  deshacerSolicitud,
  marcarImpresoSolicitud,
  obtenerSolicitud,
  SolicitudTransicionError,
  SolicitudesNoMigradoError,
  type ItemSolicitudInput,
} from '../../lib/solicitudes-repo';

// Todas las acciones devuelven { ok, error } (convención del proyecto — ver reportes/actions.ts).
// La RPC (migración 0056) es la autoridad real (revalida estado de origen + rol adentro); el
// pre-chequeo de permiso acá solo da un mensaje más rápido/claro sin ida y vuelta al server para
// el caso común de "ese botón no debería ni estar visible para tu rol".
function mensajeError(e: unknown, fallback: string): string {
  if (e instanceof SolicitudesNoMigradoError) return e.message;
  if (e instanceof SolicitudTransicionError) return e.message;
  return e instanceof Error ? e.message : fallback;
}

function revalidarSolicitudes(id?: string) {
  revalidatePath('/solicitudes');
  if (id) revalidatePath(`/solicitudes/${id}/imprimir`);
}

export async function accionCrearSolicitud(input: {
  urgencia: UrgenciaSolicitud;
  obs: string;
  items: ItemSolicitudInput[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    if (!sesion.usuario.sede) return { ok: false, error: 'Tu sesión no tiene una sede activa' };
    if (!input.items.length) return { ok: false, error: 'Agrega al menos un ítem' };
    const id = await crearSolicitud({
      sede: sesion.usuario.sede, // Fase 2: "el dispositivo manda" — nunca un selector en el formulario.
      urgencia: input.urgencia,
      obs: input.obs,
      items: input.items,
    });
    revalidarSolicitudes();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: mensajeError(e, 'No se pudo crear la solicitud') };
  }
}

export async function accionAprobarSolicitud(
  id: string,
  obsRespuesta: string,
  items?: { id: string; cantidadEnviada: number }[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    if (!esGestorSolicitudes(sesion.usuario.rol)) {
      return { ok: false, error: 'Solo admin, dueño o encargado de almacén puede aprobar' };
    }
    await aprobarSolicitud(id, obsRespuesta, items);
    revalidarSolicitudes(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e, 'No se pudo aprobar la solicitud') };
  }
}

export async function accionRechazarSolicitud(id: string, motivo: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    if (!esGestorSolicitudes(sesion.usuario.rol)) {
      return { ok: false, error: 'Solo admin, dueño o encargado de almacén puede rechazar' };
    }
    if (!motivoRechazoValido(motivo)) return { ok: false, error: 'El motivo de rechazo es obligatorio' };
    await rechazarSolicitud(id, motivo);
    revalidarSolicitudes(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e, 'No se pudo rechazar la solicitud') };
  }
}

export async function accionEntregarSolicitud(
  id: string,
  recibeEnTienda: string,
  codigosPrenda?: Record<string, string[]>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    if (!esGestorSolicitudes(sesion.usuario.rol)) {
      return { ok: false, error: 'Solo admin, dueño o encargado de almacén puede registrar la entrega' };
    }
    if (!recibeEnTienda.trim()) return { ok: false, error: 'Indica quién recibe en la tienda' };
    await entregarSolicitud(id, recibeEnTienda, codigosPrenda);
    revalidarSolicitudes(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e, 'No se pudo registrar la entrega') };
  }
}

export async function accionConfirmarSolicitud(
  id: string,
  items?: { id: string; cantidadRecibida: number; obsRecepcion?: string }[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    const solicitud = await obtenerSolicitud(id);
    if (!solicitud) return { ok: false, error: 'Solicitud no encontrada' };
    if (!puedeConfirmarSolicitud(sesion.usuario.rol, sesion.usuario.sede, solicitud.sedeCod)) {
      return { ok: false, error: 'Solo la tienda que solicitó puede confirmar la recepción' };
    }
    await confirmarSolicitud(id, items);
    revalidarSolicitudes(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e, 'No se pudo confirmar la recepción') };
  }
}

export async function accionDeshacerSolicitud(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sesion = await getSesion();
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    // Sin pre-chequeo de rol acá a propósito: la autoridad depende del estado ACTUAL de la
    // solicitud (deshacer confirmar ≠ deshacer aprobar), y ya la resuelve solicitud_deshacer
    // (migración 0056) con el mismo criterio que puedeDeshacerSolicitud en @scilb/core.
    await deshacerSolicitud(id);
    revalidarSolicitudes(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e, 'No se pudo deshacer') };
  }
}

export async function accionMarcarImpreso(id: string, tipo: 'pedido' | 'confirmacion'): Promise<{ ok: boolean; error?: string }> {
  try {
    await marcarImpresoSolicitud(id, tipo);
    revalidarSolicitudes(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e, 'No se pudo marcar como impreso') };
  }
}
