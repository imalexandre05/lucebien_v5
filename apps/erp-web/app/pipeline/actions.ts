'use server';

import { revalidatePath } from 'next/cache';
import { avanzarPasada, enviarPasada, rechazarPasada } from '../../lib/pipeline-repo';

// Avanza una prenda a la etapa destino (formulario del tablero). La RLS decide si el usuario
// puede tocar esa prenda; los puntos van al actor (auth.uid()) dentro de avanzarPasada.
export async function avanzarPrenda(formData: FormData) {
  const id = String(formData.get('id') || '');
  const destino = String(formData.get('destino') || '');
  if (!id || !destino) return;
  await avanzarPasada(id, destino);
  revalidatePath('/pipeline');
}

// Envía una prenda "listo" a la tienda elegida (crea el envío + marca enviada).
export async function enviarPrenda(formData: FormData) {
  const id = String(formData.get('id') || '');
  const sede = String(formData.get('sede') || '');
  if (!id || !sede) return;
  await enviarPasada(id, sede);
  revalidatePath('/pipeline');
}

// Rechaza una prenda a una etapa anterior y descuenta los puntos a quien la hizo.
export async function rechazarPrenda(formData: FormData) {
  const id = String(formData.get('id') || '');
  const destino = String(formData.get('destino') || '');
  if (!id || !destino) return;
  await rechazarPasada(id, destino);
  revalidatePath('/pipeline');
}
