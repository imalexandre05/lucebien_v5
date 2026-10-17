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
