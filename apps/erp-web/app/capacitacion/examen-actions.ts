'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import {
  calificarPresencial, guardarHabilidad, guardarPregunta, iniciarExamen, responderExamen,
  type ExamenIniciado, type Pregunta, type ResultadoExamen, type TipoExamen,
} from '../../lib/capacitacion-repo';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// La base (RPC security definer) decide quién puede qué; acá solo se exige sesión y se devuelve el
// mensaje de la base, que ya dice qué hacer.
async function conSesion<T extends object>(f: () => Promise<T>): Promise<R<T>> {
  try {
    if (!(await getSesion())) return { ok: false, error: 'Tu sesión venció. Vuelve a ingresar.' };
    const r = await f();
    revalidatePath('/capacitacion', 'layout');
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo completar la acción' };
  }
}

export async function accionIniciarExamen(cap: string, tipo: TipoExamen): Promise<R<{ examen: ExamenIniciado }>> {
  return conSesion(async () => ({ examen: await iniciarExamen(cap, tipo) }));
}
export async function accionResponderExamen(intento: string, respuestas: Record<string, number>): Promise<R<{ resultado: ResultadoExamen }>> {
  return conSesion(async () => ({ resultado: await responderExamen(intento, respuestas) }));
}
export async function accionGuardarPregunta(p: Omit<Pregunta, 'id'> & { id: string | null }) {
  return conSesion(async () => { await guardarPregunta(p); return {}; });
}
export async function accionGuardarHabilidad(id: string | null, nombre: string, orden: number, activo: boolean) {
  return conSesion(async () => { await guardarHabilidad(id, nombre, orden, activo); return {}; });
}
export async function accionCalificarPresencial(cap: string, notas: { habilidad: string; nota: number }[]) {
  return conSesion(async () => { await calificarPresencial(cap, notas); return {}; });
}
