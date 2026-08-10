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
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!p.items.length && Object.values(p.generales).every((v) => v === 0)) {
    return { ok: false, error: 'La lista está vacía: agrega prendas o accesorios.' };
  }
  try {
    const id = await enviarLavanderia(p);
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
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await validarRetornoLavanderia(p);
    revalidatePath('/envio-lavanderia');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al validar el retorno' };
  }
}
