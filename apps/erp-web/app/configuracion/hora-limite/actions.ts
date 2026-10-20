'use server';

import { revalidatePath } from 'next/cache';
import { guardarHoraLimite, type TurnoHora } from '../../../lib/hora-limite-repo';

export type CambioHora = { sede: string; turno: TurnoHora; hora: string };

export async function accionGuardarHoras(cambios: CambioHora[]): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const c of cambios) await guardarHoraLimite(c.sede, c.turno, c.hora.trim());
    revalidatePath('/configuracion/hora-limite');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar' };
  }
}
