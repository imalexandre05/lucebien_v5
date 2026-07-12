'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { generarAlertas, marcarLeida, marcarTodasLeidas } from '../../lib/notificaciones-repo';

export async function generarAlertasAction(): Promise<{ creadas: number; error?: string }> {
  const sesion = await getSesion();
  if (!sesion) return { creadas: 0, error: 'No autenticado.' };
  if (sesion.usuario.rol !== 'admin' && sesion.usuario.rol !== 'dueno') {
    return { creadas: 0, error: 'Solo un administrador puede generar alertas.' };
  }
  try {
    const creadas = await generarAlertas();
    revalidatePath('/notificaciones');
    revalidatePath('/', 'layout');
    return { creadas };
  } catch (e) {
    return { creadas: 0, error: e instanceof Error ? e.message : 'No se pudieron generar las alertas.' };
  }
}

export async function marcarLeidaAction(id: string): Promise<void> {
  if (!id) return;
  await marcarLeida(id);
  revalidatePath('/notificaciones');
  revalidatePath('/', 'layout');
}

export async function marcarTodasLeidasAction(): Promise<void> {
  await marcarTodasLeidas();
  revalidatePath('/notificaciones');
  revalidatePath('/', 'layout');
}
