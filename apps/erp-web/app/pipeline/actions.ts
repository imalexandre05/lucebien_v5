'use server';

import { revalidatePath } from 'next/cache';
import { avanzarPasada, enviarPasada, rechazarPasada } from '../../lib/pipeline-repo';

// Acciones del tablero. Reciben argumentos simples (no FormData) para poder llamarlas desde
// el componente cliente con actualización optimista. La RLS decide qué puede tocar el usuario.

export async function avanzarPrenda(id: string, destino: string) {
  if (!id || !destino) return;
  await avanzarPasada(id, destino);
  revalidatePath('/pipeline');
}

export async function enviarPrenda(id: string, sede: string) {
  if (!id || !sede) return;
  await enviarPasada(id, sede);
  revalidatePath('/pipeline');
}

export async function rechazarPrenda(id: string, destino: string) {
  if (!id || !destino) return;
  await rechazarPasada(id, destino);
  revalidatePath('/pipeline');
}
