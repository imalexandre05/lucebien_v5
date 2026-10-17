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

export const accionCrearCandidato = (p: { nombre: string; dni: string; telefono: string; rolCod: string; sedeCod: string }) =>
  p.nombre.trim() ? correr(() => crearCandidato(p)) : Promise.resolve<R>({ ok: false, error: 'Escribe el nombre del candidato.' });
export const accionEntrevistar = (id: string, obs: string) => correr(() => entrevistarCandidato(id, obs));
export const accionIniciarPrueba = (id: string, desde: string) =>
  desde ? correr(() => iniciarPrueba(id, desde)) : Promise.resolve<R>({ ok: false, error: 'Indica el día en que empieza la prueba.' });
export const accionCerrarPrueba = (id: string, resultado: ResultadoPrueba, obs: string) => correr(() => cerrarPrueba(id, resultado, obs));
export const accionRepetirPrueba = (id: string) => correr(() => repetirPrueba(id));
export const accionDescartar = (id: string, motivo: string) => correr(() => descartarCandidato(id, motivo));
export const accionReactivar = (id: string) => correr(() => reactivarCandidato(id));
export const accionVincularCandidato = (id: string, empleadoId: string) => correr(() => vincularCandidato(id, empleadoId));
