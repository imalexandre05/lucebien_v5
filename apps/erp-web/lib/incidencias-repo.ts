import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';

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

  const nombre = await mapaNombres();
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

// ── Catálogo de tipos de incidencia — administración (Fase 13 tarea 2) ─────────────────────────
// La tabla incidencia_tipos existe desde la 0024 (con RLS de escritura solo admin/dueño vía
// inc_tipos_admin_write → app_es_admin()), pero hasta esta fase no había ninguna UI para crear o
// editar filas — solo se leían (listarTiposIncidencia() arriba, que además filtra activo=true
// porque alimenta el selector del formulario de incidencias). Estas funciones son para la pantalla
// de administración (/configuracion/tipos-incidencia): traen TODAS las filas (activas e inactivas)
// y permiten el CRUD completo. Mismo patrón que lib/producto-tipos-repo.ts (Fase 7).
export type TipoIncidenciaAdmin = TipoIncidencia & { activo: boolean };

export type TipoIncidenciaInput = {
  tipo: string;
  categoria: string;
  nivelDefault: string;
  puntosDefault: number;
};

export async function listarTiposIncidenciaAdmin(): Promise<TipoIncidenciaAdmin[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('incidencia_tipos')
    .select('id, tipo, categoria, nivel_default, puntos_default, activo')
    .order('categoria', { ascending: true })
    .order('tipo', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((t) => ({
    id: String(t.id),
    tipo: String(t.tipo),
    categoria: (t.categoria as string | null) ?? null,
    nivelDefault: String(t.nivel_default ?? 'Medio'),
    puntosDefault: Number(t.puntos_default ?? 0),
    activo: Boolean(t.activo ?? true),
  }));
}

export async function crearTipoIncidencia(p: TipoIncidenciaInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('incidencia_tipos').insert({
    tipo: p.tipo,
    categoria: p.categoria || null,
    nivel_default: p.nivelDefault,
    puntos_default: p.puntosDefault,
  });
  if (error) {
    if (error.code === '23505') throw new Error(`Ya existe un tipo de incidencia llamado "${p.tipo}".`);
    throw new Error(error.message);
  }
}

export async function editarTipoIncidencia(id: string, p: TipoIncidenciaInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('incidencia_tipos')
    .update({ tipo: p.tipo, categoria: p.categoria || null, nivel_default: p.nivelDefault, puntos_default: p.puntosDefault })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error(`Ya existe un tipo de incidencia llamado "${p.tipo}".`);
    throw new Error(error.message);
  }
}

export async function activarTipoIncidencia(id: string, activo: boolean): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('incidencia_tipos').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Borra el tipo del catálogo. `incidencias.tipo` es texto libre (no una FK real a
// incidencia_tipos.tipo — mismo espíritu que producto_tipos con inventario_activo.tipo), así que
// las incidencias YA registradas con este tipo no cambian; solo deja de aparecer como opción del
// catálogo para incidencias nuevas.
export async function eliminarTipoIncidencia(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('incidencia_tipos').delete().eq('id', id);
  if (error) throw new Error(error.message);
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

// Incidencias registradas DESDE un reporte de actividades (side-effect, origen='reporte').
export async function crearIncidenciasDeReporte(p: {
  sede: string;
  fecha: string;
  reporteId: string;
  reportadoPorId: string | null;
  items: { tipo: string; nivel: string; descripcion: string; responsableId: string | null; puntosPenalidad: number }[];
}): Promise<void> {
  if (!p.items.length) return;
  const sb = getServerClient();
  const filas = p.items
    .filter((i) => i.tipo)
    .map((i) => ({
      sede_cod: p.sede,
      fecha: p.fecha,
      tipo: i.tipo,
      descripcion: i.descripcion,
      nivel: i.nivel,
      responsable_id: i.responsableId,
      reportado_por_id: p.reportadoPorId,
      reporte_id: p.reporteId,
      puntos_penalidad: i.puntosPenalidad,
      origen: 'reporte',
    }));
  if (!filas.length) return;
  const { error } = await sb.from('incidencias').insert(filas);
  if (error) throw new Error(error.message);
}
