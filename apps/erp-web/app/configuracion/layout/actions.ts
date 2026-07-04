'use server';

import { revalidatePath } from 'next/cache';
import { guardarLayout, type ZonaInput } from '../../../lib/layout-repo';
import { listarLayoutZonas } from '../../../lib/reportes-repo';

type R = { ok: boolean; error?: string; n?: number };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

export async function accionGuardarLayout(sede: string, zonas: ZonaInput[]): Promise<R> {
  try {
    const n = await guardarLayout(sede, zonas);
    revalidatePath('/configuracion/layout');
    return { ok: true, n };
  } catch (e) {
    return fallo(e);
  }
}

// Clonar el layout completo de otra sede (REEMPLAZA el actual; el viejo "Clonar de sede").
export async function accionClonarLayout(desde: string, hacia: string): Promise<R> {
  try {
    if (desde === hacia) return { ok: false, error: 'Elige una sede distinta.' };
    const zonas = await listarLayoutZonas(desde);
    if (!zonas.length) return { ok: false, error: `La sede ${desde} no tiene layout.` };
    const n = await guardarLayout(
      hacia,
      zonas.map(({ id: _id, ...z }) => z),
    );
    revalidatePath('/configuracion/layout');
    return { ok: true, n };
  } catch (e) {
    return fallo(e);
  }
}
