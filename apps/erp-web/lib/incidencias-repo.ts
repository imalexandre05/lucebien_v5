import { getServerClient } from './supabase/server';

export type Incidencia = {
  id: string;
  sedeCod: string;
  fecha: string;
  tipo: string;
  descripcion: string | null;
  nivel: string;
  responsableId: string | null;
  responsableNombre: string | null;
  reportadoPorId: string | null;
  reportadoPorNombre: string | null;
  reporteId: string | null;
  puntosPenalidad: number;
  origen: string | null;
  createdAt: string;
};

export type TipoIncidencia = {
  id: string;
  tipo: string;
  categoria: string | null;
  nivelDefault: string;
  puntosDefault: number;
};

type Row = {
  id: string;
  sede_cod: string;
  fecha: string;
  tipo: string;
  descripcion: string | null;
  nivel: string;
  responsable_id: string | null;
  reportado_por_id: string | null;
  reporte_id: string | null;
  puntos_penalidad: number | null;
  origen: string | null;
  created_at: string;
};

export async function listarIncidencias(): Promise<Incidencia[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('incidencias')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data as Row[]) ?? [];

  const { data: emps } = await sb.from('empleados').select('id, nombre');
  const nombre = new Map(((emps as { id: string; nombre: string }[]) ?? []).map((e) => [e.id, e.nombre]));
  const n = (id: string | null) => (id ? nombre.get(id) ?? null : null);

  return rows.map((r) => ({
    id: r.id,
    sedeCod: r.sede_cod,
    fecha: (r.fecha ?? '').slice(0, 10),
    tipo: r.tipo,
    descripcion: r.descripcion,
    nivel: r.nivel,
    responsableId: r.responsable_id,
    responsableNombre: n(r.responsable_id),
    reportadoPorId: r.reportado_por_id,
    reportadoPorNombre: n(r.reportado_por_id),
    reporteId: r.reporte_id,
    puntosPenalidad: Number(r.puntos_penalidad ?? 0),
    origen: r.origen,
    createdAt: r.created_at,
  }));
}

export async function listarTiposIncidencia(): Promise<TipoIncidencia[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('incidencia_tipos')
    .select('id, tipo, categoria, nivel_default, puntos_default')
    .eq('activo', true)
    .order('categoria', { ascending: true })
    .order('tipo', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((t) => ({
    id: String(t.id),
    tipo: String(t.tipo),
    categoria: (t.categoria as string | null) ?? null,
    nivelDefault: String(t.nivel_default ?? 'Medio'),
    puntosDefault: Number(t.puntos_default ?? 0),
  }));
}

export async function crearIncidencia(p: {
  sede: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  nivel: string;
  responsableId: string | null;
  reportadoPorId: string | null;
  puntosPenalidad: number;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('incidencias').insert({
    sede_cod: p.sede,
    fecha: p.fecha,
    tipo: p.tipo,
    descripcion: p.descripcion,
    nivel: p.nivel,
    responsable_id: p.responsableId,
    reportado_por_id: p.reportadoPorId,
    puntos_penalidad: p.puntosPenalidad,
    origen: 'manual',
  });
  if (error) throw new Error(error.message);
}

export async function eliminarIncidencia(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('incidencias').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
