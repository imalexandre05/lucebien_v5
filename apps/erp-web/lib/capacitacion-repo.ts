import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';
import type { EstadoItem } from '@scilb/core';

// Acceso a datos de la capacitación (migración 0131). Las lecturas pasan por RLS: el administrador
// ve todo, el capacitador las que dicta y el nuevo la suya. Toda escritura es una RPC.

export type ItemChecklist = { id: string; nombre: string; orden: number; activo: boolean };
export type Examen = { id: string; nombre: string; nota: number; fecha: string };
export type Avance = { itemId: string; estado: EstadoItem; obs: string | null };
export type Capacitacion = {
  id: string;
  nuevoId: string;
  nuevoNombre: string;
  capacitadorId: string;
  capacitadorNombre: string;
  inicio: string;
  estado: 'en_curso' | 'completada' | 'cancelada';
  resultado: 'aprobada' | 'por_reforzar' | null;
  cierre: string | null;
  avances: Avance[];
  examenes: Examen[];
};

type CapRow = {
  id: string; nuevo_id: string; capacitador_id: string; inicio: string;
  estado: Capacitacion['estado']; resultado: Capacitacion['resultado']; cierre: string | null;
};

export async function listarItems(): Promise<ItemChecklist[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('capacitacion_items').select('id, nombre, orden, activo').order('orden').order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemChecklist[];
}

export async function notaAprobatoria(): Promise<number> {
  const sb = getServerClient();
  const { data } = await sb.from('config').select('valor').eq('clave', 'capacitacion_nota_aprobatoria').maybeSingle();
  const n = Number(data?.valor);
  return Number.isFinite(n) && n >= 0 ? n : 14; // mismo criterio que la RPC de cierre (acepta 0)
}

