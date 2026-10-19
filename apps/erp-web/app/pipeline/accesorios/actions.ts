'use server';

import { revalidatePath } from 'next/cache';
import { crearEnvioAccesorios, validarEnvioAccesorios } from '../../../lib/accesorios-repo';
import { operadorParaAccion } from '../../../lib/pipeline-operador';

// Los errores `CODIGO:` y `TRANSICION:` se devuelven como texto: Next oculta el mensaje de las excepciones.
const esAviso = (m: string) => m.startsWith('CODIGO:') || m.startsWith('TRANSICION:');
const limpio = (m: string) => m.replace(/^(CODIGO|TRANSICION): ?/, '');

export async function crearRemesaAccesorios(p: {
  sedeDestinoCod: string;
  obs: string;
  items: { tipo: string; cantidad: number }[];
}, operador?: string): Promise<string | null> {
  const items = p.items
    .map((i) => ({ tipo: i.tipo.trim(), cantidad: Math.max(0, Math.trunc(i.cantidad)) }))
    .filter((i) => i.tipo && i.cantidad > 0);
  if (!p.sedeDestinoCod) return 'Selecciona la sede destino.';
  if (!items.length) return 'Agrega al menos un accesorio con cantidad.';
  try {
    await crearEnvioAccesorios({ sedeDestinoCod: p.sedeDestinoCod, obs: p.obs.trim() || null, items }, await operadorParaAccion(operador));
  } catch (e) {
    if (e instanceof Error) return esAviso(e.message) ? limpio(e.message) : e.message;
    return 'No se pudo registrar el envío.';
  }
  revalidatePath('/pipeline/accesorios');
  return null;
}

export async function confirmarRemesaAccesorios(id: string, operador?: string): Promise<string | null> {
  if (!id) return null;
  try {
    await validarEnvioAccesorios(id, await operadorParaAccion(operador));
  } catch (e) {
    if (e instanceof Error && esAviso(e.message)) return limpio(e.message);
    throw e;
  }
  revalidatePath('/pipeline/accesorios');
  return null;
}
