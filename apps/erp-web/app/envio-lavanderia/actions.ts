'use server';

import { revalidatePath } from 'next/cache';
import {
  listarListasLavanderia,
  enviarLavanderia,
  validarRetornoLavanderia,
  type ItemEnvio,
  type GeneralesEnvio,
  type ListaLavanderia,
} from '../../lib/lavanderia-repo';
import { operadorParaAccion } from '../../lib/pipeline-operador';

export async function accionListarListas(): Promise<ListaLavanderia[]> {
  return listarListasLavanderia();
}

export async function accionEnviarLavanderia(p: {
  sede: string;
  tipo: 'LAV' | 'REF';
  respInv: string;
  respTraslado: string;
  generales: GeneralesEnvio;
  items: ItemEnvio[];
}, operador?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  // UNA LISTA NECESITA AL MENOS UNA PRENDA CON CÓDIGO (decisión de Alexander, 21-ago-2026).
  // Antes bastaba con accesorios a granel. El código es lo que después permite seguir y reclamar
  // una prenda: un envío sin ninguno no se puede rastrear, y los accesorios de esa lista tampoco.
  // Anotado en docs/pendientes-negocio.md.
  if (!p.items.length) {
    return { ok: false, error: 'La lista necesita al menos una prenda con su código.' };
  }
  try {
    const id = await enviarLavanderia(p, await operadorParaAccion(operador));
    revalidatePath('/envio-lavanderia');
    revalidatePath('/pipeline');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al enviar la lista' };
  }
}

export async function accionValidarRetorno(p: {
  id: string;
  items: { id: string; estado: 'bien' | 'problema' }[];
  obsRetorno: string;
}, operador?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await validarRetornoLavanderia(p, await operadorParaAccion(operador));
    revalidatePath('/envio-lavanderia');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al validar el retorno' };
  }
}
