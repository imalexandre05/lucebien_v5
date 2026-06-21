'use server';

import { revalidatePath } from 'next/cache';
import { avanzarPasada } from '../../lib/pipeline-repo';

// Avanza una prenda a la etapa destino (formulario del tablero). La RLS decide si el usuario
// puede tocar esa prenda; los puntos van al actor (auth.uid()) dentro de avanzarPasada.
export async function avanzarPrenda(formData: FormData) {
  const id = String(formData.get('id') || '');
  const destino = String(formData.get('destino') || '');
  if (!id || !destino) return;
  await avanzarPasada(id, destino);
  revalidatePath('/pipeline');
}
