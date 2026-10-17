import type { EstadoCandidato, ResultadoPrueba } from '@scilb/core';
import { getServerClient } from './supabase/server';

// Candidatos (ticket 14, migración 0134). Lectura por RLS (sólo admin/dueño); toda escritura va
// por RPC que valida la transición. Nunca un update plano.

export type Candidato = {
  id: string;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  rolCod: string | null;
  sedeCod: string | null;
  estado: EstadoCandidato;
  entrevistaFecha: string | null;
  entrevistaObs: string | null;
  pruebaDesde: string | null;
  pruebaHasta: string | null;
  resultado: ResultadoPrueba | null;
  resultadoObs: string | null;
  empleadoId: string | null;
};

const COLUMNAS =
  'id, nombre, dni, telefono, rol_cod, sede_cod, estado, entrevista_fecha, entrevista_obs, prueba_desde, prueba_hasta, resultado, resultado_obs, empleado_id';

function mapear(r: Record<string, unknown>): Candidato {
  const s = (k: string) => (r[k] === null || r[k] === undefined ? null : String(r[k]));
  return {
    id: String(r.id),
    nombre: String(r.nombre),
    dni: s('dni'),
    telefono: s('telefono'),
    rolCod: s('rol_cod'),
    sedeCod: s('sede_cod'),
    estado: r.estado as EstadoCandidato,
    entrevistaFecha: s('entrevista_fecha'),
    entrevistaObs: s('entrevista_obs'),
    pruebaDesde: s('prueba_desde'),
    pruebaHasta: s('prueba_hasta'),
    resultado: s('resultado') as ResultadoPrueba | null,
    resultadoObs: s('resultado_obs'),
    empleadoId: s('empleado_id'),
  };
}

export async function listarCandidatos(): Promise<Candidato[]> {
  const { data, error } = await getServerClient().from('candidatos').select(COLUMNAS).order('creado_en', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(mapear);
}

export async function leerCandidato(id: string): Promise<Candidato | null> {
  const { data, error } = await getServerClient().from('candidatos').select(COLUMNAS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapear(data as Record<string, unknown>) : null;
}

async function rpc(nombre: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getServerClient().rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data;
}

export const crearCandidato = (p: { nombre: string; dni: string; telefono: string; rolCod: string; sedeCod: string }) =>
  rpc('candidato_crear', { p_nombre: p.nombre, p_dni: p.dni, p_telefono: p.telefono, p_rol: p.rolCod, p_sede: p.sedeCod });
export const entrevistarCandidato = (id: string, obs: string) => rpc('candidato_entrevistar', { p_id: id, p_obs: obs });
export const iniciarPrueba = (id: string, desde: string) => rpc('candidato_iniciar_prueba', { p_id: id, p_desde: desde });
export const cerrarPrueba = (id: string, resultado: ResultadoPrueba, obs: string) =>
  rpc('candidato_cerrar_prueba', { p_id: id, p_resultado: resultado, p_obs: obs });
export const repetirPrueba = (id: string) => rpc('candidato_repetir_prueba', { p_id: id });
export const descartarCandidato = (id: string, motivo: string) => rpc('candidato_descartar', { p_id: id, p_motivo: motivo });
export const reactivarCandidato = (id: string) => rpc('candidato_reactivar', { p_id: id });
export const vincularCandidato = (id: string, empleadoId: string) => rpc('candidato_vincular', { p_id: id, p_empleado: empleadoId });
