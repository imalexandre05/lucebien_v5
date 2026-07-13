'use server';

import { revalidatePath } from 'next/cache';
import { crearEnvioAccesorios, validarEnvioAccesorios } from '../../../lib/accesorios-repo';

export async function crearRemesaAccesorios(p: {
  sedeDestinoCod: string;
  obs: string;
  items: { tipo: string; cantidad: number }[];
}): Promise<string | null> {
  const items = p.items
    .map((i) => ({ tipo: i.tipo.trim(), cantidad: Math.max(0, Math.trunc(i.cantidad)) }))
    .filter((i) => i.tipo && i.cantidad > 0);
  if (!p.sedeDestinoCod) return 'Selecciona la sede destino.';
  if (!items.length) return 'Agrega al menos un accesorio con cantidad.';
  try {
    await crearEnvioAccesorios({ sedeDestinoCod: p.sedeDestinoCod, obs: p.obs.trim() || null, items });
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo registrar el envío.';
  }
  revalidatePath('/pipeline/accesorios');
  return null;
}

export async function confirmarRemesaAccesorios(id: string): Promise<void> {
  if (!id) return;
  await validarEnvioAccesorios(id);
  revalidatePath('/pipeline/accesorios');
}
