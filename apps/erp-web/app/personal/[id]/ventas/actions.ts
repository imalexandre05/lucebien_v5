'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../../lib/auth';
import { guardarVentaSemana } from '../../../../lib/ventas-semana-repo';

/**
 * Guarda una semana de «Ventas y metas». Sólo administrador o dueño: la acción lo vuelve a
 * comprobar aunque la pantalla ya lo esconda (el servidor no confía en el navegador), y la RLS de
 * la tabla es la tercera defensa.
 */
export type ResultadoVentaSemana = { ok: boolean; error?: string };

export async function accionGuardarVentaSemana(p: {
  empleadoId: string;
  desde: string;
  hasta: string;
  totalBoletasMayores: number;
  metaCumplida: boolean | null;
  montoVendido: number | null;
}): Promise<ResultadoVentaSemana> {
  try {
    const sesion = await getSesion();
    const rol = sesion?.usuario.rol;
    if (!sesion || (rol !== 'admin' && rol !== 'dueno')) {
      return { ok: false, error: 'Solo el administrador o el dueño pueden cargar esto.' };
    }
    await guardarVentaSemana(p, sesion.usuario.id);
    revalidatePath(`/personal/${p.empleadoId}/ventas`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la semana. Intenta de nuevo.' };
  }
}
