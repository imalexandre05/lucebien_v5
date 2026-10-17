import type { Temporada } from '@scilb/core';
import { getServerClient } from './supabase/server';

// Temporadas (ticket 15, migración 0133). Lectura por RLS; escritura sólo por RPC de administrador.
// Sin temporadas el motor usa los valores normales: si la tabla no se puede leer, devolvemos [].

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function listarTemporadas(): Promise<Temporada[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('temporadas')
    .select('id, nombre, desde, hasta, pago_por_hora, meta_semanal, meta_por_hora')
    .order('desde');
  // Tabla aún sin migrar (0133 pendiente de aplicar): sin temporadas, como si no existieran.
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return [];
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    desde: String(r.desde),
    hasta: String(r.hasta),
    pagoPorHora: num(r.pago_por_hora),
    metaSemanal: num(r.meta_semanal),
    metaPorHora: num(r.meta_por_hora),
  }));
}

export async function guardarTemporada(t: Temporada): Promise<void> {
  const { error } = await getServerClient().rpc('temporada_guardar', {
    p_id: t.id ?? null,
    p_nombre: t.nombre,
    p_desde: t.desde,
    p_hasta: t.hasta,
    p_pago_por_hora: t.pagoPorHora,
    p_meta_semanal: t.metaSemanal,
    p_meta_por_hora: t.metaPorHora,
  });
  if (error) throw new Error(error.message);
}

export async function eliminarTemporada(id: string): Promise<void> {
  const { error } = await getServerClient().rpc('temporada_eliminar', { p_id: id });
  if (error) throw new Error(error.message);
}
