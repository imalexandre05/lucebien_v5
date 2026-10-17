'use server';

import { revalidatePath } from 'next/cache';
import type { ResultadoPrueba } from '@scilb/core';
import {
  cerrarPrueba,
  crearCandidato,
  descartarCandidato,
  entrevistarCandidato,
  iniciarPrueba,
  reactivarCandidato,
  repetirPrueba,
  vincularCandidato,
} from '../../../lib/candidatos-repo';

type R = { ok: boolean; error?: string };

async function correr(f: () => Promise<unknown>): Promise<R> {
  try {
    await f();
    revalidatePath('/personal/candidatos');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function accionCrearCandidato(p: { nombre: string; dni: string; telefono: string; rolCod: string; sedeCod: string }): Promise<R> {
  if (!p.nombre.trim()) return { ok: false, error: 'Escribe el nombre del candidato.' };
  return correr(() => crearCandidato(p));
}
export async function accionEntrevistar(id: string, obs: string): Promise<R> {
  return correr(() => entrevistarCandidato(id, obs));
}
export async function accionIniciarPrueba(id: string, desde: string): Promise<R> {
  if (!desde) return { ok: false, error: 'Indica el día en que empieza la prueba.' };
  return correr(() => iniciarPrueba(id, desde));
}
export async function accionCerrarPrueba(id: string, resultado: ResultadoPrueba, obs: string): Promise<R> {
  return correr(() => cerrarPrueba(id, resultado, obs));
}
export async function accionRepetirPrueba(id: string): Promise<R> {
  return correr(() => repetirPrueba(id));
}
export async function accionDescartar(id: string, motivo: string): Promise<R> {
  return correr(() => descartarCandidato(id, motivo));
}
export async function accionReactivar(id: string): Promise<R> {
  return correr(() => reactivarCandidato(id));
}
export async function accionVincularCandidato(id: string, empleadoId: string): Promise<R> {
  return correr(() => vincularCandidato(id, empleadoId));
}
