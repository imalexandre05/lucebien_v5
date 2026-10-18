'use server';

import { revalidatePath } from 'next/cache';
import {
  avanzarPasada,
  enviarPasada,
  rechazarPasada,
  deshacerPasada,
  avanzarTandaResultado,
  deshacerTandaPasadas,
  type ResultadoTanda,
  dividirPasada,
  deshacerDivisionPasada,
  calificarPasada,
  registrarPasada,
  validarCodigoOperador,
  cerrarOperadorCodigo,
  type ValidacionCodigo,
} from '../../lib/pipeline-repo';
import { deviceIdActual, operadorParaAccion } from '../../lib/pipeline-operador';

// Acciones del tablero. Reciben argumentos simples (no FormData) para poder llamarlas desde
// el componente cliente con actualización optimista. Qué puede tocar el usuario lo deciden las RPC del pipeline (desde la 0122 la tabla no se escribe directo).
//
// Código personal (spec codigo-personal): cada acción de atribución recibe, al final, el token de
// operador que el chip del tablero obtuvo de `validarCodigo`. En un equipo compartido sin token la
// acción se rechaza aquí; en uno no compartido el token se ignora (`operadorParaAccion`).

// Única puerta del código: usuario + PIN los valida la base, que cuenta los intentos y emite el
// token. El PIN no se guarda ni se registra en ningún otro lado.
export async function validarCodigo(usuario: string, pin: string): Promise<ValidacionCodigo> {
  const u = (usuario ?? '').trim();
  const p = (pin ?? '').trim();
  if (!u || !p) return { ok: false };
  return validarCodigoOperador(u, p, (await deviceIdActual()) || null);
}

// Los errores `CODIGO:` (token vencido, ajeno o ausente) se devuelven COMO VALOR (string), no como
// excepción: Next oculta el mensaje de las excepciones en producción y la pantalla no podría saber
// que tiene que volver a pedir el código. Cualquier otro error sigue lanzándose.
async function conCodigo<T>(fn: () => Promise<T>): Promise<T | string> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('CODIGO:')) return e.message;
    throw e;
  }
}

export async function avanzarPrenda(id: string, destino: string, operador?: string): Promise<number | string> {
  if (!id || !destino) return 0;
  const r = await conCodigo(async () => avanzarPasada(id, destino, await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return r;
}

export async function enviarPrenda(id: string, sede: string, operador?: string): Promise<string | null> {
  if (!id || !sede) return null;
  const r = await conCodigo(async () => enviarPasada(id, sede, await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return null;
}

export async function enviarTandaPrendas(ids: string[], sede: string, operador?: string): Promise<string | null> {
  if (!ids.length || !sede) return null;
  const r = await conCodigo(async () => {
    const token = await operadorParaAccion(operador);
    await Promise.all(ids.map((id) => enviarPasada(id, sede, token)));
  });
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return null;
}

export async function rechazarPrenda(id: string, destino: string, operador?: string): Promise<string | null> {
  if (!id || !destino) return null;
  const r = await conCodigo(async () => rechazarPasada(id, destino, await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return null;
}

export async function deshacerPrenda(id: string, etapaAnterior: string, operador?: string): Promise<string | null> {
  if (!id || !etapaAnterior) return null;
  const r = await conCodigo(async () => deshacerPasada(id, etapaAnterior, await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return null;
}

export async function avanzarTandaPrendas(
  ids: string[],
  destino: string,
  operador?: string,
): Promise<ResultadoTanda | string> {
  if (!ids.length || !destino) return { puntos: 0, movidas: 0, omitidas: 0, idsMovidos: [] };
  const r = await conCodigo(async () => avanzarTandaResultado(ids, destino, await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return r;
}

// «Deshacer» de una tanda (0155): todo o nada. Devuelve el error como valor si es CODIGO:.
export async function deshacerTandaPrendas(
  items: { id: string; etapaAnterior: string }[],
  operador?: string,
): Promise<string | null> {
  if (!items.length) return null;
  const r = await conCodigo(async () => deshacerTandaPasadas(items, await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return null;
}

export async function dividirPrenda(id: string, operador?: string): Promise<string | null> {
  if (!id) return null;
  const r = await conCodigo(async () => dividirPasada(id, await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return null;
}

// «cambiar» en el chip del operador: revoca el token en la base. Mejor esfuerzo: si falla, el token
// igual vence solo por inactividad o por su vida máxima.
export async function cerrarOperador(token: string): Promise<void> {
  if (!token) return;
  try {
    await cerrarOperadorCodigo(token);
  } catch {
    /* el token expira solo */
  }
}

// Tarea 6: `id` es el id de la MADRE dividida (no el de una hija — el tablero lo resuelve desde
// dividida_en, ver madrePorHijo en tablero.tsx). Devuelve un mensaje de error legible cuando el
// RPC rechaza (p. ej. una hija ya avanzó de etapa) en vez de reventar sin explicación.
export async function deshacerDivisionPrenda(id: string, operador?: string): Promise<string | null> {
  if (!id) return 'Falta el id de la prenda dividida.';
  try {
    const r = await conCodigo(async () => deshacerDivisionPasada(id, await operadorParaAccion(operador)));
    if (typeof r === 'string') return r;
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo deshacer la división.';
  }
  revalidatePath('/pipeline');
  return null;
}

export async function calificarPrenda(
  id: string,
  aceptada: boolean,
  destino = '',
  operador?: string,
): Promise<string | null> {
  if (!id) return null;
  const r = await conCodigo(async () => calificarPasada(id, aceptada, destino, '', await operadorParaAccion(operador)));
  if (typeof r === 'string') return r;
  revalidatePath('/pipeline');
  return null;
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
}, operador?: string): Promise<string | null> {
  if (!p.codigo.trim() || !p.tipo.trim() || !p.sedeOrigenCod) return 'Código, tipo y sede son obligatorios.';
  try {
    const token = await operadorParaAccion(operador);
    await registrarPasada({
      codigo: p.codigo.trim().toUpperCase(),
      tipo: p.tipo.trim(),
      color: p.color.trim() || null,
      talla: p.talla.trim() || null,
      sedeOrigenCod: p.sedeOrigenCod,
      tipoLavado: p.tipoLavado || null,
      necesitaCompostura: p.necesitaCompostura,
      obsGeneral: p.obs.trim() || null,
    }, token);
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo registrar la prenda.';
  }
  revalidatePath('/pipeline');
  return null;
}
