'use server';

import { revalidatePath } from 'next/cache';
import {
  avanzarPasada,
  enviarPasada,
  rechazarPasada,
  deshacerPasada,
  avanzarTanda,
  dividirPasada,
  calificarPasada,
  registrarPasada,
} from '../../lib/pipeline-repo';

// Acciones del tablero. Reciben argumentos simples (no FormData) para poder llamarlas desde
// el componente cliente con actualización optimista. La RLS decide qué puede tocar el usuario.

export async function avanzarPrenda(id: string, destino: string): Promise<number> {
  if (!id || !destino) return 0;
  const pts = await avanzarPasada(id, destino);
  revalidatePath('/pipeline');
  return pts;
}

export async function enviarPrenda(id: string, sede: string) {
  if (!id || !sede) return;
  await enviarPasada(id, sede);
  revalidatePath('/pipeline');
}

export async function enviarTandaPrendas(ids: string[], sede: string) {
  if (!ids.length || !sede) return;
  await Promise.all(ids.map((id) => enviarPasada(id, sede)));
  revalidatePath('/pipeline');
}

export async function rechazarPrenda(id: string, destino: string) {
  if (!id || !destino) return;
  await rechazarPasada(id, destino);
  revalidatePath('/pipeline');
}

export async function deshacerPrenda(id: string, etapaAnterior: string) {
  if (!id || !etapaAnterior) return;
  await deshacerPasada(id, etapaAnterior);
  revalidatePath('/pipeline');
}

export async function avanzarTandaPrendas(ids: string[], destino: string): Promise<number> {
  if (!ids.length || !destino) return 0;
  const pts = await avanzarTanda(ids, destino);
  revalidatePath('/pipeline');
  return pts;
}

export async function dividirPrenda(id: string) {
  if (!id) return;
  await dividirPasada(id);
  revalidatePath('/pipeline');
}

export async function calificarPrenda(id: string, aceptada: boolean, destino = '') {
  if (!id) return;
  await calificarPasada(id, aceptada, destino);
  revalidatePath('/pipeline');
}

export async function registrarPrenda(p: {
  codigo: string;
  tipo: string;
  color: string;
  talla: string;
  sedeOrigenCod: string;
  tipoLavado: string;
  necesitaCompostura: boolean;
  obs: string;
}): Promise<string | null> {
  if (!p.codigo.trim() || !p.tipo.trim() || !p.sedeOrigenCod) return 'Código, tipo y sede son obligatorios.';
  try {
    await registrarPasada({
      codigo: p.codigo.trim().toUpperCase(),
      tipo: p.tipo.trim(),
      color: p.color.trim() || null,
      talla: p.talla.trim() || null,
      sedeOrigenCod: p.sedeOrigenCod,
      tipoLavado: p.tipoLavado || null,
      necesitaCompostura: p.necesitaCompostura,
      obsGeneral: p.obs.trim() || null,
    });
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo registrar la prenda.';
  }
  revalidatePath('/pipeline');
  return null;
}
