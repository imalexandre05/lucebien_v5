'use server';

import { revalidatePath } from 'next/cache';
import {
  avanzarPasada,
  enviarPasada,
  rechazarPasada,
  deshacerPasada,
  avanzarTanda,
  dividirPasada,
  deshacerDivisionPasada,
  calificarPasada,
  registrarPasada,
  validarCodigoOperador,
  type ValidacionCodigo,
} from '../../lib/pipeline-repo';
import { deviceIdActual, operadorParaAccion } from '../../lib/pipeline-operador';

// Acciones del tablero. Reciben argumentos simples (no FormData) para poder llamarlas desde
// el componente cliente con actualización optimista. La RLS decide qué puede tocar el usuario.
//
// Código personal (spec codigo-personal): cada acción de atribución recibe, al final, el token de
// operador que el chip del tablero obtuvo de `validarCodigo`. En un equipo compartido sin token la
// acción se rechaza aquí; en uno no compartido el token se ignora (`operadorParaAccion`).

// Única puerta del código: lo valida la base, que cuenta los intentos y emite el token. El código
// no se guarda ni se registra en ningún otro lado.
export async function validarCodigo(codigo: string): Promise<ValidacionCodigo> {
  const limpio = (codigo ?? '').trim();
  if (!limpio) return { ok: false };
  return validarCodigoOperador(limpio, deviceIdActual() || null);
}

export async function avanzarPrenda(id: string, destino: string, operador?: string): Promise<number> {
  if (!id || !destino) return 0;
  const pts = await avanzarPasada(id, destino, await operadorParaAccion(operador));
  revalidatePath('/pipeline');
  return pts;
}

export async function enviarPrenda(id: string, sede: string, operador?: string) {
  if (!id || !sede) return;
  await enviarPasada(id, sede, await operadorParaAccion(operador));
  revalidatePath('/pipeline');
}

export async function enviarTandaPrendas(ids: string[], sede: string, operador?: string) {
  if (!ids.length || !sede) return;
  const token = await operadorParaAccion(operador);
  await Promise.all(ids.map((id) => enviarPasada(id, sede, token)));
  revalidatePath('/pipeline');
}

export async function rechazarPrenda(id: string, destino: string, operador?: string) {
  if (!id || !destino) return;
  await rechazarPasada(id, destino, await operadorParaAccion(operador));
  revalidatePath('/pipeline');
}

export async function deshacerPrenda(id: string, etapaAnterior: string, operador?: string) {
  if (!id || !etapaAnterior) return;
  await deshacerPasada(id, etapaAnterior, await operadorParaAccion(operador));
  revalidatePath('/pipeline');
}

export async function avanzarTandaPrendas(ids: string[], destino: string, operador?: string): Promise<number> {
  if (!ids.length || !destino) return 0;
  const pts = await avanzarTanda(ids, destino, await operadorParaAccion(operador));
  revalidatePath('/pipeline');
  return pts;
}

export async function dividirPrenda(id: string, operador?: string) {
  if (!id) return;
  await dividirPasada(id, await operadorParaAccion(operador));
  revalidatePath('/pipeline');
}

// Tarea 6: `id` es el id de la MADRE dividida (no el de una hija — el tablero lo resuelve desde
// dividida_en, ver madrePorHijo en tablero.tsx). Devuelve un mensaje de error legible cuando el
// RPC rechaza (p. ej. una hija ya avanzó de etapa) en vez de reventar sin explicación.
export async function deshacerDivisionPrenda(id: string, operador?: string): Promise<string | null> {
  if (!id) return 'Falta el id de la prenda dividida.';
  try {
    await deshacerDivisionPasada(id, await operadorParaAccion(operador));
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo deshacer la división.';
  }
  revalidatePath('/pipeline');
  return null;
}

export async function calificarPrenda(id: string, aceptada: boolean, destino = '', operador?: string) {
  if (!id) return;
  await calificarPasada(id, aceptada, destino, '', await operadorParaAccion(operador));
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