export async function listarCapacitaciones(): Promise<Capacitacion[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('capacitaciones')
    .select('id, nuevo_id, capacitador_id, inicio, estado, resultado, cierre')
    .order('inicio', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CapRow[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [av, ex, nombres] = await Promise.all([
    sb.from('capacitacion_avances').select('capacitacion_id, item_id, estado, obs').in('capacitacion_id', ids),
    sb.from('capacitacion_examenes').select('id, capacitacion_id, nombre, nota, fecha').in('capacitacion_id', ids).order('fecha'),
    mapaNombres(),
  ]);
  if (av.error) throw new Error(av.error.message);
  if (ex.error) throw new Error(ex.error.message);
  return rows.map((r) => ({
    id: r.id,
    nuevoId: r.nuevo_id,
    nuevoNombre: nombres.get(r.nuevo_id) ?? '—',
    capacitadorId: r.capacitador_id,
    capacitadorNombre: nombres.get(r.capacitador_id) ?? '—',
    inicio: r.inicio,
    estado: r.estado,
    resultado: r.resultado,
    cierre: r.cierre,
    avances: (av.data ?? [])
      .filter((a) => a.capacitacion_id === r.id)
      .map((a) => ({ itemId: a.item_id as string, estado: a.estado as EstadoItem, obs: (a.obs as string | null) ?? null })),
    examenes: (ex.data ?? [])
      .filter((e) => e.capacitacion_id === r.id)
      .map((e) => ({ id: e.id as string, nombre: e.nombre as string, nota: Number(e.nota), fecha: e.fecha as string })),
  }));
}

async function rpc(nombre: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getServerClient().rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data;
}

export const iniciarCapacitacion = (nuevo: string, capacitador: string) =>
  rpc('capacitacion_iniciar', { p_nuevo: nuevo, p_capacitador: capacitador }) as Promise<string>;
export const marcarItem = (cap: string, item: string, estado: EstadoItem, obs: string | null) =>
  rpc('capacitacion_marcar', { p_cap: cap, p_item: item, p_estado: estado, p_obs: obs });
export const registrarExamen = (cap: string, nombre: string, nota: number) =>
  rpc('capacitacion_examen', { p_cap: cap, p_nombre: nombre, p_nota: nota });
export const cerrarCapacitacion = (cap: string) => rpc('capacitacion_cerrar', { p_cap: cap }) as Promise<string>;
export const cancelarCapacitacion = (cap: string) => rpc('capacitacion_cancelar', { p_cap: cap });
export const guardarItem = (id: string | null, nombre: string, orden: number, activo: boolean) =>
  rpc('capacitacion_item_guardar', { p_id: id, p_nombre: nombre, p_orden: orden, p_activo: activo });

// ── Exámenes (migración 0138) ────────────────────────────────────────────────────────────────
// El banco (con la clave) solo lo lee el administrador por RLS. Quien rinde recibe las preguntas
// sin clave de `examen_iniciar`. Toda escritura es una RPC.

export type TipoExamen = 'software' | 'escrito';
export type Pregunta = { id: string; tipo: TipoExamen; tema: string; enunciado: string; opciones: string[]; correcta: number; activa: boolean };
export type Habilidad = { id: string; nombre: string; orden: number; activo: boolean };
export type IntentoExamen = { id: string; tipo: TipoExamen; nota: number | null; estado: 'en_curso' | 'calificado'; creadoEn: string };
export type PreguntaExamen = { id: string; enunciado: string; opciones: string[] };
export type ExamenIniciado = { intentoId: string; tipo: TipoExamen; preguntas: PreguntaExamen[] };
export type ResultadoExamen = { nota: number; aciertos: number; total: number };

export async function listarPreguntas(): Promise<Pregunta[]> {
  const { data, error } = await getServerClient()
    .from('examen_preguntas').select('id, tipo, tema, enunciado, opciones, correcta, activa').order('tipo').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Pregunta[];
}

export async function listarHabilidades(): Promise<Habilidad[]> {
  const { data, error } = await getServerClient().from('examen_habilidades').select('id, nombre, orden, activo').order('orden').order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as Habilidad[];
}

export async function listarIntentos(capId: string): Promise<IntentoExamen[]> {
  const { data, error } = await getServerClient()
    .from('examen_intentos').select('id, tipo, nota, estado, creado_en').eq('capacitacion_id', capId).order('creado_en', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string, tipo: r.tipo as TipoExamen, nota: r.nota === null ? null : Number(r.nota),
    estado: r.estado as IntentoExamen['estado'], creadoEn: r.creado_en as string,
  }));
}

export async function listarNotasPresencial(capId: string): Promise<Record<string, number>> {
  const { data, error } = await getServerClient().from('examen_presencial_notas').select('habilidad_id, nota').eq('capacitacion_id', capId);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.habilidad_id as string, Number(r.nota)]));
}

export async function iniciarExamen(cap: string, tipo: TipoExamen): Promise<ExamenIniciado> {
  const j = (await rpc('examen_iniciar', { p_cap: cap, p_tipo: tipo })) as { intento_id: string; tipo: TipoExamen; preguntas: PreguntaExamen[] };
  return { intentoId: j.intento_id, tipo: j.tipo, preguntas: j.preguntas };
}
export const responderExamen = (intento: string, respuestas: Record<string, number>) =>
  rpc('examen_responder', { p_intento: intento, p_respuestas: respuestas }) as Promise<ResultadoExamen>;
export const guardarPregunta = (p: Omit<Pregunta, 'id'> & { id: string | null }) =>
  rpc('examen_pregunta_guardar', { p_id: p.id, p_tipo: p.tipo, p_tema: p.tema, p_enunciado: p.enunciado, p_opciones: p.opciones, p_correcta: p.correcta, p_activa: p.activa });
export const guardarHabilidad = (id: string | null, nombre: string, orden: number, activo: boolean) =>
  rpc('examen_habilidad_guardar', { p_id: id, p_nombre: nombre, p_orden: orden, p_activo: activo });
export const calificarPresencial = (cap: string, notas: { habilidad: string; nota: number }[]) =>
  rpc('examen_presencial_calificar', { p_cap: cap, p_notas: notas });
